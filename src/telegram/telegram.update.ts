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

  @Command('status')
  async onStatusUpdate(@Ctx() ctx: Context) {
    if (!ctx.chat) {
      await ctx.reply('❌ This command can only be used within a chat.');
      return;
    }
    this.telegramService.registerChat(ctx.chat.id);

    // @ts-ignore
    const text = ctx.message?.text || '';
    const match = text.match(/^\/status\s+(.+)\s*\|\s*(.+)$/i);

    if (!match) {
      await ctx.reply('❌ Invalid format. Please use: <code>/status Task Title | New Status</code>\nExample: <code>/status login button | Done</code>', { parse_mode: 'HTML' });
      return;
    }

    const titleFragment = match[1].trim();
    const newStatus = match[2].trim();

    await ctx.reply(`⏳ Searching for task matching "<b>${titleFragment}</b>"...`, { parse_mode: 'HTML' });
    try {
      const resultMessage = await this.notionService.updateTaskStatusByTitle(titleFragment, newStatus);
      await ctx.reply(resultMessage, { parse_mode: 'HTML' });
    } catch (error) {
      await ctx.reply('❌ Failed to update task status. Check your server logs.');
    }
  }

  @Command('done')
  async onDoneUpdate(@Ctx() ctx: Context) {
    if (!ctx.chat) {
      await ctx.reply('❌ This command can only be used within a chat.');
      return;
    }
    this.telegramService.registerChat(ctx.chat.id);

    // @ts-ignore
    const text = ctx.message?.text || '';
    const match = text.match(/^\/done\s+(.+)$/i);

    if (!match) {
      await ctx.reply('❌ Invalid format. Please use: <code>/done Task Title</code>\nExample: <code>/done login button</code>', { parse_mode: 'HTML' });
      return;
    }

    const titleFragment = match[1].trim();

    await ctx.reply(`⏳ Marking task matching "<b>${titleFragment}</b>" as Done...`, { parse_mode: 'HTML' });
    try {
      const resultMessage = await this.notionService.updateTaskStatusByTitle(titleFragment, 'done');
      await ctx.reply(resultMessage, { parse_mode: 'HTML' });
    } catch (error) {
      await ctx.reply('❌ Failed to update task status. Check your server logs.');
    }
  }

  @Command(['help', 'info'])
  async onHelpCommand(@Ctx() ctx: Context) {
    if (ctx.chat) this.telegramService.registerChat(ctx.chat.id);
    
    const helpMessage = `
🤖 <b>Available Commands</b>

<b>General</b>
🔹 /start - Start the bot
🔹 /ping - Check bot status & get Chat ID
🔹 /help or /info - Show this list of commands

<b>Notion Integration</b>
🔹 /notion - Check Notion connection status
🔹 /pending - List all "Not Started" tasks
🔹 /morning - Generate morning report (active tasks)
🔹 /evening - Generate evening report (tasks completed today)

<b>Task Management</b>
🔹 /status <code>&lt;Task Title&gt; | &lt;New Status&gt;</code>
    <i>Example: /status login page | In Progress</i>
🔹 /done <code>&lt;Task Title&gt;</code>
    <i>Example: /done fix bug</i>
    `;
    
    await ctx.reply(helpMessage.trim(), { parse_mode: 'HTML' });
  }
}
