const axios = require('axios');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const api = axios.create({
  baseURL: 'https://api.notion.com/v1',
  headers: {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Notion-Version': '2022-06-28'
  }
});

const fetchBlocks = async blockId => {
  try {
    // console.log(`[notionApi] Fetching blocks for blockId: ${blockId}`);
    let all = [];
    let next = null;
    const MAX_PAGES = 10;
    let pages = 0;
    do {
      if (pages >= MAX_PAGES) break;
      const url = `/blocks/${blockId}/children${next ? `?start_cursor=${next}` : ''}`;
      const { data } = await api.get(url);
      if (data.results) all = all.concat(data.results);
      next = data.next_cursor;
      pages++;
    } while (next);
    // console.log(`[notionApi] Fetched ${all.length} blocks for blockId: ${blockId}`);
    return all;
  } catch (e) {
    // console.error(`[notionApi] Error fetching blocks for blockId: ${blockId}`, e.message);
    return [];
  }
};

module.exports = { fetchBlocks };