// GET /v1/cars-for-sale: cars approved dealers have in stock, so a buyer can pick two or three to compare.
// Signed-in buyers only (comparing needs an account); nothing confidential (sale price, notes, staff).
import { Controller, Get, Inject } from '@nestjs/common';
import { DealerService } from './dealer.service.js';

@Controller('cars-for-sale')
export class ForSaleController {
  constructor(@Inject(DealerService) private readonly dealer: DealerService) {}

  /** operationId listCarsForSale */
  @Get()
  async list() {
    return { items: await this.dealer.forSale() };
  }
}
