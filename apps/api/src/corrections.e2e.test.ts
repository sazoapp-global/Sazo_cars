// P-05: a data partner corrects or withdraws a record it already sent. Nothing is edited: a correction is a
// new record linked to the old one, a withdrawal is a relation with the sender's reason. Both stop the old
// record counting. Skipped when TEST_DATABASE_URL is not set.
import { randomBytes, randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { AuthService, IamService } from './modules/iam/index.js';
import { IngestionService } from './modules/ingest/index.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('partner corrections and withdrawals (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const pool = new pg.Pool({ connectionString: url });
  const tag = randomBytes(3).toString('hex').toUpperCase();
  const code = `RGC${tag}`;
  const otherCode = `RGO${tag}`;
  const chassis = `NZE121${tag}9`;
  let asOperator: Record<string, string> = {};
  let asOther: Record<string, string> = {};
  let asAdmin: Record<string, string> = {};
  let n = 0;
  const phone = () => `+25677${String(randomInt(1e7)).padStart(7, '0')}`;
  const key = () => `0192a000-0000-7000-8000-${tag.toLowerCase()}${String(++n).padStart(6, '0')}`;

  const reading = (km: number, corrects?: string) => ({
    type: 'odometer_reading', attributes: { km, originalValue: km, originalUnit: 'km' }, time: { at: '2026-05-02T10:00:00+03:00', precision: 'day' },
    ...(corrects ? { correctsObservationId: corrects } : {}),
  });
  const send = (headers: Record<string, string>, source: string, record: object) =>
    http.post('/v1/ingest/submissions').set(headers).set('Idempotency-Key', key()).set('X-Source-Code', source)
      .send({ schemaVersion: 1, items: [{ identifiers: { chassisNumber: chassis }, records: [record] }] });

  beforeAll(async () => {
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url }));
    await app.init();
    http = request(app.getHttpServer());
    const iam = app.get(IamService);
    const ingestion = app.get(IngestionService);
    const auth = app.get(AuthService);
    const mkSource = async (c: string) => {
      const org = await pool.query<{ id: string }>(`INSERT INTO iam.organisations (type, legal_name, status, approved_at) VALUES ('importer', $1, 'approved', now()) RETURNING id`, [`Registry ${c}`]);
      await ingestion.upsertSource({ code: c, name: `Registry ${c}`, organisationId: org.rows[0]!.id, domain: 'registration', channel: 'partner_portal',
        isSimulated: true, evidenceClass: 'official', baselineReputation: 0.9, coverage: [] });
      return org.rows[0]!.id;
    };
    const orgId = await mkSource(code);
    const otherOrg = await mkSource(otherCode);
    const operator = await iam.ensureUser(phone(), 'Correct Operator');
    await iam.addMember(operator, orgId, 'partner_operator');
    const other = await iam.ensureUser(phone(), 'Other Operator');
    await iam.addMember(other, otherOrg, 'partner_operator');
    const admin = await iam.ensureUser('+256700000981', 'Corrections Admin', 'sazo_admin');
    asOperator = { Authorization: `Bearer ${(await auth.issueTokens(operator)).accessToken}` };
    asOther = { Authorization: `Bearer ${(await auth.issueTokens(other)).accessToken}` };
    asAdmin = { Authorization: `Bearer ${(await auth.issueTokens(admin)).accessToken}` };
  });

  afterAll(async () => {
    await pool.end();
    await app?.close();
  });

  const records = async () => (await http.get(`/v1/ingest/sources/${code}/records`).set(asOperator).expect(200)).body.items as {
    id: string; state: string; corrects: string | null; correctedBy: string | null; withdrawReason: string | null; vehicleRef: string; attributes: { km: number };
  }[];

  it('corrects a record with a new one and keeps the old one in the history', async () => {
    const first = await send(asOperator, code, reading(150000)).expect(202);
    expect(first.body.items[0].status).toBe('accepted');
    const [old] = await records();
    expect(old).toMatchObject({ state: 'active', attributes: { km: 150000 }, corrects: null, identifiers: { chassisNumber: chassis } });

    const fixed = await send(asOperator, code, reading(15000, old!.id)).expect(202);
    expect(fixed.body.items[0].status).toBe('accepted');
    const list = await records();
    const newer = list.find((r) => r.corrects === old!.id)!;
    expect(newer).toMatchObject({ state: 'active', attributes: { km: 15000 } });
    expect(list.find((r) => r.id === old!.id)).toMatchObject({ state: 'corrected', correctedBy: newer.id });

    // A corrected record cannot be corrected again; correct the newer one instead.
    const again = await send(asOperator, code, reading(16000, old!.id)).expect(202);
    expect(again.body.items[0]).toMatchObject({ status: 'rejected', errors: [expect.objectContaining({ code: 'record_not_active' })] });
    // A correction must be the same kind of record.
    const wrongType = await send(asOperator, code, { type: 'usage_declared', attributes: { usage: 'private' }, time: reading(1).time, correctsObservationId: newer.id }).expect(202);
    expect(wrongType.body.items[0].errors[0].code).toMatch(/correction_type_mismatch|invalid_record/);
    // Another source cannot correct this source's record.
    const foreign = await send(asOther, otherCode, reading(1, newer.id)).expect(202);
    expect(foreign.body.items[0]).toMatchObject({ status: 'rejected', errors: [expect.objectContaining({ code: 'record_not_found' })] });

    // The old record no longer counts on the car's report.
    const ledger = await pollLedger(newer.vehicleRef, old!.id);
    expect(ledger).toMatchObject({ excluded: true, exclusionReason: 'corrected' });
  });

  it('withdraws a record with a reason, once, and only for its own source', async () => {
    const newer = (await records()).find((r) => r.state === 'active' && r.corrects)!;
    await http.post(`/v1/ingest/sources/${code}/records/${newer.id}/withdraw`).set(asOperator).send({ reason: 'no' }).expect(400);
    await http.post(`/v1/ingest/sources/${otherCode}/records/${newer.id}/withdraw`).set(asOther).send({ reason: 'Sent by mistake' }).expect(404);
    await http.post(`/v1/ingest/sources/${code}/records/${newer.id}/withdraw`).set(asOther).send({ reason: 'Sent by mistake' }).expect(404);
    const done = await http.post(`/v1/ingest/sources/${code}/records/${newer.id}/withdraw`).set(asOperator).send({ reason: 'Sent for the wrong car' }).expect(200);
    expect(done.body).toEqual({ observationId: newer.id, state: 'withdrawn' });
    await http.post(`/v1/ingest/sources/${code}/records/${newer.id}/withdraw`).set(asOperator).send({ reason: 'Sent for the wrong car' }).expect(409);
    expect((await records()).find((r) => r.id === newer.id)).toMatchObject({ state: 'withdrawn', withdrawReason: 'Sent for the wrong car' });
    // A withdrawn record cannot be corrected.
    const late = await send(asOperator, code, reading(17000, newer.id)).expect(202);
    expect(late.body.items[0].errors[0].code).toBe('record_not_active');
    const ledger = await pollLedger(newer.vehicleRef, newer.id);
    expect(ledger).toMatchObject({ excluded: true, exclusionReason: 'retracted' });
    // The history still holds both records: nothing was deleted.
    const stored = await pool.query('SELECT count(*)::int AS n FROM obs.observations o JOIN ingest.sources s ON s.id = o.source_id WHERE s.code = $1', [code]);
    expect(stored.rows[0].n).toBe(2);
  });

  it('only people of the source see its records', async () => {
    await http.get(`/v1/ingest/sources/${code}/records`).set(asOther).expect(404);
    await http.get(`/v1/ingest/sources/${code}/records`).set(asAdmin).expect(200);
  });

  async function pollLedger(ref: string, observationId: string) {
    for (let i = 0; i < 40; i++) {
      const items = (await http.get(`/v1/vehicles/${ref}/evidence`).set(asAdmin).expect(200)).body.items as { observationId: string; excluded: boolean }[];
      const hit = items.find((x) => x.observationId === observationId);
      if (hit?.excluded) return hit;
      await new Promise((r) => setTimeout(r, 100));
    }
    return (await http.get(`/v1/vehicles/${ref}/evidence`).set(asAdmin)).body.items.find((x: { observationId: string }) => x.observationId === observationId);
  }
});
