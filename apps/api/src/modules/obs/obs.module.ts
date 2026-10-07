import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { AttestationsService } from './attestations.service.js';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { LocalObjectStore, OBJECT_STORE } from './evidence-store.js';
import { ObservationsService } from './observations.service.js';
import { PartiesService } from './parties.service.js';

@Module({
  controllers: [EvidenceController],
  providers: [
    ObservationsService,
    EvidenceService,
    PartiesService,
    AttestationsService,
    { provide: OBJECT_STORE, inject: [APP_CONFIG], useFactory: (cfg: AppConfig) => new LocalObjectStore(cfg.EVIDENCE_DIR) },
  ],
  exports: [ObservationsService, EvidenceService, PartiesService, AttestationsService],
})
export class ObservationsModule {}
