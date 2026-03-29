const fs = require("fs");
const path = require("path");

const MONTH_REGEX = /^\d{4}-\d{2}$/;
const NOTES_MARKDOWN_FORMAT_MARKER = "<!-- notion-format: markdown-v1 -->";

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const pickString = (entry, keys) => {
  for (const key of keys) {
    if (isNonEmptyString(entry?.[key])) {
      return entry[key].trim();
    }
  }
  return null;
};

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

const findExistingPath = (candidatePaths) =>
  candidatePaths.find((candidate) => fs.existsSync(candidate)) ?? null;

const getMonthIndexCandidates = (artifactRoot, month) => [
  path.join(artifactRoot, "notes", "indexes", `${month}.json`),
];

const normalizeEntryLabel = (entry) =>
  pickString(entry, [
    "entityLabel",
    "entityName",
    "displayLabel",
    "displayName",
    "studentName",
    "label",
    "pageLabel",
  ]);

const normalizeEntitySlug = (entry) =>
  pickString(entry, [
    "entitySlug",
    "studentSlug",
  ]);

const readMatchedNotesText = (entry, indexPath, artifactRoot) => {
  const candidates = [
    entry.notesPath,
    entry.sessionPath ? path.join(entry.sessionPath, "notes.md") : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolvedCandidates = path.isAbsolute(candidate)
      ? [candidate]
      : [
        path.resolve(path.dirname(indexPath), candidate),
        path.resolve(artifactRoot, candidate),
      ];
    for (const resolved of resolvedCandidates) {
      if (!fs.existsSync(resolved)) continue;
      const raw = fs.readFileSync(resolved, "utf-8");
      return raw.replace(new RegExp(`^${NOTES_MARKDOWN_FORMAT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "u"), "").trim();
    }
  }

  throw new Error(
    `[artifactIndexReader] Unable to read matched notes file for ${entry.pageId} ${entry.blockId}`,
  );
};

const normalizeMatchedEntry = (entry, indexPath, artifactRoot) => {
  const displayLabel = normalizeEntryLabel(entry);
  const entitySlug = normalizeEntitySlug(entry);
  const requiredStringFields = [
    "classDate",
    "sessionId",
    "sessionPath",
    "notesPath",
    "pageId",
    "blockId",
    "classLine",
  ];

  const missing = requiredStringFields.filter((field) => !isNonEmptyString(entry?.[field]));
  if (!displayLabel) missing.push("displayLabel");
  if (!isNonEmptyString(entry?.studentSlug) && !entitySlug) missing.push("studentSlug");
  if (missing.length > 0) {
    throw new Error(
      `[artifactIndexReader] Invalid matched entry in ${indexPath}: missing ${missing.join(", ")}`,
    );
  }

  return {
    entitySlug,
    studentSlug: isNonEmptyString(entry?.studentSlug) ? entry.studentSlug.trim() : entitySlug,
    displayLabel,
    classDate: entry.classDate.trim(),
    sessionId: entry.sessionId.trim(),
    sessionPath: entry.sessionPath.trim(),
    notesPath: entry.notesPath.trim(),
    pageId: entry.pageId.trim(),
    blockId: entry.blockId.trim(),
    classLine: entry.classLine.trim(),
    notesText: readMatchedNotesText(entry, indexPath, artifactRoot),
  };
};

const normalizeUnmatchedEntry = (entry, indexPath) => {
  const displayLabel = normalizeEntryLabel(entry);
  const entitySlug = normalizeEntitySlug(entry);
  const requiredStringFields = [
    "classDate",
    "pageId",
    "blockId",
    "classLine",
  ];
  const missing = requiredStringFields.filter((field) => !isNonEmptyString(entry?.[field]));
  if (!displayLabel) missing.push("displayLabel");
  const notesText = pickString(entry, ["notesText", "notes"]);
  if (!notesText) missing.push("notesText");
  if (missing.length > 0) {
    throw new Error(
      `[artifactIndexReader] Invalid unmatched entry in ${indexPath}: missing ${missing.join(", ")}`,
    );
  }

  return {
    entitySlug: entitySlug ? entitySlug : null,
    studentSlug: entry.studentSlug ?? null,
    displayLabel,
    classDate: entry.classDate.trim(),
    pageId: entry.pageId.trim(),
    blockId: entry.blockId.trim(),
    classLine: entry.classLine.trim(),
    notesText,
  };
};

const extractEntryArrays = (payload, indexPath) => {
  if (Array.isArray(payload)) {
    return { matched: payload, unmatched: [] };
  }

  if (payload && typeof payload === "object") {
    const matched =
      payload.matchedEntries ??
      payload.matched ??
      payload.entries ??
      [];
    const unmatched = payload.unmatchedEntries ?? payload.unmatched ?? [];
    if (Array.isArray(matched) && Array.isArray(unmatched)) {
      return { matched, unmatched };
    }
  }

  throw new Error(
    `[artifactIndexReader] Unsupported month index shape in ${indexPath}; expected matched/unmatched arrays`,
  );
};

const readMonthArtifactIndex = ({ artifactRoot, month }) => {
  if (!isNonEmptyString(artifactRoot)) {
    throw new Error("[artifactIndexReader] ETH_ARTIFACT_ROOT is required");
  }
  if (!MONTH_REGEX.test(month)) {
    throw new Error(`[artifactIndexReader] Invalid month "${month}"`);
  }

  const indexPath = findExistingPath(getMonthIndexCandidates(artifactRoot, month));
  if (!indexPath) {
    throw new Error(
      `[artifactIndexReader] Month index not found for ${month} under ${artifactRoot}`,
    );
  }

  const payload = readJsonFile(indexPath);
  const { matched, unmatched } = extractEntryArrays(payload, indexPath);

  return {
    indexPath,
    matchedEntries: matched.map((entry) => normalizeMatchedEntry(entry, indexPath, artifactRoot)),
    unmatchedEntries: unmatched.map((entry) => normalizeUnmatchedEntry(entry, indexPath)),
  };
};

module.exports = {
  readMonthArtifactIndex,
};
