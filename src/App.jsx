import { jsPDF } from "jspdf";
import AdminPanel from "./components/AdminPanel";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";
import { supabase } from "./lib/supabase";
import AuthPage from "./components/AuthPage";
import ChatSidebar from "./components/ChatSidebar";

const starterMessages = [
  {
    id: 1,
    role: "assistant",
    content:
      "Hi! I'm Nathan AI. Ask me about web development, React, JavaScript, AI, or your next app idea.",
  },
];
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "pdf",
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
]);

function getFileExtension(fileName = "") {
  const lastDot = fileName.lastIndexOf(".");

  if (lastDot === -1) return "";

  return fileName.slice(lastDot + 1).toLowerCase();
}

function normalizeAttachmentType(file) {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }

  const extension = getFileExtension(file.name);

  const typesByExtension = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    pdf: "application/pdf",
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

  return typesByExtension[extension] || "application/octet-stream";
}

function safeFileName(fileName = "") {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}
function buildConversationHistory(messagesToSend) {
  return messagesToSend
    .filter(
      (message) =>
        !message.loading &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        !String(message.id).startsWith("user-") &&
        !String(message.id).startsWith("assistant-"),
    )
    .slice(-12)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      content: message.content.slice(0, 12000),
    }));
}

async function getApiErrorMessage(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const result = await response.json();

    return result.error || fallbackMessage;
  }

  const text = await response.text();

  return text || fallbackMessage;
}
function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [conversationsTrigger, setConversationsTrigger] = useState(0);
   const [isSending, setIsSending] = useState(false);
const messagesEndRef = useRef(null);
const [copiedMessageId, setCopiedMessageId] = useState(null);
const [feedbackByMessage, setFeedbackByMessage] = useState({});
const [regeneratingMessageId, setRegeneratingMessageId] = useState(null);
const [selectedAttachment, setSelectedAttachment] = useState(null);
const [attachmentError, setAttachmentError] = useState("");
const [uploadingAttachment, setUploadingAttachment] = useState(false);
const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
const [showAdminPanel, setShowAdminPanel] = useState(false);
const [showExportMenu, setShowExportMenu] = useState(false);
const [exporting, setExporting] = useState(false);
  useEffect(() => {
    async function loadSession() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      setSession(currentSession);
      setAuthLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadLatestConversation() {
      if (!session?.user?.id) return;

      setChatLoading(true);

      const { data: conversations, error: conversationError } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (conversationError) {
        console.error("Could not load conversations:", conversationError);
        setChatLoading(false);
        return;
      }

      if (!conversations || conversations.length === 0) {
        setConversationId(null);
        setMessages(starterMessages);
        setChatLoading(false);
        return;
      }

      const latestConversation = conversations[0];

      const { data: savedMessages, error: messagesError } = await supabase
        .from("messages")
         .select(
  "id, role, content, created_at, feedback, regenerated, attachment_name, attachment_path, attachment_type, attachment_size",
)
        .eq("conversation_id", latestConversation.id)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Could not load messages:", messagesError);
        setChatLoading(false);
        return;
      }

      setConversationId(latestConversation.id);
      setMessages(savedMessages || starterMessages);
      setChatLoading(false);
    }

    loadLatestConversation();
  }, [session?.user?.id, conversationsTrigger]);
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({
    behavior: "smooth",
    block: "end",
  });
}, [messages]);
function handleAttachmentChange(event) {
  const file = event.target.files?.[0];

  event.target.value = "";
  setShowAttachmentMenu(false);

  if (!file) return;

  const extension = getFileExtension(file.name);

  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
    setAttachmentError(
      "Unsupported file. Use PNG, JPG, WEBP, PDF, TXT, MD, JS, JSX, TS, TSX, HTML, CSS, JSON, or PY.",
    );
    return;
  }

  if (file.size <= 0) {
    setAttachmentError("This file is empty.");
    return;
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    setAttachmentError("File is too large. Maximum size is 5 MB.");
    return;
  }

  setAttachmentError("");
  setSelectedAttachment({
    file,
    name: file.name,
    type: normalizeAttachmentType(file),
    size: file.size,
  });
}

function removeAttachment() {
  if (uploadingAttachment || isSending) return;

  setSelectedAttachment(null);
  setAttachmentError("");
  setShowAttachmentMenu(false);
}

async function uploadAttachment(userId, attachment) {
  const extension = getFileExtension(attachment.name);
  const randomId = crypto.randomUUID();
  const storagePath = `${userId}/${randomId}-${safeFileName(attachment.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("chat-attachments")
    .upload(storagePath, attachment.file, {
      contentType: attachment.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Could not upload attachment. Please try again.");
  }

  return {
    name: attachment.name,
    path: storagePath,
    type: attachment.type,
    size: attachment.size,
    extension,
  };
}
 async function handleSend(event) {
  event.preventDefault();

  const text = input.trim();
  const userId = session?.user?.id;
  const attachmentToSend = selectedAttachment;

  if (
    (!text && !attachmentToSend) ||
    !userId ||
    isSending ||
    uploadingAttachment
  ) {
    return;
  }

  setIsSending(true);
  setAttachmentError("");

  const history = buildConversationHistory(messages);

  const localUserMessage = {
    id: `user-${Date.now()}`,
    role: "user",
    content: text || `Attached file: ${attachmentToSend.name}`,
    attachment_name: attachmentToSend?.name || null,
    attachment_type: attachmentToSend?.type || null,
    attachment_size: attachmentToSend?.size || null,
  };

  const loadingMessageId = `assistant-${Date.now()}`;

  setMessages((currentMessages) => [...currentMessages, localUserMessage]);
  setInput("");
  setSelectedAttachment(null);
  setShowAttachmentMenu(false);

  setMessages((currentMessages) => [
    ...currentMessages,
    {
      id: loadingMessageId,
      role: "assistant",
      content: "Nathan AI is thinking...",
      loading: true,
    },
  ]);

  let uploadedAttachment = null;
  let activeConversationId = conversationId;
  let userMessageSaved = false;

  try {
    setUploadingAttachment(Boolean(attachmentToSend));

    if (attachmentToSend) {
      uploadedAttachment = await uploadAttachment(userId, attachmentToSend);
    }

    if (!activeConversationId) {
      const { data: newConversation, error: createConversationError } =
        await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            title: text || `File: ${attachmentToSend.name}`,
          })
          .select("id")
          .single();

      if (createConversationError) throw createConversationError;

      activeConversationId = newConversation.id;
      setConversationId(activeConversationId);
    }

    const savedUserContent =
      text || `Attached file: ${uploadedAttachment?.name || attachmentToSend.name}`;

    const { data: savedUserMessage, error: saveUserMessageError } =
      await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: "user",
          content: savedUserContent,
          attachment_name: uploadedAttachment?.name || null,
          attachment_path: uploadedAttachment?.path || null,
          attachment_type: uploadedAttachment?.type || null,
          attachment_size: uploadedAttachment?.size || null,
        })
        .select(
          "id, role, content, created_at, feedback, regenerated, attachment_name, attachment_path, attachment_type, attachment_size",
        )
        .single();

    if (saveUserMessageError) throw saveUserMessageError;

    userMessageSaved = true;

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === localUserMessage.id ? savedUserMessage : message,
      ),
    );

    const {
      data: { session: latestSession },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !latestSession?.access_token) {
      throw new Error("Your session expired. Please log in again.");
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${latestSession.access_token}`,
      },
      body: JSON.stringify({
        message: text,
        history,
        attachment: uploadedAttachment
          ? {
              name: uploadedAttachment.name,
              path: uploadedAttachment.path,
              type: uploadedAttachment.type,
              size: uploadedAttachment.size,
            }
          : null,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(
          response,
          "Nathan AI could not respond right now. Please try again.",
        ),
      );
    }

    if (!response.body) {
      throw new Error("Streaming response is not available.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiReply = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      aiReply += decoder.decode(value, { stream: true });

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === loadingMessageId
            ? {
                ...message,
                content: aiReply,
              }
            : message,
        ),
      );
    }

    aiReply += decoder.decode();

    if (!aiReply.trim()) {
      throw new Error(
        "Nathan AI returned an empty response. Please try again.",
      );
    }

    const { data: savedAssistantMessage, error: saveAssistantMessageError } =
      await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: "assistant",
          content: aiReply,
        })
        .select(
          "id, role, content, created_at, feedback, regenerated, attachment_name, attachment_path, attachment_type, attachment_size",
        )
        .single();

    if (saveAssistantMessageError) throw saveAssistantMessageError;

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeConversationId);

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === loadingMessageId ? savedAssistantMessage : message,
      ),
    );

    setConversationsTrigger((currentValue) => currentValue + 1);
  } catch (error) {
    console.error("Send chat error:", error);

    const friendlyError =
      error.message || "Nathan AI could not process your request.";

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === loadingMessageId
          ? {
              id: `assistant-error-${Date.now()}`,
              role: "assistant",
              content: `**Request failed:** ${friendlyError}`,
              error: true,
            }
          : message,
      ),
    );

    if (!userMessageSaved) {
      setAttachmentError(friendlyError);
    }
  } finally {
    setUploadingAttachment(false);
    setIsSending(false);
  }


  }function handleInputKeyDown(event) {
  const isComposing = event.nativeEvent.isComposing;

  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !isComposing &&
    !isSending &&
    input.trim()
  ) {
    event.preventDefault();

    handleSend({
      preventDefault: () => {},
    });
  }
}
async function handleCopyResponse(message) {
  try {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);

    window.setTimeout(() => {
      setCopiedMessageId(null);
    }, 1800);
  } catch (error) {
    console.error("Could not copy response:", error);
    alert("Could not copy this response.");
  }
}

async function handleFeedback(messageId, feedback) {
  const currentFeedback =
    feedbackByMessage[messageId] ||
    messages.find((message) => message.id === messageId)?.feedback ||
    null;

  const nextFeedback = currentFeedback === feedback ? null : feedback;

  setFeedbackByMessage((currentFeedbackMap) => ({
    ...currentFeedbackMap,
    [messageId]: nextFeedback,
  }));

  const isLocalMessage = String(messageId).startsWith("assistant-");

  if (isLocalMessage) {
    return;
  }

  const { error } = await supabase
    .from("messages")
    .update({ feedback: nextFeedback })
    .eq("id", messageId);

  if (error) {
    console.error("Could not save feedback:", error);

    setFeedbackByMessage((currentFeedbackMap) => ({
      ...currentFeedbackMap,
      [messageId]: currentFeedback,
    }));

    alert("Could not save your feedback. Please try again.");
  }
}

async function handleShareResponse(message) {
  const shareData = {
    title: "Nathan AI response",
    text: message.content,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);

    window.setTimeout(() => {
      setCopiedMessageId(null);
    }, 1800);

    alert("Sharing is not available in this browser. The response was copied instead.");
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Could not share response:", error);
    }
  }
}

async function handleRegenerateResponse(assistantMessageId) {
  if (isSending || regeneratingMessageId) return;

  const assistantIndex = messages.findIndex(
    (message) => message.id === assistantMessageId,
  );

  if (assistantIndex === -1) return;

  const previousUserMessage = [...messages]
    .slice(0, assistantIndex)
    .reverse()
    .find((message) => message.role === "user");

  if (!previousUserMessage) {
    alert("No user prompt was found for this response.");
    return;
  }

  setRegeneratingMessageId(assistantMessageId);
  setIsSending(true);

  setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === assistantMessageId
        ? {
            ...message,
            content: "Nathan AI is regenerating this response...",
            loading: true,
          }
        : message,
    ),
  );

  try {
    const {
  data: { session: latestSession },
  error: sessionError,
} = await supabase.auth.getSession();

if (sessionError || !latestSession?.access_token) {
  throw new Error("Please log in again before regenerating a response.");
}

const response = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${latestSession.access_token}`,
  },
 body: JSON.stringify({
  message: previousUserMessage.content,
  history: buildConversationHistory(
    messages.slice(0, assistantIndex - 1),
  ),
}),
});

    if (!response.ok) {
  throw new Error(
    await getApiErrorMessage(
      response,
      "Nathan AI could not regenerate the response.",
    ),
  );
}
   if (!response.body) {
  throw new Error("Streaming response is not available.");
}

const reader = response.body.getReader();
const decoder = new TextDecoder();

let regeneratedReply = "";

while (true) {
  const { done, value } = await reader.read();

  if (done) {
    break;
  }

  regeneratedReply += decoder.decode(value, { stream: true });

  setMessages((currentMessages) =>
    currentMessages.map((message) =>
      message.id === assistantMessageId
        ? {
            ...message,
            content: regeneratedReply,
            loading: true,
          }
        : message,
    ),
  );
}

regeneratedReply += decoder.decode();

if (!regeneratedReply.trim()) {
  regeneratedReply = "Sorry, I could not generate a response right now.";
}

    if (conversationId && !String(assistantMessageId).startsWith("assistant-")) {
      const { error: updateError } = await supabase
        .from("messages")
       .update({
  content: regeneratedReply,
  created_at: new Date().toISOString(),
  regenerated: true,
  feedback: null,
})
        .eq("id", assistantMessageId);

      if (updateError) throw updateError;

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === assistantMessageId
         ? {
  ...message,
  content: regeneratedReply,
  loading: false,
  created_at: new Date().toISOString(),
  regenerated: true,
  feedback: null,
}
          : message,
      ),
    );

    setFeedbackByMessage((currentFeedback) => ({
      ...currentFeedback,
      [assistantMessageId]: null,
    }));
  } catch (error) {
    console.error(error);

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              content:
                "Sorry, Nathan AI could not regenerate this response. Please try again.",
              loading: false,
            }
          : message,
      ),
    );
  } finally {
    setRegeneratingMessageId(null);
    setIsSending(false);
  }
}
function getConversationExportTitle() {
  const firstUserMessage = messages.find(
    (message) => message.role === "user",
  );

  const rawTitle = firstUserMessage?.content || "Nathan AI conversation";

  return safeFileName(rawTitle)
    .replace(/\.[a-z0-9]+$/i, "")
    .slice(0, 70) || "nathan-ai-conversation";
}

function formatExportDate(dateValue) {
  if (!dateValue) return "";

  return new Date(dateValue).toLocaleString();
}

function buildMarkdownExport() {
  const title = getConversationExportTitle();
  const exportedAt = new Date().toLocaleString();

  const messageBlocks = messages
    .filter((message) => !message.loading)
    .map((message) => {
      const speaker = message.role === "assistant" ? "Nathan AI" : "You";
      const attachment = message.attachment_name
        ? `\n\n**Attachment:** ${message.attachment_name}`
        : "";
      const timestamp = message.created_at
        ? `\n\n*${formatExportDate(message.created_at)}*`
        : "";

      return `## ${speaker}${timestamp}${attachment}\n\n${message.content}`;
    })
    .join("\n\n---\n\n");

  return `# ${title}

Exported from Nathan AI on ${exportedAt}

${messageBlocks}
`;
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], {
    type: mimeType,
  });

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

function handleExportMarkdown() {
  if (!conversationId || exporting) return;

  setExporting(true);

  try {
    const fileName = `${getConversationExportTitle()}.md`;

    downloadFile(
      buildMarkdownExport(),
      fileName,
      "text/markdown;charset=utf-8",
    );

    setShowExportMenu(false);
  } catch (error) {
    console.error("Could not export Markdown:", error);
    alert("Could not export this chat as Markdown.");
  } finally {
    setExporting(false);
  }
}

function addPdfText(doc, text, x, startY, maxWidth, pageHeight) {
  const lineHeight = 5.5;
  const bottomMargin = 15;
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  let y = startY;

  for (const line of lines) {
    if (y > pageHeight - bottomMargin) {
      doc.addPage();
      y = 16;
    }

    doc.text(line, x, y);
    y += lineHeight;
  }

  return y;
}

function handleExportPdf() {
  if (!conversationId || exporting) return;

  setExporting(true);

  try {
    const title = getConversationExportTitle();
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    y = addPdfText(doc, title, margin, y, contentWidth, pageHeight);

    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y = addPdfText(
      doc,
      `Exported from Nathan AI on ${new Date().toLocaleString()}`,
      margin,
      y,
      contentWidth,
      pageHeight,
    );

    y += 7;

    const exportableMessages = messages.filter((message) => !message.loading);

    exportableMessages.forEach((message, index) => {
      if (y > pageHeight - 38) {
        doc.addPage();
        y = 16;
      }

      const speaker = message.role === "assistant" ? "Nathan AI" : "You";

      doc.setDrawColor(210, 205, 245);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      y = addPdfText(doc, speaker, margin, y, contentWidth, pageHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);

      if (message.created_at) {
        y = addPdfText(
          doc,
          formatExportDate(message.created_at),
          margin,
          y + 1,
          contentWidth,
          pageHeight,
        );
      }

      if (message.attachment_name) {
        doc.setFont("helvetica", "italic");
        y = addPdfText(
          doc,
          `Attachment: ${message.attachment_name}`,
          margin,
          y + 3,
          contentWidth,
          pageHeight,
        );
        doc.setFont("helvetica", "normal");
      }

      y = addPdfText(
        doc,
        message.content,
        margin,
        y + 4,
        contentWidth,
        pageHeight,
      );

      y += index === exportableMessages.length - 1 ? 0 : 7;
    });

    doc.save(`${title}.pdf`);
    setShowExportMenu(false);
  } catch (error) {
    console.error("Could not export PDF:", error);
    alert("Could not export this chat as PDF.");
  } finally {
    setExporting(false);
  }
}
 async function handleNewChat() {
  setConversationId(null);
  setMessages(starterMessages);
  setShowSidebar(false);
  setShowExportMenu(false);
}

  async function handleSelectChat(id) {
    if (!session?.user?.id) return;

    setChatLoading(true);

    const { data: savedMessages, error } = await supabase
      .from("messages")
      .select(
  "id, role, content, created_at, feedback, regenerated, attachment_name, attachment_path, attachment_type, attachment_size",
)
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Could not load conversation:", error);
      setChatLoading(false);
      return;
    }

    setConversationId(id);
    setMessages(savedMessages || starterMessages);
    setChatLoading(false);
    setShowSidebar(false);
  }

  async function handleRenameChat(id, currentTitle) {
    const newTitle = window.prompt("Rename chat:", currentTitle || "Untitled chat");
    if (newTitle === null || newTitle.trim() === "") return;

    const { error } = await supabase
      .from("conversations")
      .update({ title: newTitle.trim() })
      .eq("id", id);

    if (error) {
      console.error("Could not rename conversation:", error);
      alert("Could not rename chat. Check console.");
      return;
    }

    setConversationsTrigger((n) => n + 1);
  }

  async function handleDeleteChat(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this chat? This cannot be undone."
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Could not delete conversation:", error);
      alert("Could not delete chat. Check console.");
      return;
    }

    if (id === conversationId) {
      setConversationId(null);
      setMessages(starterMessages);
    }

    setConversationsTrigger((n) => n + 1);
  }async function handleLogout() {
  const confirmed = window.confirm("Do you want to log out of Nathan AI?");
  if (!confirmed) return;

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Could not log out:", error);
    alert("Could not log out. Please try again.");
    return;
  }
  setShowAdminPanel(false);
  setConversationId(null);
  setMessages(starterMessages);
  setShowSidebar(false);
}

  if (authLoading) {
    return <div className="auth-loading">Loading Nathan AI...</div>;
  }

  if (!session) {
    return <AuthPage />;
  }
  const isAdmin =
  session.user.email?.toLowerCase() === "hafizsmhashir228@gmail.com";

  if (chatLoading) {
    return <div className="auth-loading">Loading your chat...</div>;
  }

  return (
    <main className="app">
     {showAdminPanel && (
  <AdminPanel onClose={() => setShowAdminPanel(false)} />
)}
      {showSidebar && (
        <ChatSidebar
          session={session}
          activeConversationId={conversationId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onRenameChat={handleRenameChat}
          onDeleteChat={handleDeleteChat}
          onClose={() => setShowSidebar(false)}
        />
      )}

      <section className="chat-card">
     <header className="chat-header">
  <div className="header-info">
    <div className="logo">N</div>

    <div>
      <h1>Nathan AI</h1>
      <p>
        <span className="status-dot" />
        Online · Global AI assistant
      </p>
    </div>
  </div>

  <div className="header-actions">
    <div className="user-email" title={session.user.email}>
      {session.user.email}
    </div>

    <button
      type="button"
      className="open-sidebar-button"
      onClick={() => setShowSidebar(true)}
    >
      ☰ Chats
    </button>
    <div className="export-menu-wrap">
  <button
    type="button"
    className="export-button"
    onClick={() => setShowExportMenu((isOpen) => !isOpen)}
    disabled={!conversationId || exporting}
    aria-expanded={showExportMenu}
    aria-label="Export current chat"
    title={
      conversationId
        ? "Export current chat"
        : "Send a message before exporting"
    }
  >
    {exporting ? "Exporting..." : "Export ▾"}
  </button>

  {showExportMenu && (
    <div className="export-menu" role="menu">
      <button
        type="button"
        className="export-menu-item"
        onClick={handleExportMarkdown}
        disabled={exporting}
        role="menuitem"
      >
        <span>↓</span>
        <span>
          <strong>Download Markdown</strong>
          <small>Editable notes and code</small>
        </span>
      </button>

      <button
        type="button"
        className="export-menu-item"
        onClick={handleExportPdf}
        disabled={exporting}
        role="menuitem"
      >
        <span>↓</span>
        <span>
          <strong>Download PDF</strong>
          <small>Printable document</small>
        </span>
      </button>
    </div>
  )}
</div>
    {isAdmin && (
  <button
    type="button"
    className="admin-button"
    onClick={() => setShowAdminPanel(true)}
  >
    Admin
  </button>
)}

    <button
      type="button"
      className="logout-button"
      onClick={handleLogout}
    >
      Log out
    </button>
  </div>
</header>
        <div className="messages">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message ${message.role}`}
            >
              <div className="message-label">
                {message.role === "assistant" ? "Nathan AI" : "You"}
                <div ref={messagesEndRef} />
              </div>

              <div className="message-content">
                {message.attachment_name && (
  <div className="message-attachment">
    <span>📎</span>
    <span>{message.attachment_name}</span>
  </div>
)}
                <ReactMarkdown 
                   
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "text";
                      const codeText = String(children).replace(/\n$/, "");

                      return (
                        <div className="code-block-wrapper">
                          <div className="code-block-header">
                            <span className="code-language">{language}</span>
                            <button
                              type="button"
                              className="copy-button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(codeText);
                              }}
                            >
                              Copy
                            </button>
                          </div>

                          <SyntaxHighlighter
                            style={dracula}
                            language={language}
                            PreTag="div"
                            {...props}
                          >
                            {codeText}
                          </SyntaxHighlighter>
                        </div>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
             {message.role === "assistant" && !message.loading && (
  <div className="response-actions">
    {message.regenerated && (
      <span className="regenerated-label">↻ Regenerated</span>
    )}
    <button
      type="button"
      className={`response-action-button ${
        copiedMessageId === message.id ? "selected" : ""
      }`}
      onClick={() => handleCopyResponse(message)}
      title="Copy response"
    >
      {copiedMessageId === message.id ? "✓ Copied" : "⧉ Copy"}
    </button>

    <button
      type="button"
      className="response-action-button"
      onClick={() => handleRegenerateResponse(message.id)}
      disabled={isSending || regeneratingMessageId === message.id}
      title="Regenerate response"
    >
      {regeneratingMessageId === message.id ? "↻ Regenerating..." : "↻ Regenerate"}
    </button>

    <button
      type="button"
      className={`response-action-icon ${
  (feedbackByMessage[message.id] ?? message.feedback) === "like"
    ? "selected"
    : ""
}`}
      onClick={() => handleFeedback(message.id, "like")}
      title="Good response"
      aria-label="Like response"
    >
      👍
    </button>

    <button
      type="button"
      className={`response-action-icon ${
  (feedbackByMessage[message.id] ?? message.feedback) === "dislike"
    ? "selected dislike"
    : ""
}`}
      onClick={() => handleFeedback(message.id, "dislike")}
      title="Poor response"
      aria-label="Dislike response"
    >
      👎
    </button>

    <button
      type="button"
      className="response-action-icon"
      onClick={() => handleShareResponse(message)}
      title="Share response"
      aria-label="Share response"
    >
      ↗
    </button>
  </div>
)}
              </div>
            </article>
          ))}
        </div>

        <form className="message-form" onSubmit={handleSend}>
          <div className="attachment-controls">
  <div className="attachment-menu-wrap">
    <button
      type="button"
      className="attachment-plus-button"
      onClick={() => setShowAttachmentMenu((isOpen) => !isOpen)}
      disabled={isSending || uploadingAttachment}
      aria-label="Add attachment"
      aria-expanded={showAttachmentMenu}
      title="Add attachment"
    >
      +
    </button>

   {showAttachmentMenu && (
  <div className="attachment-menu" role="menu">
    <label className="attachment-menu-item" role="menuitem">
      <span className="attachment-menu-icon">📁</span>
      <span>
        <strong>Upload file</strong>
        <small>PDF, text, code, or image</small>
      </span>

      <input
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.js,.jsx,.ts,.tsx,.html,.css,.json,.py"
        onChange={handleAttachmentChange}
        disabled={isSending || uploadingAttachment}
      />
    </label>

    <label className="attachment-menu-item" role="menuitem">
      <span className="attachment-menu-icon">🖼️</span>
      <span>
        <strong>Upload image</strong>
        <small>Choose from gallery</small>
      </span>

      <input
        type="file"
        accept="image/*"
        onChange={handleAttachmentChange}
        disabled={isSending || uploadingAttachment}
      />
    </label>

    <label className="attachment-menu-item" role="menuitem">
      <span className="attachment-menu-icon">📷</span>
      <span>
        <strong>Take photo</strong>
        <small>Use your camera</small>
      </span>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleAttachmentChange}
        disabled={isSending || uploadingAttachment}
      />
    </label>
  </div>
)}
  </div>

  {selectedAttachment && (
    <div className="selected-attachment">
      <span title={selectedAttachment.name}>
        📄 {selectedAttachment.name}
      </span>

      <button
        type="button"
        onClick={removeAttachment}
        disabled={isSending || uploadingAttachment}
        aria-label="Remove selected attachment"
        title="Remove attachment"
      >
        ×
      </button>
    </div>
  )}
</div>
{attachmentError && (
  
  <p className="attachment-error">{attachmentError}</p>
)}
        <textarea
  value={input}
  onChange={(event) => setInput(event.target.value)}
  onKeyDown={handleInputKeyDown}
  disabled={isSending}
  placeholder="Ask Nathan AI anything..."
  aria-label="Message Nathan AI"
  rows={1}
/>
          <button
  type="submit"
  disabled={
    isSending ||
    uploadingAttachment ||
    (!input.trim() && !selectedAttachment)
  }
>
  {uploadingAttachment
    ? "Uploading..."
    : isSending
      ? "Thinking..."
      : "Send"}
</button>
        </form>
      </section>
    </main>
  );
}

export default App;