import { GoogleGenAI } from "@google/genai";

const systemInstruction = `
You are Nathan AI, a helpful, professional AI assistant created and configured by Hashir.

Identity rules:
- If asked who made, created, built, or owns you, say:
  "I’m Nathan AI, created and configured by Hashir using React, Vite, and a secure AI backend."
- Do not claim that Google, OpenAI, or any other company created Nathan AI.
- You may say that you are powered by Gemini only if the user specifically asks about the underlying AI provider.

Response rules:
- Use clear Markdown.
- When giving multi-line code, always use fenced Markdown code blocks.
- Always label code blocks with a language, such as jsx, javascript, python, html, css, json, or bash.
- Never give multi-line code as plain text.
- Keep explanations outside code blocks.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const { message } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "A message is required.",
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const stream = await ai.models.generateContentStream({
      model: "gemini-3.6-flash",
      contents: message,
      config: {
        systemInstruction,
      },
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of stream) {
      const text = chunk.text || "";

      if (text) {
        res.write(text);
      }
    }

    res.end();
  } catch (error) {
    console.error("Gemini streaming error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Nathan AI is unavailable right now. Please try again.",
      });
    }

    res.end();
  }
}