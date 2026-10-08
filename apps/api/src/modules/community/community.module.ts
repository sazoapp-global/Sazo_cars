import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { ReferenceModule } from '../ref/index.js';
import { ReportModule } from '../report/index.js';
import { CommunityController } from './community.controller.js';
import { CommunityService } from './community.service.js';

@Module({
  imports: [IamModule, ReferenceModule, ReportModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
