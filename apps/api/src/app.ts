import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config.js';
import { ProblemFilter } from './platform/problem.js';

/** Build the HTTP app (used by main.ts and by tests). All routes live under /v1. */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: config.NODE_ENV === 'test' ? false : undefined });
  app.setGlobalPrefix('v1');
  // The website and load balancer sit in front of the API on a private network: trust their X-Forwarded-For,
  // so log-in records and alerts show the person's address, not the website server's (D-111).
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: string) => void }).set('trust proxy', 'loopback, linklocal, uniquelocal');
  // Evidence bytes arrive as a raw body (image/PDF), up to 15 MB (API Outline §5.6).
  app.use('/v1/evidence/uploads', raw({ type: (req) => !String(req.headers['content-type'] ?? '').includes('json'), limit: '15mb' }));
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
