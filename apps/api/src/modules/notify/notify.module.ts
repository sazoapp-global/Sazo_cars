import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { NotificationsService } from './notifications.service.js';
import { ConsoleEmailSender, EMAIL_SENDER, SesEmailSender } from './email.js';
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
    ConsoleEmailSender,
    {
      provide: EMAIL_SENDER,
      inject: [APP_CONFIG, ConsoleEmailSender],
      useFactory: (cfg: AppConfig, dev: ConsoleEmailSender) =>
        cfg.EMAIL_PROVIDER === 'ses' ? new SesEmailSender({ from: cfg.EMAIL_FROM, region: cfg.AWS_REGION }) : dev,
    },
    NotificationsService,
  ],
  exports: [NotificationsService, ConsoleSmsSender, ConsoleEmailSender],
})
export class NotifyModule {}
