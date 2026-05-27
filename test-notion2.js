const { Client } = require('@notionhq/client');
require('dotenv').config();

async function run() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  try {
    const db = await notion.databases.retrieve({ database_id: process.env.NOTION_DATABASE_ID });
    const dataSourceId = db.data_sources[0].id;
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: { property: 'Status', status: { does_not_equal: 'done' } },
    });
    const page = response.results[0];
    console.log('Page ID:', page.id);
    console.log('Page Properties:', JSON.stringify(page.properties));
    
    // Attempt to update
    await notion.pages.update({
      page_id: page.id,
      properties: {
        Status: { status: { name: 'done' } }
      }
    });
    console.log('Update success!');
  } catch (e) {
    console.error('Error:', e.body || e.message);
  }
}
run();
