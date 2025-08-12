require('dotenv').config();
const axios = require('axios');
const readline = require('readline-sync');

const { fetchBlocks, hasEnoughNoteContent } = require('./notionApi');
const { readSummaryFile, writeSummaryFile, injectSummary, extractDateFromText, isDateInSelectedMonth, readArgValue } = require('./classSummaryHelpers');

const STUDENT_LIST_PAGE_ID = process.env.STUDENT_LIST_PAGE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TESTING_MODE = process.argv.includes('--testing') || process.argv.includes('-t');


const openai = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
});

const getMonthFromArgs = () => {
  const value = readArgValue(['--month', '-m']);
  if (!value) return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
};

const getSelectedMonth = () => {
  const fromArgs = getMonthFromArgs();
  if (fromArgs) return fromArgs;
  return readline.question('Enter the month to filter (YYYY-MM): ').trim();
};

const processToggleBlock = async (block, selectedMonth) => {
  const title = block.toggle.rich_text.map(t => t.plain_text).join(' ');
  const extracted = extractDateFromText(title);
  if (!extracted || !isDateInSelectedMonth(extracted, selectedMonth)) return null;
  const children = await fetchBlocks(block.id);
  if (!hasEnoughNoteContent(children)) return null;
  const summary = children.map(b => b[b.type]?.rich_text?.map(t => t.plain_text).join(' ') || '').join('\n');
  return { date: extracted.fullDate, summary };
};

const getStudentPages = async () => {
  const blocks = await fetchBlocks(STUDENT_LIST_PAGE_ID);
  return blocks.filter(b => b.type === 'child_page');
};

const getClassSummaries = async (pageId, selectedMonth) => {
  const blocks = await fetchBlocks(pageId);
  const togglesWithDates = blocks.filter(b => b.type === 'toggle' && b.toggle.rich_text.some(t => /(\d{4})-(\d{2})-(\d{2})/.test(t.plain_text)));
  const processed = await Promise.all(togglesWithDates.map(b => processToggleBlock(b, selectedMonth)));
  const valid = processed.filter(Boolean);
  return TESTING_MODE && valid.length ? [valid[0]] : valid;
};

const summarizeText = async text => {
  try {
    const system = 'For all lists provide a comma separated list. Use any style.';
    const user = `Provide a summary in 20 words or less of these notes, as a list of phrases. Please give the topic and grammar practiced. Use any style. For example: ‘Future tense, past tense, present continuous, grammar corrections, business vocabulary, pronunciation, onomatopoeia, to be past tense, relaxed pronunciation.’ Notes: ${text}`;
    const { data } = await openai.post('/chat/completions', { model: 'o3-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    return data.choices[0].message.content;
  } catch {
    return text;
  }
};

const compileSummaries = async () => {
  const studentPages = await getStudentPages();
  if (!studentPages.length) return;
  const selectedMonth = getSelectedMonth();
  const summaryFilePath = `summaries_${selectedMonth}.md`;
  let lines = readSummaryFile(summaryFilePath);
  await Promise.all(
    studentPages.map(async student => {
      const summaries = await getClassSummaries(student.id, selectedMonth);
      if (!summaries.length) return;
      await Promise.all(
        summaries.map(async ({ date, summary }) => {
          const content = summary.length < 30 ? summary : await summarizeText(summary);
          lines = injectSummary(lines, student.child_page.title, date, content);
        })
      );
    })
  );
  writeSummaryFile(summaryFilePath, lines);
};

compileSummaries();