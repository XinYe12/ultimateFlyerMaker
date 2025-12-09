// config/openaiConfig.js
import "dotenv/config";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment (.env file).");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// OpenAI embedding model
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-large";
