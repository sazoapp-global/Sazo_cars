import { Module } from '@nestjs/common';
import { ObservationsService } from './observations.service.js';

@Module({ providers: [ObservationsService], exports: [ObservationsService] })
export class ObservationsModule {}
