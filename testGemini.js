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

const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
});

const message = "Who created you?";

try {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemInstruction}\n\nUser message: ${message}`,
          },
        ],
      },
    ],
  });

  const text =
    response.text ||
    "Sorry, I could not generate a response right now.";

  console.log("Gemini response:\n", text);
} catch (error) {
  console.error("Gemini API error:", error);
}