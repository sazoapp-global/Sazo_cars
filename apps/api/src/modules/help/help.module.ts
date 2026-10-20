import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { HelpController } from './help.controller.js';
import { HelpService } from './help.service.js';

@Module({
  imports: [IamModule],
  controllers: [HelpController],
  providers: [HelpService],
})
export class HelpModule {}
