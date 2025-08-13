const axios = require("axios");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = axios.create({
  baseURL: "https://api.openai.com/v1",
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const summarizeText = async (text) => {
  try {
    console.log("[makeClassSummaries] Summarizing text with OpenAI...");
    const system =
      "For all lists provide a comma separated list. Use any style.";
    const user = `Provide a summary in 20 words or less of these notes, as a list of phrases. Please give the topic and grammar practiced. Use any style. For example: ‘Future tense, past tense, present continuous, grammar corrections, business vocabulary, pronunciation, onomatopoeia, to be past tense, relaxed pronunciation.’ Notes: ${text}`;
    const { data } = await openai.post("/chat/completions", {
      model: "o3-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return data.choices[0].message.content;
  } catch (e) {
    console.error("[makeClassSummaries] Error summarizing text:", e.message);
    return text;
  }
};

module.exports = {
  summarizeText,
};