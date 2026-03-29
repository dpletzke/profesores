require("dotenv").config();

const readline = require("readline-sync");

const { readMonthArtifactIndex } = require("./artifactIndexReader");
const {
  readSummaryFile,
  writeSummaryFile,
  writeSummaryYamlFile,
  addSummary,
  readArgValue,
  readFlag,
  getExistingSummary,
  buildSummaryHeader,
} = require("./classSummaryHelpers");
const {
  summarizeText,
} = require("./aiApi");

const ETH_ARTIFACT_ROOT = process.env.ETH_ARTIFACT_ROOT;
const MIN_NOTES_LEN = 30;
const MONTH_REGEX = /^\d{4}-\d{2}$/;

const getTodayLocalIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthFromArgs = () => {
  const value = readArgValue(["--month", "-m"]);
  if (!value) return null;
  return MONTH_REGEX.test(value) ? value : null;
};

const getSelectedMonth = () => {
  const fromArgs = getMonthFromArgs();
  if (fromArgs) return fromArgs;
  return readline.question("Enter the month to filter (YYYY-MM): ").trim();
};

const compileSummaries = async () => {
  const selectedMonth = getSelectedMonth();
  if (!MONTH_REGEX.test(selectedMonth)) {
    console.error(
      `[makeClassSummaries] Invalid month "${selectedMonth}". Use YYYY-MM.`,
    );
    return;
  }
  if (!ETH_ARTIFACT_ROOT) {
    console.error(
      "[makeClassSummaries] ETH_ARTIFACT_ROOT is required to read month artifact indexes.",
    );
    return;
  }

  const dryRun = readFlag(["-t", "--test", "--dry-run"]);
  const summaryFileBase = `summaries_${selectedMonth}`;
  const summaryFilePath = `${summaryFileBase}.md`;
  const summaryYamlFilePath = `${summaryFileBase}.yaml`;
  const todayLocalIsoDate = getTodayLocalIsoDate();
  let summaries = readSummaryFile(summaryFilePath);
  let monthArtifacts;

  try {
    monthArtifacts = readMonthArtifactIndex({
      artifactRoot: ETH_ARTIFACT_ROOT,
      month: selectedMonth,
    });
  } catch (error) {
    console.error(
      `[makeClassSummaries] Failed to read month artifact index for ${selectedMonth}: ${error.message}`,
    );
    return;
  }

  const entries = monthArtifacts.matchedEntries
    .slice()
    .sort(
      (a, b) =>
        (a.entitySlug || a.studentSlug).localeCompare(b.entitySlug || b.studentSlug) ||
        a.classDate.localeCompare(b.classDate) ||
        a.sessionId.localeCompare(b.sessionId) ||
        a.classLine.localeCompare(b.classLine),
    );

  let stats = {
    entities: new Set(entries.map((entry) => entry.entitySlug || entry.studentSlug)).size,
    notesEntries: 0,
    skippedExisting: 0,
    skippedFuture: 0,
    failed: 0,
    placeholders: 0,
    summarized: 0,
  };

  for (const entry of entries) {
    stats.notesEntries++;
    const entityLabel = entry.displayLabel;
    const date = entry.classDate;
    const classLine = entry.classLine;
    const notes = entry.notesText.trim();

    if (date > todayLocalIsoDate) {
      stats.skippedFuture++;
      continue;
    }

    const header = buildSummaryHeader({ date, classLine });
    const existingEntry = getExistingSummary({
      summaries,
      student: entityLabel,
      date,
      classLine,
    });
    const existingSummary = existingEntry?.summary ?? null;
    const updateTitleIfNeeded = () => {
      if (existingEntry && existingEntry.titleText !== header) {
        existingEntry.titleText = header;
        console.log(
          `[makeClassSummaries] Updated title for ${entityLabel} ${date}: ${header}`,
        );
      }
    };
    const hasEnoughNotes = notes.length >= MIN_NOTES_LEN;
    if (
      existingSummary &&
      (!existingSummary.startsWith("NOT ENOUGH NOTES") || !hasEnoughNotes)
    ) {
      updateTitleIfNeeded();
      stats.skippedExisting++;
      continue;
    }
    if (dryRun) {
      updateTitleIfNeeded();
      continue;
    }
    const newSummaryText = !hasEnoughNotes
      ? `NOT ENOUGH NOTES ${notes}`
      : await summarizeText(notes);
    if (!newSummaryText) {
      stats.failed++;
      console.log(
        `[makeClassSummaries] Failed to summarize ${entityLabel} ${date}`,
      );
      continue;
    }
    addSummary({
      summaries,
      studentName: entityLabel,
      date,
      classLine,
      newSummaryText,
    });
    hasEnoughNotes ? (stats.summarized++) : (stats.placeholders++);
  }

  if (!dryRun) {
    writeSummaryFile(summaryFilePath, summaries);
    writeSummaryYamlFile(summaryYamlFilePath, summaries, { month: selectedMonth });
  }
  const mode = dryRun ? "DRY RUN" : "DONE";
  console.log(
    `[makeClassSummaries] ${mode}: entities=${stats.entities}, entries=${stats.notesEntries}, skipped=${stats.skippedExisting}, skippedFuture=${stats.skippedFuture}, failed=${stats.failed}, summarized=${stats.summarized}, placeholders=${stats.placeholders}${dryRun ? "" : `, wrote=${summaryFilePath}, wroteYaml=${summaryYamlFilePath}`}`,
  );
};

if (require.main === module) {
  compileSummaries();
}
