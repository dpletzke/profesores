const fs = require('fs');

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

const readSummaryFile = filePath => {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').split('\n');
};

const writeSummaryFile = (filePath, lines) => {
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
};

const injectSummary = (lines, studentName, date, summaryText) => {
  const header = `# ${studentName}`;
  const newSection = `## ${date}\n${summaryText}\n`;
  const headerIndex = lines.findIndex(line => line.trim() === header);
  if (headerIndex === -1) return [...lines, header, newSection];
  let insertAt = headerIndex + 1;
  while (insertAt < lines.length && !(lines[insertAt].startsWith('#') && !lines[insertAt].startsWith('##'))) {
    if (lines[insertAt].startsWith('## ') && lines[insertAt].slice(3).trim() > date) break;
    insertAt++;
  }
  const updated = [...lines];
  updated.splice(insertAt, 0, newSection);
  return updated;
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
  injectSummary,
  readSummaryFile,
  writeSummaryFile,
  readArgValue
};