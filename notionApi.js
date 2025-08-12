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
    return all;
  } catch (e) {
    return [];
  }
};

const hasEnoughNoteContent = (blocks, minLength = 30) => {
  const total = blocks.reduce((sum, block) => {
    const type = block.type;
    const text = block[type]?.rich_text || [];
    const content = text.map(t => t.plain_text).join('');
    return sum + content.length;
  }, 0);
  return total >= minLength;
};

module.exports = { fetchBlocks, hasEnoughNoteContent };