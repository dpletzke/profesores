const fs = require("fs");

const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;
const STUDENT_SECTION_REGEX = /^# (.+?)\s*\n([\s\S]*?)(?=^# |$)/gm;
const DATE_SECTION_REGEX = /^## (.+?)\s*\n([\s\S]*?)(?=^## |$)/gm;
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

const getExistingSummary = ({ summaries, student, date }) => {
  const key = findMatchingStudentKey(summaries, student);
  if (!key) return null;

  const entries = summaries[key];
  if (!entries) return null;

  const existing = entries[date];
  if (!existing) return null;

  return existing;
};

const summaryAlreadyExists = (args) => {
  const existing = getExistingSummary(args);
  return !!(existing && existing.summary);
};

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
  const lines = fileContents.split("\n");

  console.log("[classSummaryHelpers] Starting readSummaryFile", {
    filePath,
    rawLength: fileContents.length,
    totalLines: lines.length,
  });

  let currentStudentKey = null;
  let currentTitleText = null;
  let currentDateKey = null;
  let currentBodyLines = [];

  const flushSummary = () => {
    if (!currentStudentKey || !currentDateKey) return;
    const studentSummaries = summaries[currentStudentKey] ?? (summaries[currentStudentKey] = {});
    const summary = currentBodyLines.join("\n").trim();
    studentSummaries[currentDateKey] = {
      summary,
      titleText: currentTitleText ?? currentDateKey,
    };
    console.log("[classSummaryHelpers] Added entry", {
      student: currentStudentKey,
      dateKey: currentDateKey,
      titleText: currentTitleText,
      summaryLength: summary.length,
    });
    currentTitleText = null;
    currentDateKey = null;
    currentBodyLines = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (line.startsWith("# ")) {
      flushSummary();
      const studentName = line.slice(2).trim();
      const key = findMatchingStudentKey(summaries, studentName) ?? studentName;
      if (!summaries[key]) summaries[key] = {};
      currentStudentKey = key;
      currentTitleText = null;
      currentDateKey = null;
      currentBodyLines = [];
      console.log("[classSummaryHelpers] Parsing student", {
        student: studentName,
        key,
        lineNumber: index + 1,
      });
      return;
    }

    if (!currentStudentKey) return;

    if (line.startsWith("## ")) {
      flushSummary();
      currentTitleText = line.slice(3).trim();
      const extracted = extractDateFromText(currentTitleText);
      currentDateKey = extracted?.fullDate ?? currentTitleText;
      currentBodyLines = [];
      console.log("[classSummaryHelpers] Parsing entry", {
        student: currentStudentKey,
        titleText: currentTitleText,
        dateKey: currentDateKey,
        lineNumber: index + 1,
      });
      return;
    }

    if (currentDateKey) {
      currentBodyLines.push(rawLine);
    }
  });

  flushSummary();

  console.log("[classSummaryHelpers] Finished readSummaryFile", {
    filePath,
    students: Object.keys(summaries).length,
    entries: Object.values(summaries).reduce(
      (acc, studentEntries) => acc + Object.keys(studentEntries ?? {}).length,
      0,
    ),
  });

  return summaries;
};

const writeSummaryFile = (filePath, summaries) => {
  const content = Object.keys(summaries)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((student) => {
      const entries = Object.keys(summaries[student] ?? {})
        .sort()
        .map((dateKey) => {
          const value = summaries[student][dateKey] ?? {};
          const summary = value.summary ?? "";
          const titleText = value.titleText ?? dateKey;
          return `## ${titleText}\n${summary}`.trim();
        })
        .join("\n\n");
      return `# ${student}\n${entries}`.trim();
    })
    .join("\n\n")
    .trim();

  const output = content ? `${content}\n` : "";
  fs.writeFileSync(filePath, output, "utf-8");
};

const buildSummaryArtifactData = (summaries, options = {}) => {
  const entities = Object.keys(summaries)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((entity) => {
      const entries = Object.keys(summaries[entity] ?? {})
        .sort()
        .map((date) => {
          const value = summaries[entity][date] ?? {};
          return {
            date,
            titleText: value.titleText ?? date,
            summary: value.summary ?? "",
          };
        });

      return {
        name: entity,
        entries,
      };
    });

  return {
    month: options.month ?? null,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    studentCount: entities.length,
    entityCount: entities.length,
    entryCount: entities.reduce((count, entity) => count + entity.entries.length, 0),
    students: entities,
    entities,
  };
};

const quoteYamlString = (value = "") => `'${String(value).replace(/'/g, "''")}'`;

const buildYamlLiteralBlock = (value, indent) => {
  const lines = String(value).split("\n");
  return ["|-", ...lines.map((line) => `${indent}${line}`)].join("\n");
};

const buildSummaryYaml = (summaries, options = {}) => {
  const data = buildSummaryArtifactData(summaries, options);
  const lines = [
    `month: ${data.month === null ? "null" : quoteYamlString(data.month)}`,
    `generatedAt: ${quoteYamlString(data.generatedAt)}`,
    `studentCount: ${data.studentCount}`,
    `entityCount: ${data.entityCount}`,
    `entryCount: ${data.entryCount}`,
    "students:",
  ];

  data.students.forEach((student) => {
    lines.push(`  - name: ${quoteYamlString(student.name)}`);
    lines.push("    entries:");

    student.entries.forEach((entry) => {
      lines.push(`      - date: ${quoteYamlString(entry.date)}`);
      lines.push(`        titleText: ${quoteYamlString(entry.titleText)}`);
      if (entry.summary) {
        lines.push(`        summary: ${buildYamlLiteralBlock(entry.summary, "          ")}`);
      } else {
        lines.push('        summary: ""');
      }
    });
  });

  lines.push("entities:");
  data.entities.forEach((entity) => {
    lines.push(`  - name: ${quoteYamlString(entity.name)}`);
    lines.push("    entries:");

    entity.entries.forEach((entry) => {
      lines.push(`      - date: ${quoteYamlString(entry.date)}`);
      lines.push(`        titleText: ${quoteYamlString(entry.titleText)}`);
      if (entry.summary) {
        lines.push(`        summary: ${buildYamlLiteralBlock(entry.summary, "          ")}`);
      } else {
        lines.push('        summary: ""');
      }
    });
  });

  return lines.join("\n");
};

const writeSummaryYamlFile = (filePath, summaries, options = {}) => {
  const output = `${buildSummaryYaml(summaries, options)}\n`;
  fs.writeFileSync(filePath, output, "utf-8");
};

const buildSummaryHeader = ({ date, classLine }) => {
  const trimmedLine = (classLine ?? "").trim();
  if (!trimmedLine) return date;
  return trimmedLine.startsWith(date) ? trimmedLine : `${date} ${trimmedLine}`;
};

const addSummary = ({ summaries, studentName, date, classLine, newSummaryText }) => {
  const key = findMatchingStudentKey(summaries, studentName) ?? studentName;
  const header = buildSummaryHeader({ date, classLine });

  if (!summaries[key]) summaries[key] = {};
  const entries = summaries[key];

  entries[date] = {
    summary: newSummaryText,
    titleText: header,
  };

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
  buildSummaryArtifactData,
  buildSummaryYaml,
  writeSummaryYamlFile,
  addSummary,
  buildSummaryHeader,
  readArgValue,
  readFlag,
};
