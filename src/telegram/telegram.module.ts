import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotionModule } from '../notion/notion.module';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';

@Module({
  imports: [ConfigModule, NotionModule],
  providers: [TelegramService, TelegramUpdate],
  exports: [TelegramService],
})
export class TelegramModule {}
