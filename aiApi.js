const axios = require("axios");
require("dotenv").config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION ?? "2023-06-01";
const ANTHROPIC_MAX_CONCURRENCY = Number.parseInt(
  process.env.ANTHROPIC_MAX_CONCURRENCY ?? "2",
  10,
);
const ANTHROPIC_MAX_RETRIES = Number.parseInt(
  process.env.ANTHROPIC_MAX_RETRIES ?? "4",
  10,
);
const ANTHROPIC_RETRY_BASE_MS = Number.parseInt(
  process.env.ANTHROPIC_RETRY_BASE_MS ?? "1500",
  10,
);
const ANTHROPIC_TIMEOUT_MS = Number.parseInt(
  process.env.ANTHROPIC_TIMEOUT_MS ?? "45000",
  10,
);

const anthropic = axios.create({
  baseURL: "https://api.anthropic.com/v1",
  headers: {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
    "Content-Type": "application/json",
  },
});

let activeRequests = 0;
const waitingResolvers = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getPositiveInteger = (value, fallback) => (
  Number.isInteger(value) && value > 0 ? value : fallback
);

const getNonNegativeInteger = (value, fallback) => (
  Number.isInteger(value) && value >= 0 ? value : fallback
);

const MAX_CONCURRENCY = getPositiveInteger(ANTHROPIC_MAX_CONCURRENCY, 2);
const MAX_RETRIES = getNonNegativeInteger(ANTHROPIC_MAX_RETRIES, 4);
const RETRY_BASE_MS = getPositiveInteger(ANTHROPIC_RETRY_BASE_MS, 1500);
const REQUEST_TIMEOUT_MS = getPositiveInteger(ANTHROPIC_TIMEOUT_MS, 45000);

anthropic.defaults.timeout = REQUEST_TIMEOUT_MS;

const acquireRequestSlot = async () => {
  if (activeRequests < MAX_CONCURRENCY) {
    activeRequests++;
    return;
  }

  await new Promise((resolve) => {
    waitingResolvers.push(resolve);
  });
};

const releaseRequestSlot = () => {
  const nextResolver = waitingResolvers.shift();
  if (nextResolver) {
    nextResolver();
    return;
  }

  activeRequests = Math.max(0, activeRequests - 1);
};

const withConcurrencyLimit = async (fn) => {
  await acquireRequestSlot();
  try {
    return await fn();
  } finally {
    releaseRequestSlot();
  }
};

const extractTextContent = (content) => {
  if (!Array.isArray(content)) return null;

  const text = content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return text || null;
};

const getErrorMessage = (error) =>
  error?.response?.data?.error?.message ?? error?.message ?? "Unknown error";

const isRetryableAnthropicError = (error) => {
  const status = error?.response?.status;
  const message = getErrorMessage(error).toLowerCase();

  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;

  return (
    message.includes("rate limit") ||
    message.includes("concurrent connections") ||
    message.includes("overloaded") ||
    message.includes("timeout")
  );
};

const getRetryDelayMs = (attemptNumber) => {
  const exponentialDelay = RETRY_BASE_MS * 2 ** (attemptNumber - 1);
  const jitter = Math.floor(Math.random() * RETRY_BASE_MS);
  return exponentialDelay + jitter;
};

const summarizeText = async (text) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("[aiApi] summarizeText error: Missing ANTHROPIC_API_KEY");
    return null;
  }

  const system = `You summarize English class notes.
Output rules:
- Return exactly one line.
- Comma-separated phrases only.
- Include both: (1) topic(s) and (2) grammar practiced.
- No intro, no explanation, no quotes, no numbering, no period at end.
- If grammar is not explicit, infer likely grammar from the notes.
- Use less than 20 words total.`;
  const user = `Summarize these notes:

<notes>
${text}
</notes>`;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const { data } = await withConcurrencyLimit(async () =>
        anthropic.post("/messages", {
          model: ANTHROPIC_MODEL,
          max_tokens: 80,
          system,
          messages: [{ role: "user", content: user }],
        }),
      );

      return extractTextContent(data?.content);
    } catch (error) {
      const message = getErrorMessage(error);
      const canRetry =
        attempt <= MAX_RETRIES && isRetryableAnthropicError(error);

      if (!canRetry) {
        console.error("[aiApi] summarizeText error:", message);
        return null;
      }

      const retryDelayMs = getRetryDelayMs(attempt);
      console.warn(
        `[aiApi] summarizeText retry ${attempt}/${MAX_RETRIES} in ${retryDelayMs}ms: ${message}`,
      );
      await sleep(retryDelayMs);
    }
  }

  return null;
};

module.exports = {
  summarizeText,
};
