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
const [showAdminPanel, setShowAdminPanel] = useState(false);
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
         .select("id, role, content, created_at, feedback, regenerated")
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
  async function handleSend(event) {
    event.preventDefault();

    const text = input.trim();
    const userId = session?.user?.id;

    if (!text || !userId || isSending) return;
     setIsSending(true);
    const localUserMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    const loadingMessageId = `assistant-${Date.now()}`;

    setMessages((currentMessages) => [...currentMessages, localUserMessage]);
    setInput("");

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: loadingMessageId,
        role: "assistant",
        content: "Nathan AI is thinking...",
        loading: true,
      },
    ]);

    try {
      let activeConversationId = conversationId;

      if (!activeConversationId) {
        const { data: newConversation, error: createConversationError } =
          await supabase
            .from("conversations")
            .insert({
              user_id: userId,
              title: text.slice(0, 60),
            })
            .select("id")
            .single();

        if (createConversationError) throw createConversationError;

        activeConversationId = newConversation.id;
        setConversationId(activeConversationId);
      }

      const { error: saveUserMessageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: "user",
          content: text,
        });

      if (saveUserMessageError) throw saveUserMessageError;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
        }),
      });

      if (!response.ok) {
        throw new Error("Nathan AI could not respond right now.");
      }

      if (!response.body) {
  throw new Error("Streaming response is not available.");
}

const reader = response.body.getReader();
const decoder = new TextDecoder();

let aiReply = "";

while (true) {
  const { done, value } = await reader.read();

  if (done) {
    break;
  }

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
  aiReply = "Sorry, I could not generate a response right now.";
}
      const { error: saveAssistantMessageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: "assistant",
          content: aiReply,
        });

      if (saveAssistantMessageError) throw saveAssistantMessageError;

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeConversationId);

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === loadingMessageId
            ? {
                id: `assistant-saved-${Date.now()}`,
                role: "assistant",
                content: aiReply,
              }
            : message,
        ),
      );
       } catch (error) {
      console.error(error);

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === loadingMessageId
            ? {
                id: `assistant-error-${Date.now()}`,
                role: "assistant",
                content:
                  "Sorry, Nathan AI is unavailable right now. Please try again.",
              }
            : message,
        ),
      );
    } finally {
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
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: previousUserMessage.content,
      }),
    });

    if (!response.ok) {
      throw new Error("Nathan AI could not regenerate the response.");
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
  async function handleNewChat() {
    setConversationId(null);
    setMessages(starterMessages);
    setShowSidebar(false);
  }

  async function handleSelectChat(id) {
    if (!session?.user?.id) return;

    setChatLoading(true);

    const { data: savedMessages, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at, feedback")
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
        <textarea
  value={input}
  onChange={(event) => setInput(event.target.value)}
  onKeyDown={handleInputKeyDown}
  disabled={isSending}
  placeholder="Ask Nathan AI anything..."
  aria-label="Message Nathan AI"
  rows={1}
/>
          <button type="submit" disabled={isSending || !input.trim()}>
  {isSending ? "Thinking..." : "Send"}
</button>
        </form>
      </section>
    </main>
  );
}

export default App;