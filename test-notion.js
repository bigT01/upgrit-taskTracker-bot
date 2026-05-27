const { Client } = require('@notionhq/client');
require('dotenv').config();

async function run() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  try {
    const db = await notion.databases.retrieve({ database_id: process.env.NOTION_DATABASE_ID });
    console.log('Database Title:', db.title[0]?.plain_text);
    console.log('Properties:', Object.keys(db.properties));
    // check if it's a connected database
    if (db.data_sources) {
      console.log('Data Sources:', JSON.stringify(db.data_sources));
    }
  } catch (e) {
    console.error('Error:', e.body || e.message);
  }
}
run();
