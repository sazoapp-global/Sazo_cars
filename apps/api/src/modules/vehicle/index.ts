// Public interface of the Vehicle Registry module. Other modules may import ONLY from this file
// (enforced by `npm run lint:boundaries`).
export { VehicleModule } from './vehicle.module.js';
export { VehicleRegistry, type SearchOutcome, type VehicleCard } from './vehicle-registry.service.js';
