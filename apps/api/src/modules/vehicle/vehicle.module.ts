import { Module } from '@nestjs/common';
import { VehicleRepository } from './vehicle.repository.js';
import { VehicleRegistry } from './vehicle-registry.service.js';

@Module({
  providers: [VehicleRepository, VehicleRegistry],
  exports: [VehicleRegistry],
})
export class VehicleModule {}
