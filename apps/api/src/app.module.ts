import { type DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config.js';
import { IngestModule } from './modules/ingest/index.js';
import { ObservationsModule } from './modules/obs/index.js';
import { ReferenceModule } from './modules/ref/index.js';
import { ReportModule } from './modules/report/index.js';
import { TrustModule } from './modules/trust/index.js';
import { VehicleModule } from './modules/vehicle/index.js';
import { DatabaseModule } from './platform/database.module.js';
import { HealthController } from './platform/health.controller.js';

/**
 * The SAZO modular monolith (D-080). Module build order (D-083):
 * 1 iam · 2 vehicle ✔ · 3 ingest ✔ · 4 obs ✔ · 5 trust ✔ · 6 report ✔ · 7 garage · 8 notify · 9 ref (partial) · 10 community · 11 admin
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        {
          module: class ConfigModule {},
          global: true,
          providers: [{ provide: APP_CONFIG, useValue: config }],
          exports: [APP_CONFIG],
        },
        DatabaseModule,
        VehicleModule,
        ObservationsModule,
        IngestModule,
        ReferenceModule,
        TrustModule,
        ReportModule,
      ],
      controllers: [HealthController],
    };
  }
}
