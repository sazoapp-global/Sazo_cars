import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/index.js';
import { IamModule } from '../iam/index.js';
import { NotifyModule } from '../notify/index.js';
import { ObservationsModule } from '../obs/index.js';
import { ReportModule } from '../report/index.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';

@Module({
  imports: [IamModule, ObservationsModule, ReportModule, CommunityModule, NotifyModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
