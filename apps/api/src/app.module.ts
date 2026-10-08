import { type DynamicModule, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config.js';
import { AccountModule } from './modules/account/index.js';
import { CommunityModule } from './modules/community/index.js';
import { ConcernModule } from './modules/concern/index.js';
import { DealerModule } from './modules/dealer/index.js';
import { GarageModule } from './modules/garage/index.js';
import { IamModule } from './modules/iam/index.js';
import { InspectionModule } from './modules/inspection/index.js';
import { IngestModule } from './modules/ingest/index.js';
import { NotifyModule } from './modules/notify/index.js';
import { ObservationsModule } from './modules/obs/index.js';
import { ReferenceModule } from './modules/ref/index.js';
import { ReportModule } from './modules/report/index.js';
import { TrustModule } from './modules/trust/index.js';
import { VehicleModule } from './modules/vehicle/index.js';
import { DatabaseModule } from './platform/database.module.js';
import { HealthController } from './platform/health.controller.js';

/**
 * The SAZO modular monolith (D-080). Module build order (D-083):
 * 1 iam ✔ · 2 vehicle ✔ · 3 ingest ✔ · 4 obs ✔ · 5 trust ✔ · 6 report ✔ · 7 garage ✔ · inspection ✔ (P-004) · dealer ✔ (P-005) · 8 notify (SMS) · 9 ref (partial) · 10 community ✔ · 11 admin
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
        NotifyModule,
        IamModule,
        VehicleModule,
        ObservationsModule,
        IngestModule,
        ReferenceModule,
        TrustModule,
        ReportModule,
        GarageModule,
        InspectionModule,
        DealerModule,
        ConcernModule,
        CommunityModule,
        AccountModule,
      ],
      controllers: [HealthController],
    };
  }
}
