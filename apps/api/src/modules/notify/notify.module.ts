import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { NotificationsService } from './notifications.service.js';
import { AfricasTalkingSmsSender, ConsoleSmsSender, SMS_SENDER } from './sms.js';

@Module({
  providers: [
    ConsoleSmsSender,
    {
      provide: SMS_SENDER,
      inject: [APP_CONFIG, ConsoleSmsSender],
      useFactory: (cfg: AppConfig, dev: ConsoleSmsSender) =>
        cfg.SMS_PROVIDER === 'africastalking'
          ? new AfricasTalkingSmsSender({ username: cfg.AT_USERNAME!, apiKey: cfg.AT_API_KEY!, senderId: cfg.AT_SENDER_ID, sandbox: cfg.AT_SANDBOX })
          : dev,
    },
    NotificationsService,
  ],
  exports: [NotificationsService, ConsoleSmsSender],
})
export class NotifyModule {}
