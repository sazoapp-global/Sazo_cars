import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { ObservationsModule } from '../obs/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { ConcernController } from './concern.controller.js';
import { ConcernService } from './concern.service.js';

@Module({
  imports: [IamModule, VehicleModule, ObservationsModule],
  controllers: [ConcernController],
  providers: [ConcernService],
  exports: [ConcernService],
})
export class ConcernModule {}
