import { Module } from '@nestjs/common';
import { NotionModule } from '../notion/notion.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [NotionModule, TelegramModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
