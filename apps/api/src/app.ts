import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config.js';
import { ProblemFilter } from './platform/problem.js';

/** Build the HTTP app (used by main.ts and by tests). All routes live under /v1. */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: config.NODE_ENV === 'test' ? false : undefined });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
