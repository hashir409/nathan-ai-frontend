import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function formatChatTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleString();
}

function getSearchPattern(query) {
  return `%${query.replace(/[%_]/g, "\\$&")}%`;
}

export default function ChatSidebar({
  session,
  activeConversationId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onClose,
}) {
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setConversations([]);
          setLoading(false);
        }

        return;
      }

      setLoading(true);
      setSearchError("");

      try {
        const userId = session.user.id;
        const query = debouncedSearch;

        if (!query) {
          const { data, error } = await supabase
            .from("conversations")
            .select("id, title, updated_at")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false });

          if (error) throw error;

          if (!cancelled) {
            setConversations(data || []);
          }

          return;
        }

        const searchPattern = getSearchPattern(query);

        const [
          titleSearchResult,
          messageSearchResult,
        ] = await Promise.all([
          supabase
            .from("conversations")
            .select("id, title, updated_at")
            .eq("user_id", userId)
            .ilike("title", searchPattern)
            .order("updated_at", { ascending: false }),
          supabase
            .from("messages")
            .select("conversation_id, created_at")
            .eq("user_id", userId)
            .ilike("content", searchPattern)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

        if (titleSearchResult.error) throw titleSearchResult.error;
        if (messageSearchResult.error) throw messageSearchResult.error;

        const matchingConversationIds = [
          ...new Set(
            (messageSearchResult.data || [])
              .map((message) => message.conversation_id)
              .filter(Boolean),
          ),
        ];

        let messageMatchedConversations = [];

        if (matchingConversationIds.length > 0) {
          const { data, error } = await supabase
            .from("conversations")
            .select("id, title, updated_at")
            .eq("user_id", userId)
            .in("id", matchingConversationIds);

          if (error) throw error;

          messageMatchedConversations = data || [];
        }

        const mergedConversations = [
          ...(titleSearchResult.data || []),
          ...messageMatchedConversations,
        ];

        const uniqueConversations = Array.from(
          new Map(
            mergedConversations.map((conversation) => [
              conversation.id,
              conversation,
            ]),
          ).values(),
        ).sort(
          (a, b) =>
            new Date(b.updated_at).getTime() -
            new Date(a.updated_at).getTime(),
        );

        if (!cancelled) {
          setConversations(uniqueConversations);
        }
      } catch (error) {
        console.error("Could not search conversations:", error);

        if (!cancelled) {
          setSearchError("Could not search chats. Please try again.");
          setConversations([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadConversations();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, debouncedSearch]);

  function clearSearch() {
    setSearch("");
    setDebouncedSearch("");
  }

  return (
    <aside className="chat-sidebar">
      <div className="sidebar-top-row">
        <span className="sidebar-title">Chats</span>

        <button
          type="button"
          className="close-sidebar-button"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          ✕
        </button>
      </div>

      <button type="button" className="new-chat-button" onClick={onNewChat}>
        + New Chat
      </button>

      <div className="chat-search-wrap">
        <span className="chat-search-icon" aria-hidden="true">
          🔎
        </span>

        <input
          className="chat-search-input"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats..."
          aria-label="Search chats by title or message"
        />

        {search && (
          <button
            type="button"
            className="clear-chat-search"
            onClick={clearSearch}
            aria-label="Clear chat search"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {searchError && <p className="chat-search-error">{searchError}</p>}

      <div className="conversations-list">
        {loading ? (
          <div className="sidebar-loading">
            {debouncedSearch ? "Searching chats..." : "Loading chats..."}
          </div>
        ) : conversations.length === 0 ? (
          <div className="no-conversations">
            {debouncedSearch ? "No matching chats found" : "No chats yet"}
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${
                conversation.id === activeConversationId ? "active" : ""
              }`}
            >
              <div className="conversation-actions">
                <button
                  type="button"
                  className="conversation-action-button"
                  onClick={() =>
                    onRenameChat(conversation.id, conversation.title)
                  }
                  title="Rename"
                  aria-label={`Rename ${
                    conversation.title || "untitled chat"
                  }`}
                >
                  ✏️
                </button>

                <button
                  type="button"
                  className="conversation-action-button"
                  onClick={() => onDeleteChat(conversation.id)}
                  title="Delete"
                  aria-label={`Delete ${
                    conversation.title || "untitled chat"
                  }`}
                >
                  🗑️
                </button>
              </div>

              <button
                type="button"
                className="conversation-main-button"
                onClick={() => onSelectChat(conversation.id)}
              >
                <div className="conversation-title">
                  {conversation.title || "Untitled chat"}
                </div>

                <div className="conversation-time">
                  {formatChatTime(conversation.updated_at)}
                </div>
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}