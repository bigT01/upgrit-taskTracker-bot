import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotionService } from '../notion/notion.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly notionService: NotionService,
    private readonly telegramService: TelegramService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Almaty' }) 
  async handleMorningReport() {
    this.logger.log('Executing Morning Report Cron...');
    try {
      const chats = this.telegramService.getActiveChats();
      if (chats.length === 0) {
        this.logger.warn('No active chats registered yet. Skipping morning report.');
        return;
      }
      
      const tasks = await this.notionService.getTasksForToday(false);
      for (const chatId of chats) {
        await this.telegramService.sendMorningReport(tasks, chatId);
      }
      this.logger.log(`Morning report sent successfully to ${chats.length} chat(s).`);
    } catch (error) {
      this.logger.error('Error during morning report execution', error);
    }
  }

  @Cron('0 19 * * *', { timeZone: 'Asia/Almaty' }) 
  async handleEveningReport() {
    this.logger.log('Executing Evening Report Cron...');
    try {
      const chats = this.telegramService.getActiveChats();
      if (chats.length === 0) {
        this.logger.warn('No active chats registered yet. Skipping evening report.');
        return;
      }

      const tasks = await this.notionService.getTasksForToday(true);
      for (const chatId of chats) {
        await this.telegramService.sendEveningReport(tasks, chatId);
      }
      this.logger.log(`Evening report sent successfully to ${chats.length} chat(s).`);
    } catch (error) {
      this.logger.error('Error during evening report execution', error);
    }
  }
}
