const fs = require("fs");

// Normalize names for matching: strip diacritics, case-insensitive, collapse whitespace
const normalizeStudentName = (s) => {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
};

// Find a matching student key in the summaries object using normalized comparison
const findMatchingStudentKey = (summaries, student) => {
  const target = normalizeStudentName(student);
  return Object.keys(summaries).find((k) => normalizeStudentName(k) === target);
};

// Retrieve the summary text for a given student/date if available
const getExistingSummary = ({ summaries, student, date }) => {
  const key = findMatchingStudentKey(summaries, student);
  if (!key) return null;
  return summaries[key]?.[date] ?? null;
};

// Check if a summary for a given student/date already exists
const summaryAlreadyExists = (args) => !!getExistingSummary(args);

const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;

const extractDateFromText = (text) => {
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
const readSummaryFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf-8");
  const summaries = {};
  // Match each student section. Use end-of-string safe check (?![\s\S]) since JS RegExp has no \Z
  const studentSectionRegex = /^# (.+?)\s*\n([\s\S]*?)(?=^# |(?![\s\S]))/gm;
  let studentMatch;
  while ((studentMatch = studentSectionRegex.exec(text)) !== null) {
    const student = studentMatch[1].trim();
    const section = studentMatch[2];
    const key = findMatchingStudentKey(summaries, student) || student;
    if (!summaries[key]) summaries[key] = {};
    // Match each date/summary in the student section
    const dateSectionRegex = /^## (.+?)\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm;
    let dateMatch;
    while ((dateMatch = dateSectionRegex.exec(section)) !== null) {
      const date = dateMatch[1].trim();
      const summary = dateMatch[2].trim();
      summaries[key][date] = summary;
    }
  }
  return summaries;
};

// Write the summary object back to file in the same format using string building
const writeSummaryFile = (filePath, summaries) => {
  let text = "";
  for (const student of Object.keys(summaries)) {
    text += `# ${student}\n`;
    const dates = Object.keys(summaries[student]).sort();
    for (const date of dates) {
      text += `## ${date}\n${summaries[student][date]}\n\n`;
    }
  }
  fs.writeFileSync(filePath, text.trim() + "\n", "utf-8");
};

const addSummary = ({ summaries, studentName, date, newSummaryText }) => {
  // Prefer adding to an existing key that matches after normalization
  const key = findMatchingStudentKey(summaries, studentName) || studentName;
  if (!summaries[key]) summaries[key] = {};
  summaries[key][date] = newSummaryText;
  console.log(
    `[makeClassSummaries] Added summary: ${studentName} ${date}\n${newSummaryText}`,
  );
};

// Helper functions for argument parsing and month selection
const readArgValue = (keys) => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const k of keys) {
      if (a === k && args[i + 1]) return args[i + 1];
      if (a.startsWith(`${k}=`)) return a.split("=")[1];
    }
  }
  return null;
};

// Read a boolean flag (present => true). Supports forms like: -t, --dry-run, --flag=true/false
const readFlag = (keys) => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const k of keys) {
      if (a === k) return true;
      if (a.startsWith(`${k}=`)) {
        const v = a.split("=")[1].toLowerCase();
        return v === "1" || v === "true" || v === "yes";
      }
    }
  }
  return false;
};

module.exports = {
  extractDateFromText,
  isDateInSelectedMonth,
  addSummary,
  readSummaryFile,
  writeSummaryFile,
  readArgValue,
  readFlag,
  summaryAlreadyExists,
  getExistingSummary,
  normalizeStudentName,
};
