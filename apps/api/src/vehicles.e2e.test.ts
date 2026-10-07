// End-to-end: real Nest app + real Postgres (migrated). Skipped when TEST_DATABASE_URL is not set.
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const url = process.env.TEST_DATABASE_URL;
const V = {
  premio: '0192a000-0000-7000-8000-00000000e801',
  harrier: '0192a000-0000-7000-8000-00000000e802',
  probox: '0192a000-0000-7000-8000-00000000e809',
  merc: '0192a000-0000-7000-8000-00000000e826',
};

describe.skipIf(!url)('vehicle search (e2e)', () => {
  let app: INestApplication;
  const pool = new pg.Pool({ connectionString: url });

  const cleanup = async () => {
    await pool.query('DELETE FROM vehicle.vehicle_identifiers WHERE vehicle_id = ANY($1)', [Object.values(V)]);
    await pool.query('DELETE FROM vehicle.vehicles WHERE id = ANY($1)', [Object.values(V)]);
  };

  beforeAll(async () => {
    await cleanup();
    await pool.query(`INSERT INTO vehicle.vehicles (id, public_ref, status) VALUES
      ($1,'SZV-E2E0-0801','active'), ($2,'SZV-E2E0-0802','active'), ($3,'SZV-E2E0-0809','active'), ($4,'SZV-E2E0-0826','active')`,
      [V.premio, V.harrier, V.probox, V.merc]);
    await pool.query(`INSERT INTO vehicle.vehicle_identifiers (vehicle_id, type, value_raw, value_normalized, status, valid_from) VALUES
      ($1,'chassis_number','NZT260-3011111','NZT2603011111','active',NULL),
      ($1,'registration_plate','UAX 123A','UAX123A','disputed','2015-04-01'),
      ($2,'chassis_number','ZSU60-0099999','ZSU600099999','active',NULL),
      ($2,'registration_plate','UBF 778B','UBF778B','active','2021-02-01'),
      ($2,'registration_plate','UAX 123A','UAX123A','disputed','2025-03-10'),
      ($3,'registration_plate','UAR 902C','UAR902C','historical','2016-02-03'),
      ($3,'registration_plate','UBQ 330D','UBQ330D','active','2025-05-05'),
      ($4,'vin','WDD2050042F123456','WDD2050042F123456','active',NULL)`,
      [V.premio, V.harrier, V.probox, V.merc]);
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url }));
    await app.init();
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
    await app?.close();
  });

  it('GET /v1/health reports the database is reachable', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('S08: a cloned plate returns BOTH vehicles with a serious banner — never picks one', async () => {
    const res = await request(app.getHttpServer()).get('/v1/vehicles/search').query({ q: 'uax 123a' }).expect(200);
    expect(res.body.outcome).toBe('multiple');
    expect(res.body.queryKind).toBe('plate');
    expect(res.body.matches.map((m: { vehicleRef: string }) => m.vehicleRef).sort()).toEqual(['SZV-E2E0-0801', 'SZV-E2E0-0802']);
    for (const m of res.body.matches) expect(m.banner.severity).toBe('serious');
    expect(res.body.simulatedDataNotice).toBe(true);
  });

  it('S09: the old plate still finds the vehicle, labelled as a previous plate', async () => {
    const res = await request(app.getHttpServer()).get('/v1/vehicles/search').query({ q: 'UAR 902C' }).expect(200);
    expect(res.body.outcome).toBe('found');
    expect(res.body.matches[0]).toMatchObject({ vehicleRef: 'SZV-E2E0-0809', matchedOn: 'previous_plate', currentPlate: 'UBQ 330D' });
  });

  it('S26: a VIN typed with O instead of 0 is not found but gets a "did you mean" suggestion', async () => {
    const res = await request(app.getHttpServer()).get('/v1/vehicles/search').query({ q: 'WDD2O5OO42F123456' }).expect(200);
    expect(res.body.outcome).toBe('not_found');
    expect(res.body.suggestion).toMatchObject({ query: 'WDD2050042F123456', match: { vehicleRef: 'SZV-E2E0-0826' } });
  });

  it('chassis numbers match with or without the dash', async () => {
    const res = await request(app.getHttpServer()).get('/v1/vehicles/search').query({ q: 'ZSU60-0099999' }).expect(200);
    expect(res.body).toMatchObject({ outcome: 'found', queryKind: 'chassis' });
  });

  it('nonsense input is "invalid", not "not found"', async () => {
    const res = await request(app.getHttpServer()).get('/v1/vehicles/search').query({ q: 'hello there' }).expect(200);
    expect(res.body.outcome).toBe('invalid');
  });

  it('a missing query returns an RFC 9457 problem with a stable code', async () => {
    const res = await request(app.getHttpServer()).get('/v1/vehicles/search').expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 400, code: 'invalid_query' });
  });
});
