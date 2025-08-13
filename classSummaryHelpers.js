const fs = require('fs');
//find the student header, then find the next student header or EOF ('starts with #') then find if the date is within that section
const summaryIsAlreadyinFile = ({ lines, date, student }) => {
  console.log(`[classSummaryHelpers] Checking if summary exists for ${student} on ${date}`);
  const text = lines.join('\n');

  // Isolate the student's section: from "# {student}" up to the next top-level "# " or EOF
  const studentHeader = text.findIndex(line => line.startsWith(`# ${student}`));
  if (studentHeader === -1) {
    console.log(`[classSummaryHelpers] No section found for student: ${student}`);
    return false;
  }
  const nextHeaderIndex = text.findIndex((line, index) => index > studentHeader && line.startsWith('# '));
  const studentSection = nextHeaderIndex === -1 ? text.slice(studentHeader) : text.slice(studentHeader, nextHeaderIndex);
  console.log(`[classSummaryHelpers] Found section for student: ${studentSection}`);
  // Inside that, check if the date already exists
  const dateHeader = new RegExp(`(^|\\n)##\\s*${date}\\s*\\n`, 'm');
  if (!studentSection.match(dateHeader)) {
    console.log(`[classSummaryHelpers] No date header found for ${date} in section for ${student}`);
    return false;
  }
  // If the date exists, we can assume a summary is already there
  console.log(`[classSummaryHelpers] Summary already exists for ${student} on ${date}`);
  return true;
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

const readSummaryFile = filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`[classSummaryHelpers] File does not exist: ${filePath}`);
    return [];
  }
  console.log(`[classSummaryHelpers] Reading file: ${filePath}`);
  return fs.readFileSync(filePath, 'utf-8').split('\n');
};

const writeSummaryFile = (filePath, lines) => {
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`[classSummaryHelpers] Wrote file: ${filePath}`);
};

const injectSummary = (lines, studentName, date, summaryText) => {
  const header = `# ${studentName}`;
  const newSection = `## ${date}\n${summaryText}\n`;
  const headerIndex = lines.findIndex(line => line.trim() === header);
  if (headerIndex === -1) {
    console.log(`[classSummaryHelpers] Adding new student section: ${studentName}`);
    return [...lines, header, newSection];
  }
  let insertAt = headerIndex + 1;
  while (insertAt < lines.length && !(lines[insertAt].startsWith('#') && !lines[insertAt].startsWith('##'))) {
    if (lines[insertAt].startsWith('## ') && lines[insertAt].slice(3).trim() > date) break;
    insertAt++;
  }
  const updated = [...lines];
  updated.splice(insertAt, 0, newSection);
  console.log(`[classSummaryHelpers] Injected summary for ${studentName} on ${date}`);
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
  readArgValue,
  summaryIsAlreadyinFile,
};