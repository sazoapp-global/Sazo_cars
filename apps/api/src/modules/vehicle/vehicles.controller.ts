import { Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { badRequest } from '../../platform/problem.js';
import { VehicleRegistry } from './vehicle-registry.service.js';

const SearchQuery = z.object({ q: z.string().trim().min(4).max(32) });

@Controller('vehicles')
export class VehiclesController {
  constructor(
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** GET /v1/vehicles/search?q= — operationId searchVehicles (docs/api/sazo-api-v1.yaml). */
  @Get('search')
  async search(@Query() query: Record<string, unknown>) {
    const parsed = SearchQuery.safeParse(query);
    if (!parsed.success) throw badRequest('invalid_query', 'q must be 4–32 characters (a VIN, chassis number or plate)');
    const result = await this.registry.search(parsed.data.q);
    return { ...result, simulatedDataNotice: this.cfg.SIMULATED_DATA };
  }
}
