const axios = require("axios");
require("dotenv").config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION ?? "2023-06-01";

const anthropic = axios.create({
  baseURL: "https://api.anthropic.com/v1",
  headers: {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
    "Content-Type": "application/json",
  },
});

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

const summarizeText = async (text) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("[aiApi] summarizeText error: Missing ANTHROPIC_API_KEY");
    return null;
  }

  try {
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
    const { data } = await anthropic.post("/messages", {
      model: ANTHROPIC_MODEL,
      max_tokens: 80,
      system,
      messages: [{ role: "user", content: user }],
    });

    return extractTextContent(data?.content);
  } catch (e) {
    const message = e.response?.data?.error?.message ?? e.message;
    console.error("[aiApi] summarizeText error:", message);
    return null;
  }
};

module.exports = {
  summarizeText,
};
