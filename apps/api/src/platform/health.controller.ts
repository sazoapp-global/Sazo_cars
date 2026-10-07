import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import pg from 'pg';
import { Public } from '../modules/iam/index.js';
import { DB_POOL } from './tokens.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, string> = {};
    try {
      await this.pool.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'unreachable';
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', checks };
  }
}
