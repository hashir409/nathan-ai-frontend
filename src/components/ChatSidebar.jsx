import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ChatSidebar({
  session,
  activeConversationId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
}) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConversations() {
      if (!session?.user?.id) {
        setConversations([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } = await supabase
        .from("conversations")
        .select("id, title, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Could not load conversations:", error);
        setConversations([]);
        setLoading(false);
        return;
      }

      setConversations(data || []);
      setLoading(false);
    }

    loadConversations();
  }, [session?.user?.id]);

  return (
    <aside className="chat-sidebar">
      <button className="new-chat-button" onClick={onNewChat}>
        + New Chat
      </button>

      <div className="conversations-list">
        {loading ? (
          <div className="sidebar-loading">Loading chats...</div>
        ) : conversations.length === 0 ? (
          <div className="no-conversations">No chats yet</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${conv.id === activeConversationId ? "active" : ""}`}
            >
              <button
                className="conversation-main-button"
                onClick={() => onSelectChat(conv.id)}
              >
                <div className="conversation-title">
                  {conv.title || "Untitled chat"}
                </div>
                <div className="conversation-time">
                  {new Date(conv.updated_at).toLocaleString()}
                </div>
              </button>

              <div className="conversation-actions">
                <button
                  className="conversation-action-button"
                  onClick={() => onRenameChat(conv.id, conv.title)}
                  title="Rename"
                >
                  ✏️
                </button>
                <button
                  className="conversation-action-button"
                  onClick={() => onDeleteChat(conv.id)}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}