import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_FILE_TYPES = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt"],
  "text/markdown": ["md"],
  "text/javascript": ["js"],
  "application/javascript": ["js"],
  "text/jsx": ["jsx"],
  "text/typescript": ["ts"],
  "application/typescript": ["ts"],
  "text/tsx": ["tsx"],
  "text/html": ["html"],
  "text/css": ["css"],
  "application/json": ["json"],
  "text/x-python": ["py"],
  "application/octet-stream": [
    "txt",
    "md",
    "js",
    "jsx",
    "ts",
    "tsx",
    "html",
    "css",
    "json",
    "py",
  ],
};

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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

function getAccessToken(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7);
}

function getExtension(fileName = "") {
  const lastDot = fileName.lastIndexOf(".");

  if (lastDot === -1) return "";

  return fileName.slice(lastDot + 1).toLowerCase();
}

function isAllowedFile(fileName, mimeType) {
  const extension = getExtension(fileName);
  const allowedExtensions = ALLOWED_FILE_TYPES[mimeType];

  return Boolean(
    allowedExtensions && extension && allowedExtensions.includes(extension),
  );
}

function isTextFile(mimeType, fileName) {
  const extension = getExtension(fileName);

  return (
    mimeType.startsWith("text/") ||
    [
      "txt",
      "md",
      "js",
      "jsx",
      "ts",
      "tsx",
      "html",
      "css",
      "json",
      "py",
    ].includes(extension)
  );
}

function isImageFile(mimeType) {
  return IMAGE_TYPES.has(mimeType);
}

function getSafeMimeType(mimeType, fileName) {
  if (mimeType !== "application/octet-stream") {
    return mimeType;
  }

  const extension = getExtension(fileName);

  const mimeTypesByExtension = {
    txt: "text/plain",
    md: "text/markdown",
    js: "text/javascript",
    jsx: "text/jsx",
    ts: "text/typescript",
    tsx: "text/tsx",
    html: "text/html",
    css: "text/css",
    json: "application/json",
    py: "text/x-python",
  };

  return mimeTypesByExtension[extension] || mimeType;
}

function safeAttachmentName(name) {
  return String(name || "attachment")
    .replace(/[\r\n]/g, " ")
    .slice(0, 160);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const { message, attachment } = req.body || {};

  if ((!message || typeof message !== "string") && !attachment) {
    return res.status(400).json({
      error: "A message or attachment is required.",
    });
  }

  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (attachment && typeof attachment !== "object") {
    return res.status(400).json({
      error: "Invalid attachment.",
    });
  }

  try {
    let contentParts = [
      {
        text:
          trimmedMessage ||
          "Please analyze the attached file and explain what you find.",
      },
    ];

    if (attachment) {
      const {
        name,
        path,
        type,
        size,
      } = attachment;

      const accessToken = getAccessToken(req);

      if (!accessToken) {
        return res.status(401).json({
          error: "Please log in before sending an attachment.",
        });
      }

      if (
        !name ||
        !path ||
        !type ||
        !Number.isFinite(size) ||
        size <= 0 ||
        size > MAX_FILE_SIZE
      ) {
        return res.status(400).json({
          error: "The attachment details are invalid.",
        });
      }

      const safeMimeType = getSafeMimeType(type, name);

      if (!isAllowedFile(name, safeMimeType)) {
        return res.status(400).json({
          error:
            "Unsupported file type. Use PNG, JPG, WEBP, PDF, TXT, MD, JS, JSX, TS, TSX, HTML, CSS, JSON, or PY.",
        });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Attachment server configuration is missing.");
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const {
        data: { user },
        error: userError,
      } = await adminClient.auth.getUser(accessToken);

      if (userError || !user) {
        return res.status(401).json({
          error: "Your session is invalid or expired.",
        });
      }

      const expectedPrefix = `${user.id}/`;

      if (!path.startsWith(expectedPrefix)) {
        return res.status(403).json({
          error: "You cannot access this attachment.",
        });
      }

      const { data: attachmentFile, error: downloadError } =
        await adminClient.storage.from("chat-attachments").download(path);

      if (downloadError || !attachmentFile) {
        return res.status(404).json({
          error: "Attachment file could not be found.",
        });
      }

      if (attachmentFile.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: "Attachment exceeds the 5 MB limit.",
        });
      }

      const fileBuffer = Buffer.from(await attachmentFile.arrayBuffer());

      if (fileBuffer.length === 0 || fileBuffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: "Attachment content is invalid or too large.",
        });
      }

      const fileData = fileBuffer.toString("base64");
      const displayName = safeAttachmentName(name);

      if (isImageFile(safeMimeType)) {
        contentParts = [
          {
            text: `${trimmedMessage || "Please analyze this image."}\n\nAttached image: ${displayName}`,
          },
          {
            inlineData: {
              mimeType: safeMimeType,
              data: fileData,
            },
          },
        ];
      } else if (safeMimeType === "application/pdf") {
        contentParts = [
          {
            text: `${trimmedMessage || "Please analyze and summarize this PDF."}\n\nAttached PDF: ${displayName}`,
          },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: fileData,
            },
          },
        ];
      } else if (isTextFile(safeMimeType, name)) {
        const textContent = fileBuffer.toString("utf8").slice(0, 200000);

        contentParts = [
          {
            text: `${trimmedMessage || "Please analyze this attached file."}

Attached file name: ${displayName}
Attached file type: ${safeMimeType}

--- BEGIN ATTACHED FILE ---
${textContent}
--- END ATTACHED FILE ---`,
          },
        ];
      } else {
        return res.status(400).json({
          error: "This file type cannot be processed.",
        });
      }
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const stream = await ai.models.generateContentStream({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: contentParts,
        },
      ],
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