// GET /v1/stats — real numbers for the website (replaces the illustrative figures in the designs, D-006).
import { Controller, Get, Header, Inject } from '@nestjs/common';
import { IamService, Public } from '../iam/index.js';
import { ObservationsService } from '../obs/index.js';
import { VehicleRegistry } from '../vehicle/index.js';

@Controller('stats')
export class StatsController {
  constructor(
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async stats() {
    const [vehicles, records, businesses] = await Promise.all([this.registry.countActive(), this.observations.countAll(), this.iam.approvedCounts()]);
    const n = (...types: string[]) => types.reduce((t, k) => t + (businesses[k] ?? 0), 0);
    return { vehicles, records, garages: n('garage'), inspectors: n('inspector', 'inspection_centre'), dealers: n('dealer') };
  }
}
