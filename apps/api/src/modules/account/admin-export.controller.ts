// GET /v1/admin/users/export?phone=+256…: a person's data as a JSON file, for SAZO administrators only.
// People see their own data on the website (Your data held by SAZO) and save it as PDF.
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, RequirePermission, type Actor } from '../iam/index.js';
import { AccountService } from './account.service.js';

const Phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);

@Controller('admin/users')
export class AdminExportController {
  constructor(@Inject(AccountService) private readonly account: AccountService) {}

  /** operationId adminExportUserData */
  @Get('export')
  @RequirePermission('user.data.export')
  async export(@CurrentActor() actor: Actor, @Query('phone') phone: unknown) {
    const p = Phone.safeParse(phone);
    if (!p.success) throw badRequest('invalid_query', 'phone must be in international format, for example +256772123456');
    const data = await this.account.exportByAdmin(actor, p.data);
    if (!data) throw notFound('user_not_found', 'No SAZO account uses this number');
    return data;
  }
}
