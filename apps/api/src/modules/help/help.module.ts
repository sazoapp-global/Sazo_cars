import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { NotifyModule } from '../notify/index.js';
import { HelpController } from './help.controller.js';
import { HelpService } from './help.service.js';

@Module({
  imports: [IamModule, NotifyModule],
  controllers: [HelpController],
  providers: [HelpService],
})
export class HelpModule {}
