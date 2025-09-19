require("dotenv").config();

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

const processToggleBlock = async (block, selectedMonth) => {
  const title = block.toggle.rich_text.map((t) => t.plain_text).join(" ");
  const extracted = extractDateFromText(title);
  if (!extracted || !isDateInSelectedMonth(extracted, selectedMonth))
    return null;
  const children = await fetchBlocks(block.id);
  if (!children || !children.length) {
    console.log(`[makeClassSummaries] No children found for block: ${block.id}`);
    return null;
  }
  const notes = children
    .map((b) => b[b.type]?.rich_text?.map((t) => t.plain_text).join(" ") || "")
    .join("\n");
  return { date: extracted.fullDate, notes };
};

const getStudentPages = async () => {
  const blocks = await fetchBlocks(STUDENT_LIST_PAGE_ID);
  return blocks.filter((b) => b.type === "child_page");
};

const getClassNotes = async (pageId, selectedMonth) => {
  const blocks = await fetchBlocks(pageId);
  const togglesWithDates = blocks.filter(
    (b) =>
      b.type === "toggle" &&
      b.toggle.rich_text.some((t) =>
        /(\d{4})-(\d{2})-(\d{2})/.test(t.plain_text),
      ),
  );
  const processed = await Promise.all(
    togglesWithDates.map((b) => processToggleBlock(b, selectedMonth)),
  );
  const valid = processed.filter(Boolean);
  return valid;
};

const compileSummaries = async () => {
  const studentPages = await getStudentPages();
  if (!studentPages.length) return;
  const selectedMonth = getSelectedMonth();
  const dryRun = readFlag(["-t", "--test", "--dry-run"]);
  const summaryFilePath = `summaries_${selectedMonth}.txt`;
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
      const studentNotes = await getClassNotes(student.id, selectedMonth);
      if (!studentNotes.length) return;
      stats.notesEntries += studentNotes.length;
      await Promise.all(
        studentNotes.map(async ({ date, notes }) => {
          const existingSummary = getExistingSummary({
            summaries,
            student: student.child_page.title,
            date,
          });
          const hasEnoughNotes = notes.length >= MIN_NOTES_LEN;
          if (
            existingSummary &&
            (!existingSummary.startsWith("NOT ENOUGH NOTES") || !hasEnoughNotes)
          ) {
            stats.skippedExisting++;
            return;
          }
          if (dryRun) return;
          const newSummaryText = !hasEnoughNotes
            ? `NOT ENOUGH NOTES ${notes}`
            : await summarizeText(notes);
          addSummary({
            summaries,
            studentName: student.child_page.title,
            date,
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
