import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const FREE_DAILY_MESSAGE_LIMIT = 20;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_CHARACTERS = 12000;

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

Conversation rules:
- Use previous conversation messages as context.
- Answer the latest user request directly.
- If the latest message refers to earlier details, use the available chat history rather than saying you do not remember.
- Do not invent details that are not present in the conversation.

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

function getUtcDate() {
  return new Date().toISOString().slice(0, 10);
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

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  const cleaned = history
    .filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "model") &&
        typeof item.content === "string" &&
        item.content.trim(),
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, MAX_HISTORY_MESSAGE_CHARACTERS),
    }));

  const alternating = [];

  for (const item of cleaned) {
    const previous = alternating[alternating.length - 1];

    if (!previous || previous.role !== item.role) {
      alternating.push(item);
      continue;
    }

    previous.content = `${previous.content}\n\n${item.content}`.slice(
      0,
      MAX_HISTORY_MESSAGE_CHARACTERS,
    );
  }

  if (alternating[0]?.role === "model") {
    alternating.shift();
  }

  return alternating.map((item) => ({
    role: item.role,
    parts: [{ text: item.content }],
  }));
}

async function checkAndIncrementUsage({ adminClient, userId, isAdmin }) {
  if (isAdmin) {
    return {
      isAdmin: true,
      limit: null,
      used: null,
      remaining: null,
      limitReached: false,
    };
  }

  const usageDate = getUtcDate();

  const { data: existingUsage, error: selectError } = await adminClient
    .from("daily_usage")
    .select("message_count")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (selectError) throw selectError;

  const usedBeforeRequest = existingUsage?.message_count || 0;

  if (usedBeforeRequest >= FREE_DAILY_MESSAGE_LIMIT) {
    return {
      isAdmin: false,
      limit: FREE_DAILY_MESSAGE_LIMIT,
      used: usedBeforeRequest,
      remaining: 0,
      limitReached: true,
    };
  }

  const usedAfterRequest = usedBeforeRequest + 1;

  const { error: upsertError } = await adminClient.from("daily_usage").upsert(
    {
      user_id: userId,
      usage_date: usageDate,
      message_count: usedAfterRequest,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,usage_date",
    },
  );

  if (upsertError) throw upsertError;

  return {
    isAdmin: false,
    limit: FREE_DAILY_MESSAGE_LIMIT,
    used: usedAfterRequest,
    remaining: FREE_DAILY_MESSAGE_LIMIT - usedAfterRequest,
    limitReached: false,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const { message, history, attachment } = req.body || {};

  if ((!message || typeof message !== "string") && !attachment) {
    return res.status(400).json({
      error: "A message or attachment is required.",
    });
  }

  if (attachment && typeof attachment !== "object") {
    return res.status(400).json({
      error: "Invalid attachment.",
    });
  }

  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({
      error: "Please log in before chatting.",
    });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

    if (!supabaseUrl || !serviceRoleKey || !adminEmail) {
      throw new Error("Server environment variables are missing.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(accessToken);

    if (userError || !user) {
      return res.status(401).json({
        error: "Your session is invalid or expired. Please log in again.",
      });
    }

    const isAdmin = user.email?.toLowerCase() === adminEmail;

    let latestParts = [
      {
        text:
          trimmedMessage ||
          "Please analyze the attached file and explain what you find.",
      },
    ];

    if (attachment) {
      const { name, path, type, size } = attachment;

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

      if (!path.startsWith(`${user.id}/`)) {
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
        latestParts = [
          {
            text: `${
              trimmedMessage || "Please analyze this image."
            }\n\nAttached image: ${displayName}`,
          },
          {
            inlineData: {
              mimeType: safeMimeType,
              data: fileData,
            },
          },
        ];
      } else if (safeMimeType === "application/pdf") {
        latestParts = [
          {
            text: `${
              trimmedMessage || "Please analyze and summarize this PDF."
            }\n\nAttached PDF: ${displayName}`,
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

        latestParts = [
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

    const usage = await checkAndIncrementUsage({
      adminClient,
      userId: user.id,
      isAdmin,
    });

    if (usage.limitReached) {
      return res.status(429).json({
        error: `Daily limit reached (${FREE_DAILY_MESSAGE_LIMIT} messages). Please try again tomorrow.`,
        usage,
      });
    }

    const safeHistory = sanitizeHistory(history);

if (safeHistory[safeHistory.length - 1]?.role === "user") {
  safeHistory.pop();
}

const contents = [
  ...safeHistory,
  {
    role: "user",
    parts: latestParts,
  },
];

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const stream = await ai.models.generateContentStream({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
      },
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader(
      "X-Nathan-Usage",
      JSON.stringify({
        limit: usage.limit,
        used: usage.used,
        remaining: usage.remaining,
        isAdmin: usage.isAdmin,
      }),
    );

    for await (const chunk of stream) {
      const text = chunk.text || "";

      if (text) {
        res.write(text);
      }
    }

    res.end();
  } catch (error) {
    console.error("Gemini streaming error:", {
  message: error?.message,
  status: error?.status,
  name: error?.name,
  stack: error?.stack,
});
    if (!res.headersSent) {
      return res.status(500).json({
        error:
          "Nathan AI is temporarily unavailable. Please wait a moment and try again.",
      });
    }

    res.end();
  }
}