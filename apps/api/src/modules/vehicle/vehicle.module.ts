import { Module } from '@nestjs/common';
import { VehicleRepository } from './vehicle.repository.js';
import { VehicleRegistry } from './vehicle-registry.service.js';
import { VehiclesController } from './vehicles.controller.js';

@Module({
  controllers: [VehiclesController],
  providers: [VehicleRepository, VehicleRegistry],
  exports: [VehicleRegistry],
})
export class VehicleModule {}
