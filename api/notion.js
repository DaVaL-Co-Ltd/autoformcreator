const { Client } = require('@notionhq/client');

const notion = new Client({
    auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * Basic utility to save encrypted data to Notion
 */
async function saveToNotion(data) {
    try {
        const response = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                Name: {
                    title: [
                        {
                            text: {
                                content: data.title || 'New Automation Request',
                            },
                        },
                    ],
                },
                // Additional properties based on Notion schema will go here
                Status: {
                    select: {
                        name: '진단 대기',
                    },
                },
            },
        });
        return response;
    } catch (error) {
        console.error('Notion API Error:', error);
        throw error;
    }
}

async function getRequests() {
    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            sorts: [
                {
                    timestamp: 'created_time',
                    direction: 'descending',
                },
            ],
        });
        return response.results;
    } catch (error) {
        console.error('Notion Query Error:', error);
        throw error;
    }
}

module.exports = { saveToNotion, getRequests };
