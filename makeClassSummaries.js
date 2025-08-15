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
  summaryAlreadyExists,
} = require("./classSummaryHelpers");
const {
  summarizeText,
} = require("./openAiApi");

const STUDENT_LIST_PAGE_ID = process.env.STUDENT_LIST_PAGE_ID;

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
  console.log("[makeClassSummaries] Fetching student pages...");
  const blocks = await fetchBlocks(STUDENT_LIST_PAGE_ID);
  const pages = blocks.filter((b) => b.type === "child_page");
  console.log(`[makeClassSummaries] Found ${pages.length} student pages.`);
  return pages;
};

const getClassNotes = async (pageId, selectedMonth) => {
  console.log(
    `[makeClassSummaries] Fetching class summaries for pageId: ${pageId}`,
  );
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
  console.log("[makeClassSummaries] Starting summary compilation...");
  const studentPages = await getStudentPages();
  if (!studentPages.length) {
    console.log("[makeClassSummaries] No student pages found.");
    return;
  }
  const selectedMonth = getSelectedMonth();
  console.log(`[makeClassSummaries] Selected month: ${selectedMonth}`);
  const summaryFilePath = `summaries_${selectedMonth}.txt`;
  let summaries = readSummaryFile(summaryFilePath);

  await Promise.all(
    studentPages.map(async (student) => {
      const studentNotes = await getClassNotes(student.id, selectedMonth);
      if (!studentNotes.length) {
        console.log(JSON.stringify(studentNotes, null, 2));
        console.log(
          `[makeClassSummaries] No notes for student: ${student.child_page.title}`,
        );
        return;
      }
      await Promise.all(
        studentNotes.map(async ({ date, notes }) => {
          if (summaryAlreadyExists({
            summaries,
            student: student.child_page.title,
            date,
          })) {
            console.log(
              `[makeClassSummaries] Summary already exists for ${student.child_page.title} on ${date}, skipping.`,
            );
            return;
          }
          const hasEnoughNotes = notes.length >= 30;
          const newSummaryText =
            !hasEnoughNotes ? `NOT ENOUGH NOTES ${notes}` : await summarizeText(notes);
          addSummary({ summaries, studentName: student.child_page.title, date, newSummaryText });
          console.log(
            `[makeClassSummaries] Added summary for ${student.child_page.title} on ${date}`,
          );
        }),
      );
    }),
  );
  writeSummaryFile(summaryFilePath, summaries);
  console.log(`[makeClassSummaries] Wrote summaries to ${summaryFilePath}`);
};

if (require.main === module) {
  compileSummaries();
}
