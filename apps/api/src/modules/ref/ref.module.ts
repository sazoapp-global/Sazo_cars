import { Module } from '@nestjs/common';
import { ReferenceService } from './reference.service.js';

@Module({ providers: [ReferenceService], exports: [ReferenceService] })
export class ReferenceModule {}
