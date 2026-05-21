import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { Task } from '../notion/notion.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TelegramService {
  private chatId?: string;
  private readonly logger = new Logger(TelegramService.name);
  private chatsFilePath = path.join(process.cwd(), 'telegram-chats.json');
  private activeChats: Set<number | string> = new Set();

  constructor(
    @InjectBot() private bot: Telegraf<any>,
    private configService: ConfigService,
  ) {
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    this.loadActiveChats();
  }

  private loadActiveChats() {
    try {
      if (fs.existsSync(this.chatsFilePath)) {
        const data = fs.readFileSync(this.chatsFilePath, 'utf8');
        const ids = JSON.parse(data);
        if (Array.isArray(ids)) {
          ids.forEach(id => this.activeChats.add(id));
        }
      }
      // Seed with the env chatId if present
      if (this.chatId && !this.activeChats.has(this.chatId)) {
        this.activeChats.add(this.chatId);
      }
    } catch (error) {
      this.logger.error('Failed to load active chats', error);
    }
  }

  registerChat(chatId: number | string) {
    // Skip if invalid or placeholder from env
    if (!chatId || chatId === '0bLCibRss2VkMDE0') {
      return;
    }
    if (!this.activeChats.has(chatId)) {
      this.activeChats.add(chatId);
      try {
        fs.writeFileSync(this.chatsFilePath, JSON.stringify(Array.from(this.activeChats)), 'utf8');
        this.logger.log(`Registered new active chat: ${chatId}`);
      } catch (error) {
        this.logger.error(`Failed to save active chat: ${chatId}`, error);
      }
    }
  }

  getActiveChats(): (number | string)[] {
    return Array.from(this.activeChats).filter(id => id !== '0bLCibRss2VkMDE0');
  }

  async filterTasksForChat(chatId: string | number, groupedTasks: Record<string, Task[]>): Promise<Record<string, Task[]>> {
    try {
      const chat = await this.bot.telegram.getChat(chatId);
      // @ts-ignore
      const title = chat.title;
      if (!title) {
        return groupedTasks; // Private chat, do not filter, show everything
      }

      const filtered: Record<string, Task[]> = {};
      const titleLower = title.toLowerCase();

      for (const [project, tasks] of Object.entries(groupedTasks)) {
        const projectLower = project.toLowerCase();
        // Check if group name contains the project name, or vice versa
        if (titleLower.includes(projectLower) || projectLower.includes(titleLower)) {
          filtered[project] = tasks;
        }
      }
      return filtered;
    } catch (error) {
      this.logger.error(`Failed to get chat info or filter tasks for chat ${chatId}`, error);
      return groupedTasks; // Fallback to returning all tasks on error
    }
  }

  async sendMorningReport(groupedTasks: Record<string, Task[]>, customChatId?: string | number) {
    const targetChatId = customChatId || this.chatId;
    if (!targetChatId) {
      this.logger.error('Cannot send morning report: No target Chat ID provided.');
      return;
    }

    const filteredTasks = await this.filterTasksForChat(targetChatId, groupedTasks);

    if (Object.keys(filteredTasks).length === 0) {
      await this.bot.telegram.sendMessage(targetChatId, '🌅 <b>Morning Report</b>\n\nNo tasks due today. Have a great day!', { parse_mode: 'HTML' });
      return;
    }

    let message = '🌅 <b>Daily Plan: Tasks Due Today</b>\n\n';

    for (const [project, tasks] of Object.entries(filteredTasks)) {
      message += `<b>🚀 Project: ${project}</b>\n`;
      tasks.forEach((task) => {
        let dueDateStr = '';
        if (task.dueDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = new Date(task.dueDate);
          due.setHours(0, 0, 0, 0);
          
          const diffTime = due.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays < 0) {
            dueDateStr = `\n   🔴 <b>OVERDUE by ${Math.abs(diffDays)} day(s)!</b>`;
          } else if (diffDays === 0) {
            dueDateStr = `\n   🟠 <b>DUE TODAY!</b>`;
          } else {
            dueDateStr = `\n   ⏳ Due in ${diffDays} day(s)`;
          }
        }

        message += `🔹 ${task.taskName}${dueDateStr}\n`;
        if (task.labels.length > 0) {
          message += `   <i>Tags:</i> ${task.labels.map(l => `#${l.replace(/\s+/g, '_')}`).join(' ')}\n`;
        }
        if (task.description) {
          message += `   <i>Description:</i> ${task.description}\n`;
        }
        message += `\n`;
      });
    }

    try {
      await this.bot.telegram.sendMessage(targetChatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Failed to send morning report', error);
    }
  }

  async sendEveningReport(groupedTasks: Record<string, Task[]>, customChatId?: string | number) {
    const targetChatId = customChatId || this.chatId;
    if (!targetChatId) {
      this.logger.error('Cannot send evening report: No target Chat ID provided.');
      return;
    }

    const filteredTasks = await this.filterTasksForChat(targetChatId, groupedTasks);

    if (Object.keys(filteredTasks).length === 0) {
      await this.bot.telegram.sendMessage(targetChatId, '🌙 <b>Evening Report</b>\n\nNo tasks were completed today.', { parse_mode: 'HTML' });
      return;
    }

    let message = '🌙 <b>Daily Summary: Tasks Completed Today</b>\n\n';

    for (const [project, tasks] of Object.entries(filteredTasks)) {
      message += `<b>✅ Project: ${project}</b>\n`;
      tasks.forEach((task) => {
        message += `✔️ ${task.taskName}\n`;
      });
      message += `\n`;
    }

    try {
      await this.bot.telegram.sendMessage(targetChatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Failed to send evening report', error);
    }
  }
}
