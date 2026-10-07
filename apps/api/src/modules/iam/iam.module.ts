import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NotifyModule } from '../notify/index.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { IamRepository } from './iam.repository.js';
import { IamService } from './iam.service.js';
import { OrganisationsController } from './organisations.controller.js';

@Module({
  imports: [NotifyModule],
  controllers: [AuthController, OrganisationsController],
  providers: [IamRepository, AuthService, IamService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, IamService],
})
export class IamModule {}
