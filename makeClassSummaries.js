require("dotenv").config();

const fs = require("fs");
const readline = require("readline-sync");

const { fetchBlocks } = require("./notionApi");
const {
  readSummaryFile,
  writeSummaryFile,
  addSummary,
  extractDateFromText,
  isDateInSelectedMonth,
  readArgValue,
  readFlag,
  summaryAlreadyExists,
  getExistingSummary,
  buildSummaryHeader,
} = require("./classSummaryHelpers");
const {
  summarizeText,
} = require("./openAiApi");

const STUDENT_LIST_PAGE_ID = process.env.STUDENT_LIST_PAGE_ID;
const MIN_NOTES_LEN = 30;

const getMonthFromArgs = () => {
  const value = readArgValue(["--month", "-m"]);
  if (!value) return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
};

const getSelectedMonth = () => {
  const fromArgs = getMonthFromArgs();
  if (fromArgs) return fromArgs;
  return readline.question("Enter the month to filter (YYYY-MM): ").trim();
};

const processNotesToggle = async (block, selectedMonth, studentName) => {
  const titleParts = block.toggle?.rich_text;
  if (!Array.isArray(titleParts) || titleParts.length === 0) return null;

  const title = titleParts.map((t) => t.plain_text).join(" ");
  const extracted = extractDateFromText(title);
  if (!extracted || !isDateInSelectedMonth(extracted, selectedMonth)) return null;

  const children = await fetchBlocks(block.id);
  if (!children || children.length === 0) {
    const labelStudent = studentName ?? "unknown student";
    const labelDate = extracted?.fullDate ?? "unknown date";
    console.log(
      `[makeClassSummaries] No children found for block: ${block.id} (${labelStudent} ${labelDate})`,
    );
    return null;
  }

  const notes = children
    .map((child) => {
      const richText = child[child.type]?.rich_text;
      if (!Array.isArray(richText) || richText.length === 0) return "";
      return richText.map((t) => t.plain_text).join(" ");
    })
    .join("\n");

  return { date: extracted.fullDate, classLine: title.trim(), notes };
};

const getStudentPages = async () => {
  const blocks = await fetchBlocks(STUDENT_LIST_PAGE_ID);
  return blocks.filter((b) => b.type === "child_page");
};

const getClassNotes = async (student, selectedMonth) => {
  const studentName = student?.child_page?.title;
  const blocks = await fetchBlocks(student.id);
  const togglesWithDates = blocks.filter(
    (b) =>
      b.type === "toggle" &&
      b.toggle.rich_text.some((t) =>
        /(\d{4})-(\d{2})-(\d{2})/.test(t.plain_text),
      ),
  );
  const processed = await Promise.all(
    togglesWithDates.map((b) => processNotesToggle(b, selectedMonth, studentName)),
  );
  const valid = processed.filter(Boolean);
  return valid;
};

const compileSummaries = async () => {
  const studentPages = await getStudentPages();
  if (!studentPages.length) return;
  const selectedMonth = getSelectedMonth();
  const dryRun = readFlag(["-t", "--test", "--dry-run"]);
  const summaryFileBase = `summaries_${selectedMonth}`;
  const summaryFilePath = `${summaryFileBase}.md`;
  let summaries = readSummaryFile(summaryFilePath);

  let stats = {
    students: studentPages.length,
    notesEntries: 0,
    skippedExisting: 0,
    placeholders: 0,
    summarized: 0,
  };

  await Promise.all(
    studentPages.map(async (student) => {
      const studentNotes = await getClassNotes(student, selectedMonth);
      if (!studentNotes.length) return;
      stats.notesEntries += studentNotes.length;
      await Promise.all(
        studentNotes.map(async ({ date, classLine, notes }) => {
          const header = buildSummaryHeader({ date, classLine });
          const existingEntry = getExistingSummary({
            summaries,
            student: student.child_page.title,
            date,
            classLine,
          });
          const existingSummary = existingEntry?.summary ?? null;
          const updateTitleIfNeeded = () => {
            if (existingEntry && existingEntry.titleText !== header) {
              existingEntry.titleText = header;
              console.log(
                `[makeClassSummaries] Updated title for ${student.child_page.title} ${date}: ${header}`,
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
            return;
          }
          if (dryRun) {
            updateTitleIfNeeded();
            return;
          }
          const newSummaryText = !hasEnoughNotes
            ? `NOT ENOUGH NOTES ${notes}`
            : await summarizeText(notes);
          addSummary({
            summaries,
            studentName: student.child_page.title,
            date,
            classLine,
            newSummaryText,
          });
          hasEnoughNotes ? (stats.summarized++) : (stats.placeholders++);
        }),
      );
    }),
  );
  if (!dryRun) writeSummaryFile(summaryFilePath, summaries);
  const mode = dryRun ? "DRY RUN" : "DONE";
  console.log(
    `[makeClassSummaries] ${mode}: students=${stats.students}, entries=${stats.notesEntries}, skipped=${stats.skippedExisting}, summarized=${stats.summarized}, placeholders=${stats.placeholders}${dryRun ? '' : `, wrote=${summaryFilePath}`}`,
  );
};

if (require.main === module) {
  compileSummaries();
}
