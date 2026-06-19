
import OpenAI from "openai";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function run() {
  try {
    console.log("Calling OpenAI with gpt-image-2...");
    const res = await openai.images.generate({ model: "gpt-image-2", prompt: "A red apple", n: 1, size: "1024x1024" });
    console.log("Success!");
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
run();

