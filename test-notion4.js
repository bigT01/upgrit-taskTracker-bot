const { Client } = require('@notionhq/client');
require('dotenv').config();

async function run() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      filter: { property: 'Status', status: { does_not_equal: 'done' } },
    });
    console.log(`Found ${response.results.length} results via databases.query`);
    if(response.results.length > 0) {
       console.log('Page ID:', response.results[0].id);
    }
  } catch (e) {
    console.error('Error:', e.body || e.message);
  }
}
run();
