import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";
import { supabase } from "./lib/supabase";
import AuthPage from "./components/AuthPage";
const starterMessages = [
  {
    id: 1,
    role: "assistant",
    content:
      "Hi! I’m Nathan AI. Ask me about web development, React, JavaScript, AI, or your next app idea.",
  },
];

function App() {
  const [session, setSession] = useState(null);
const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState("");
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
   async function handleSend(event) {
  event.preventDefault();

  const text = input.trim();

  if (!text) return;

  const userMessage = {
    id: Date.now(),
    role: "user",
    content: text,
  };

  setMessages((currentMessages) => [...currentMessages, userMessage]);
  setInput("");

  const loadingMessage = {
    id: Date.now() + 1,
    role: "assistant",
    content: "Nathan AI is thinking...",
    loading: true,
  };

  setMessages((currentMessages) => [...currentMessages, loadingMessage]);

  try {
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

    const data = await response.json();

    const aiReply =
      data.output ||
      data.text ||
      data.message ||
      "Nathan AI sent a response, but its text format was not recognized.";

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.loading
          ? {
              id: message.id,
              role: "assistant",
              content: aiReply,
            }
          : message,
      ),
    );
  } catch (error) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.loading
          ? {
              id: message.id,
              role: "assistant",
              content:
                "Sorry, Nathan AI is unavailable right now. Please try again.",
            }
          : message,
      ),
    );

    console.error(error);
  }
}
if (authLoading) {
  return <div className="auth-loading">Loading Nathan AI...</div>;
}

if (!session) {
  return <AuthPage />;
}
  return (
    <main className="app">
      <section className="chat-card">
        <header className="chat-header">
          <div className="logo">N</div>

          <div>
            <h1>Nathan AI</h1>
            <p>
              <span className="status-dot" />
              Online · Global AI assistant
            </p>
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
    </div>
  </article>
))}
        </div>

        <form className="message-form" onSubmit={handleSend}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Nathan AI anything..."
            aria-label="Message Nathan AI"
          />

          <button type="submit">Send</button>
        </form>
      </section>
    </main>
  );
}

export default App;