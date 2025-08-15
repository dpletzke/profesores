const fs = require('fs');
//find the student header, then find the next student header or EOF ('starts with #') then find if the date is within that section
const summaryAlreadyExists = ({ summaries, date, student }) => {
  return !!(summaries[student] && summaries[student][date]);
};

const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;

const extractDateFromText = text => {
  const match = text.match(DATE_REGEX);
  if (!match) return null;
  const [fullDate, year, month, day] = match;
  return { fullDate, year, month, day };
};

const isDateInSelectedMonth = (extractedDate, selectedMonth) => {
  if (!extractedDate) return false;
  return extractedDate.fullDate.startsWith(selectedMonth);
};

// Read the summary file into a nested object: { [student]: { [date]: summaryText } } using regex
const readSummaryFile = filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`[classSummaryHelpers] File does not exist: ${filePath}`);
    return {};
  }
  console.log(`[classSummaryHelpers] Reading file: ${filePath}`);
  const text = fs.readFileSync(filePath, 'utf-8');
  const summaries = {};
  // Match each student section
  const studentSectionRegex = /^# (.+?)\s*\n([\s\S]*?)(?=^# |\Z)/gm;
  let studentMatch;
  while ((studentMatch = studentSectionRegex.exec(text)) !== null) {
    const student = studentMatch[1].trim();
    const section = studentMatch[2];
    summaries[student] = {};
    // Match each date/summary in the student section
    const dateSectionRegex = /^## (.+?)\s*\n([\s\S]*?)(?=^## |\Z)/gm;
    let dateMatch;
    while ((dateMatch = dateSectionRegex.exec(section)) !== null) {
      const date = dateMatch[1].trim();
      const summary = dateMatch[2].trim();
      summaries[student][date] = summary;
    }
  }
  // Remove or comment out the debug log below if not needed:
  // console.log(JSON.stringify(summaries, null, 2));
  return summaries;
};

// Write the summary object back to file in the same format using string building
const writeSummaryFile = (filePath, summaries) => {
  let text = '';
  for (const student of Object.keys(summaries)) {
    text += `# ${student}\n`;
    const dates = Object.keys(summaries[student]).sort();
    for (const date of dates) {
      text += `## ${date}\n${summaries[student][date]}\n\n`;
    }
  }
  fs.writeFileSync(filePath, text.trim() + '\n', 'utf-8');
  console.log(`[classSummaryHelpers] Wrote file: ${filePath}`);
};

const addSummary = ({ summaries, studentName, date, newSummaryText }) => {
  if (!summaries[studentName]) summaries[studentName] = {};
  summaries[studentName][date] = newSummaryText;
  // No return needed
};

// Helper functions for argument parsing and month selection
const readArgValue = keys => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const k of keys) {
      if (a === k && args[i + 1]) return args[i + 1];
      if (a.startsWith(`${k}=`)) return a.split('=')[1];
    }
  }
  return null;
};


module.exports = {
  extractDateFromText,
  isDateInSelectedMonth,
  addSummary,
  readSummaryFile,
  writeSummaryFile,
  readArgValue,
  summaryAlreadyExists,
};