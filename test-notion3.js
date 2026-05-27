const { Client } = require('@notionhq/client');
require('dotenv').config();

async function run() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  try {
    const db = await notion.databases.retrieve({ database_id: process.env.NOTION_DATABASE_ID });
    console.log(JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error:', e.body || e.message);
  }
}
run();
