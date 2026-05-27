import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@notionhq/client';

export interface Task {
  projectName: string;
  taskName: string;
  status: string;
  labels: string[];
  description: string;
  dueDate?: string;
  id?: string;
}

@Injectable()
export class NotionService {
  private notion: Client;
  private databaseId: string;
  private resolvedDataSourceId?: string;
  private readonly logger = new Logger(NotionService.name);

  constructor(private configService: ConfigService) {
    this.notion = new Client({
      auth: this.configService.get<string>('NOTION_TOKEN'),
    });
    this.databaseId = this.configService.get<string>('NOTION_DATABASE_ID')!;
  }

  private async getDataSourceId(): Promise<string> {
    if (this.resolvedDataSourceId) {
      return this.resolvedDataSourceId;
    }

    try {
      const response = await this.notion.databases.retrieve({ database_id: this.databaseId });
      // @ts-ignore
      const dataSource = response.data_sources?.[0];
      if (!dataSource) {
        throw new Error('No data sources found for this database container.');
      }
      this.resolvedDataSourceId = dataSource.id;
      return this.resolvedDataSourceId!;
    } catch (error) {
      this.logger.error('Failed to resolve Data Source ID from Database ID', error);
      throw error;
    }
  }

  async checkConnection(): Promise<string> {
    try {
      const response = await this.notion.databases.retrieve({ database_id: this.databaseId });
      // @ts-ignore - title might be an array depending on typing
      const title = response.title?.[0]?.plain_text || 'Unknown Database';
      return `✅ Successfully connected to Notion! Database name: <b>${title}</b>`;
    } catch (error: any) {
      this.logger.error('Notion connection failed', error);
      return `❌ Failed to connect to Notion. Error: ${error.message}`;
    }
  }

  async getTasksForToday(isCompleted: boolean): Promise<Record<string, Task[]>> {
    try {
      const dataSourceId = await this.getDataSourceId();

      let queryFilter: any;

      if (isCompleted) {
        // For evening report, only show completed tasks (Done) updated today in Kazakhstan timezone (GMT+5)
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Almaty',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const parts = formatter.formatToParts(now);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;

        const todayStartIso = `${year}-${month}-${day}T00:00:00+05:00`;

        queryFilter = {
          and: [
            {
              property: 'Status',
              status: { equals: 'Done' } as any,
            },
            {
              timestamp: 'last_edited_time',
              last_edited_time: {
                on_or_after: todayStartIso,
              },
            },
          ],
        };
      } else {
        // For morning report, show all active tasks (Not Started, In Progress, In Review)
        queryFilter = {
          or: [
            { property: 'Status', status: { equals: 'Not Started' } as any },
            { property: 'Status', status: { equals: 'In Progress' } as any },
            { property: 'Status', status: { equals: 'In Review' } as any },
          ],
        };
      }

      const response = await this.notion.dataSources.query({
        data_source_id: dataSourceId,
        filter: queryFilter,
      });

      return this.parseAndGroupTasks(response.results);
    } catch (error) {
      this.logger.error('Error fetching tasks from Notion', error);
      throw error;
    }
  }

  async getNotStartedTasks(): Promise<Record<string, Task[]>> {
    try {
      const dataSourceId = await this.getDataSourceId();
      const response = await this.notion.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          property: 'Status',
          status: {
            equals: 'Not Started',
          } as any,
        },
      });

      return this.parseAndGroupTasks(response.results);
    } catch (error) {
      this.logger.error('Error fetching Not Started tasks from Notion', error);
      throw error;
    }
  }

  private parseAndGroupTasks(results: any[]): Record<string, Task[]> {
    const tasks: Task[] = results.map((page: any) => this.parseSingleTask(page));

    return tasks.reduce((acc, task) => {
      if (!acc[task.projectName]) {
        acc[task.projectName] = [];
      }
      acc[task.projectName].push(task);
      return acc;
    }, {} as Record<string, Task[]>);
  }

  private parseSingleTask(page: any): Task {
    // Find the title property key dynamically (e.g. 'Issue' or 'Issue ')
    const titlePropertyKey = Object.keys(page.properties).find(
      (key) => page.properties[key]?.type === 'title',
    ) || 'Issue';
    const issueProperty = page.properties[titlePropertyKey]?.title || [];
    const issueText = issueProperty.map((t: any) => t.plain_text).join('');

    const statusProperty = page.properties['Status']?.status;
    const status = statusProperty?.name || 'Unknown';

    const labelsProperty = page.properties['Labels']?.multi_select || [];
    const labels = labelsProperty.map((l: any) => l.name);

    const descriptionProperty = page.properties['Description']?.rich_text || [];
    const description = descriptionProperty.map((t: any) => t.plain_text).join('');

    // Find the date property dynamically (e.g. 'Due Date' or 'Date')
    const datePropertyKey = Object.keys(page.properties).find(
      (key) => page.properties[key]?.type === 'date',
    );
    const dueDate = datePropertyKey ? page.properties[datePropertyKey]?.date?.start : undefined;

    const parts = issueText.split('-');
    let projectName = page.properties['Project']?.select?.name;
    let taskName = issueText;

    if (!projectName) {
      if (parts.length > 1) {
        projectName = parts[0].trim();
        taskName = parts.slice(1).join('-').trim();
      } else {
        projectName = 'Other';
      }
    } else {
      // If we have a Project property, but the issueText still starts with the project name and a hyphen, clean up taskName
      const prefix = `${projectName} -`;
      if (issueText.startsWith(prefix)) {
        taskName = issueText.substring(prefix.length).trim();
      }
    }

    return {
      id: page.id,
      projectName,
      taskName,
      status,
      labels,
      description,
      dueDate,
    };
  }

  async updateTaskStatusByTitle(titleFragment: string, newStatus: string): Promise<string> {
    try {
      const dataSourceId = await this.getDataSourceId();

      // Fetch incomplete tasks to find a match
      const response = await this.notion.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          property: 'Status',
          status: { does_not_equal: 'done' } as any,
        },
      });

      const tasksWithPages = response.results.map((page: any) => ({
        task: this.parseSingleTask(page),
        pageId: page.id,
        rawTitle: page.properties[
          Object.keys(page.properties).find((key) => page.properties[key]?.type === 'title') || 'Issue'
        ]?.title.map((t: any) => t.plain_text).join('') || '',
      }));

      const match = tasksWithPages.find(t =>
        t.rawTitle.toLowerCase().includes(titleFragment.toLowerCase()) ||
        t.task.taskName.toLowerCase().includes(titleFragment.toLowerCase())
      );

      if (!match) {
        return `❌ Could not find any active task matching "${titleFragment}".`;
      }

      await this.notion.pages.update({
        page_id: match.pageId,
        properties: {
          Status: {
            status: { name: newStatus }
          }
        }
      });

      return `✅ Successfully updated task <b>${match.task.taskName}</b> to status <b>${newStatus}</b>.`;
    } catch (error) {
      this.logger.error('Error updating task status by title', error);
      return `❌ Failed to update task status. Please check if the status "${newStatus}" is valid in Notion.`;
    }
  }
}
