// Many cars at once from a file (D-131). Managers only, because the file can carry import costs, which sales
// staff never see. Two steps: `check` reads every row and says, in plain words, what is wrong with each one;
// `add` adds the rows that are ready, each exactly as if it had been typed on the add-a-car form, and keeps
// what happened to each row. The same file cannot be added twice.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DEALER_IMPORT_MAX_ROWS, normalizeIdentifier, parseDealerImportRow, tidyName, tidySentence, type DealerImportRow } from '@sazo/contracts';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';
import type { Actor } from '../iam/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { DealerRepository, type ImportStage } from './dealer.repository.js';
import { DAILY_LISTINGS, DealerError, DealerService } from './dealer.service.js';

export interface ImportLine { line: number; row: DealerImportRow; problems: string[] }
export interface ImportResult { line: number; stockId?: string; error?: string; costsAdded?: number }
interface ImportRecord {
  id: string; organisationId: string; createdBy: string; fileName: string; rows: ImportLine[]; results: ImportResult[] | null;
  status: 'checked' | 'adding' | 'added'; createdAt: Date; addedAt: Date | null;
}
const COLS = `id, organisation_id AS "organisationId", created_by_user_id AS "createdBy", file_name AS "fileName", rows, results, status,
  created_at AS "createdAt", added_at AS "addedAt"`;

@Injectable()
export class DealerImportService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(DealerService) private readonly dealer: DealerService,
    @Inject(DealerRepository) private readonly repo: DealerRepository,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
  ) {}

  /** Read and check every row; nothing is added. `cells` is one object per row, keyed by column key. */
  async check(actor: Actor, organisationId: string, fileName: string, cells: Record<string, string>[]) {
    if (!cells.length) throw new DealerError('import_empty', 'The file has no cars in it. Use the template and put one car on each row.');
    if (cells.length > DEALER_IMPORT_MAX_ROWS) throw new DealerError('import_too_big', `A file can have up to ${DEALER_IMPORT_MAX_ROWS} cars. Split it into smaller files.`);
    const sha = createHash('sha256').update(JSON.stringify(cells)).digest();
    const done = await this.pool.query(`SELECT 1 FROM dealer.stock_imports WHERE organisation_id = $1 AND file_sha256 = $2 AND status <> 'checked'`, [organisationId, sha]);
    if (done.rowCount) throw new DealerError('import_already_added', 'These cars were already added from this file.');

    const lines: ImportLine[] = cells.map((raw, i) => ({ line: i + 2, ...parseDealerImportRow(raw, true) }));
    // The same car twice in one file.
    const seen = new Map<string, number>();
    for (const l of lines) {
      for (const id of [l.row.vin ?? l.row.chassisNumber, l.row.plate].filter(Boolean).map((x) => normalizeIdentifier(x!))) {
        const first = seen.get(id);
        if (first !== undefined) l.problems.push(`The same car as row ${first}`);
        else seen.set(id, l.line);
      }
    }
    // Already in this dealer's stock.
    for (const l of lines) {
      if (l.problems.length) continue;
      for (const q of [l.row.vin ?? l.row.chassisNumber, l.row.plate].filter(Boolean) as string[]) {
        const found = await this.registry.search(q).catch(() => undefined);
        if (found?.matches.length !== 1) continue;
        const vehicleId = await this.registry.idForRef(found.matches[0]!.vehicleRef);
        if (vehicleId && (await this.repo.live(organisationId, vehicleId))) { l.problems.push('This car is already in your stock'); break; }
      }
    }
    // Today's limit.
    let room = Math.max(0, DAILY_LISTINGS - (await this.repo.listedToday(organisationId)));
    for (const l of lines) {
      if (l.problems.length) continue;
      if (room === 0) l.problems.push(`Over today's limit of ${DAILY_LISTINGS} cars. Add this row tomorrow.`);
      else room -= 1;
    }
    const r = (await this.pool.query<ImportRecord>(
      `INSERT INTO dealer.stock_imports (organisation_id, created_by_user_id, file_name, file_sha256, rows) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [organisationId, actor.userId, fileName.slice(0, 200) || 'cars', sha, JSON.stringify(lines)])).rows[0]!;
    return this.view(r);
  }

  async get(organisationId: string, id: string) {
    const r = (await this.pool.query<ImportRecord>(`SELECT ${COLS} FROM dealer.stock_imports WHERE id = $1`, [id])).rows[0];
    if (!r || r.organisationId !== organisationId) throw new DealerError('import_not_found', 'No such file');
    return this.view(r);
  }

  /** Add every ready row. Runs once per checked file; a second press returns what already happened. */
  async add(actor: Actor, organisationId: string, id: string) {
    await this.get(organisationId, id);
    let claimed: ImportRecord | undefined;
    try {
      claimed = (await this.pool.query<ImportRecord>(
        `UPDATE dealer.stock_imports SET status = 'adding' WHERE id = $1 AND status = 'checked' RETURNING ${COLS}`, [id])).rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new DealerError('import_already_added', 'These cars were already added from this file.');
      throw err;
    }
    if (!claimed) return this.get(organisationId, id);
    const results: ImportResult[] = [];
    for (const l of claimed.rows) {
      if (l.problems.length) continue;
      const row = l.row;
      try {
        const car = await this.dealer.add(actor, organisationId, {
          ...(row.vin ? { vin: row.vin } : row.chassisNumber ? { chassisNumber: row.chassisNumber } : {}), ...(row.plate ? { plate: row.plate } : {}),
          askingPriceUgx: row.askingPriceUgx!, ...(row.notes ? { notes: tidySentence(row.notes) } : {}),
          details: {
            ...(row.make ? { make: tidyName(row.make) } : {}), ...(row.model ? { model: tidyName(row.model) } : {}), ...(row.modelYear ? { modelYear: row.modelYear } : {}), ...(row.kind ? { kind: row.kind } : {}),
            ...(row.engineCc ? { engineCc: row.engineCc } : {}), ...(row.fuel ? { fuel: row.fuel } : {}), ...(row.transmission ? { transmission: row.transmission } : {}),
            ...(row.colour ? { colour: tidyName(row.colour) } : {}), ...(row.yard ? { yard: tidyName(row.yard) } : {}), stage: row.stage as ImportStage,
            ...(row.receivedOn ? { receivedOn: row.receivedOn } : {}), ...(row.bondArrivedOn ? { bondArrivedOn: row.bondArrivedOn } : {}),
          },
        });
        let costsAdded = 0;
        for (const c of row.costs) {
          await this.dealer.addCost(actor, organisationId, car.id, { ...c, note: 'From file' });
          costsAdded += 1;
        }
        results.push({ line: l.line, stockId: car.id, costsAdded });
      } catch (err) {
        results.push({ line: l.line, error: err instanceof DealerError ? err.message : 'SAZO could not add this car. Try it on the add-a-car form.' });
      }
    }
    await this.pool.query(`UPDATE dealer.stock_imports SET status = 'added', results = $2, added_at = now() WHERE id = $1`, [id, JSON.stringify(results)]);
    return this.get(organisationId, id);
  }

  private view(r: ImportRecord) {
    return {
      importId: r.id, fileName: r.fileName, status: r.status, createdAt: new Date(r.createdAt).toISOString(), addedAt: r.addedAt ? new Date(r.addedAt).toISOString() : null,
      ready: r.rows.filter((l) => !l.problems.length).length, withProblems: r.rows.filter((l) => l.problems.length).length,
      rows: r.rows, results: r.results,
    };
  }
}
