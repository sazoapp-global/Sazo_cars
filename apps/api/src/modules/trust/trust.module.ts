import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/index.js';
import { ObservationsModule } from '../obs/index.js';
import { ReferenceModule } from '../ref/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { TrustService } from './trust.service.js';

@Module({
  imports: [VehicleModule, ObservationsModule, IngestModule, ReferenceModule],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}
