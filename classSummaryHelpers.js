const fs = require("fs");

const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;
const STUDENT_SECTION_REGEX = /^# (.+?)\s*\n([\s\S]*?)(?=^# |\Z)/gm;
const DATE_SECTION_REGEX = /^## (.+?)\s*\n([\s\S]*?)(?=^## |\Z)/gm;
const TRUE_VALUES = new Set(["1", "true", "yes"]);

const normalizeStudentName = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const findMatchingStudentKey = (summaries, student) => {
  const target = normalizeStudentName(student);
  return Object.keys(summaries).find(
    (key) => normalizeStudentName(key) === target,
  );
};

const getExistingSummary = ({ summaries, student, date, classLine }) => {
  const key = findMatchingStudentKey(summaries, student);
  if (!key) return null;

  const entries = summaries[key] ?? {};
  if (classLine && entries[classLine]) return entries[classLine];
  if (entries[date]) return entries[date];

  const prefix = `${date} `;
  return Object.entries(entries).find(([header]) => header.startsWith(prefix))
    ?.[1] ?? null;
};

const summaryAlreadyExists = (args) => !!getExistingSummary(args);

const extractDateFromText = (text = "") => {
  const match = text.match(DATE_REGEX);
  if (!match) return null;
  const [fullDate, year, month, day] = match;
  return { fullDate, year, month, day };
};

const isDateInSelectedMonth = (extractedDate, selectedMonth) =>
  !!extractedDate && extractedDate.fullDate.startsWith(selectedMonth);

const readSummaryFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  const summaries = {};
  const fileContents = fs.readFileSync(filePath, "utf-8");

  for (const [, rawName, section] of fileContents.matchAll(
    STUDENT_SECTION_REGEX,
  )) {
    const name = rawName.trim();
    const key = findMatchingStudentKey(summaries, name) ?? name;
    const studentSummaries = summaries[key] ?? (summaries[key] = {});

    for (const [, rawHeader, body] of section.matchAll(DATE_SECTION_REGEX)) {
      studentSummaries[rawHeader.trim()] = body.trim();
    }
  }

  return summaries;
};

const writeSummaryFile = (filePath, summaries) => {
  const content = Object.keys(summaries)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((student) => {
      const entries = Object.keys(summaries[student])
        .sort()
        .map((header) => `## ${header}\n${summaries[student][header]}`.trim())
        .join("\n\n");
      return `# ${student}\n${entries}`;
    })
    .join("\n\n")
    .trim();

  fs.writeFileSync(filePath, `${content}\n`, "utf-8");
};

const addSummary = ({ summaries, studentName, date, classLine, newSummaryText }) => {
  const key = findMatchingStudentKey(summaries, studentName) ?? studentName;
  const header = classLine ?? date;

  if (!summaries[key]) summaries[key] = {};
  summaries[key][header] = newSummaryText;

  console.log(
    `[makeClassSummaries] Added summary: ${studentName} ${header}\n${newSummaryText}`,
  );
};

const readArgValue = (keys) => {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const [flag, value] = args[i].split("=", 2);
    if (!keys.includes(flag)) continue;
    return value ?? args[i + 1] ?? null;
  }

  return null;
};

const readFlag = (keys) => {
  for (const arg of process.argv.slice(2)) {
    const [flag, value] = arg.split("=", 2);
    if (!keys.includes(flag)) continue;
    if (value === undefined) return true;
    return TRUE_VALUES.has(value.toLowerCase());
  }
  return false;
};

module.exports = {
  normalizeStudentName,
  findMatchingStudentKey,
  getExistingSummary,
  summaryAlreadyExists,
  extractDateFromText,
  isDateInSelectedMonth,
  readSummaryFile,
  writeSummaryFile,
  addSummary,
  readArgValue,
  readFlag,
};
