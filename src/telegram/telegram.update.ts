import { Update, Start, Ctx, Command } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { NotionService } from '../notion/notion.service';
import { TelegramService } from './telegram.service';

@Update()
export class TelegramUpdate {
  constructor(
    private readonly notionService: NotionService,
    private readonly telegramService: TelegramService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    if (ctx.chat) this.telegramService.registerChat(ctx.chat.id);
    await ctx.reply('👋 Hello! The Nest.js bot is successfully connected and listening to your commands!');
  }

  @Command('ping')
  async onPing(@Ctx() ctx: Context) {
    if (ctx.chat) this.telegramService.registerChat(ctx.chat.id);
    const chatId = ctx.chat?.id || 'Unknown';
    await ctx.reply(`🏓 Pong! The bot is online.\n\n💬 <b>Chat ID:</b> <code>${chatId}</code>`, { parse_mode: 'HTML' });
  }

  @Command('notion')
  async onNotionCheck(@Ctx() ctx: Context) {
    if (ctx.chat) this.telegramService.registerChat(ctx.chat.id);
    await ctx.reply('⏳ Checking Notion connection...');
    const result = await this.notionService.checkConnection();
    await ctx.reply(result, { parse_mode: 'HTML' });
  }

  @Command('pending')
  async onPendingCheck(@Ctx() ctx: Context) {
    if (!ctx.chat) {
      await ctx.reply('❌ This command can only be used within a chat.');
      return;
    }
    this.telegramService.registerChat(ctx.chat.id);

    await ctx.reply('⏳ Fetching "Not Started" projects from Notion...');
    try {
      const groupedTasks = await this.notionService.getNotStartedTasks();

      // Filter tasks by group name/title if in a group
      const filteredTasks = await this.telegramService.filterTasksForChat(ctx.chat.id, groupedTasks);

      if (Object.keys(filteredTasks).length === 0) {
        await ctx.reply('🎉 Good news! There are no matching "Not Started" tasks right now.', { parse_mode: 'HTML' });
        return;
      }

      let message = '📋 <b>Projects & Tasks Not Started</b>\n\n';
      
      for (const [project, tasks] of Object.entries(filteredTasks)) {
        message += `<b>🚀 Project: ${project}</b>\n`;
        tasks.forEach((task) => {
          message += `🔹 ${task.taskName}\n`;
          if (task.labels.length > 0) {
            message += `   <i>Tags:</i> ${task.labels.map(l => `#${l.replace(/\s+/g, '_')}`).join(' ')}\n`;
          }
          if (task.description) {
            message += `   <i>Description:</i> ${task.description}\n`;
          }
          message += `\n`;
        });
      }

      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      await ctx.reply('❌ Failed to fetch "Not Started" tasks. Check your server logs.');
    }
  }

  @Command('morning')
  async onMorningCheck(@Ctx() ctx: Context) {
    if (!ctx.chat) {
      await ctx.reply('❌ This command can only be used within a chat.');
      return;
    }
    this.telegramService.registerChat(ctx.chat.id);
    await ctx.reply('⏳ Generating morning report from Notion...');
    try {
      const groupedTasks = await this.notionService.getTasksForToday(false); // false = not completed (due today)
      await this.telegramService.sendMorningReport(groupedTasks, ctx.chat.id);
    } catch (error) {
      await ctx.reply('❌ Failed to generate morning report. Check your server logs.');
    }
  }

  @Command('evening')
  async onEveningCheck(@Ctx() ctx: Context) {
    if (!ctx.chat) {
      await ctx.reply('❌ This command can only be used within a chat.');
      return;
    }
    this.telegramService.registerChat(ctx.chat.id);
    await ctx.reply('⏳ Generating evening report from Notion...');
    try {
      const groupedTasks = await this.notionService.getTasksForToday(true); // true = completed today
      await this.telegramService.sendEveningReport(groupedTasks, ctx.chat.id);
    } catch (error) {
      await ctx.reply('❌ Failed to generate evening report. Check your server logs.');
    }
  }
}
