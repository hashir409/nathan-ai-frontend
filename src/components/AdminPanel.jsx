import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function formatDate(dateValue) {
  if (!dateValue) return "Never";

  return new Date(dateValue).toLocaleString();
}

export default function AdminPanel({ onClose }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error("Please log in again to access the admin panel.");
      }

      const response = await fetch("/api/admin-dashboard", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load dashboard data.");
      }

      setDashboard(result);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError.message || "Could not load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <div className="admin-overlay">
      <section className="admin-panel" role="dialog" aria-modal="true">
        <div className="admin-header">
          <div>
            <p className="admin-eyebrow">Private dashboard</p>
            <h2>Admin Panel</h2>
          </div>

          <button
            className="admin-close-button"
            type="button"
            onClick={onClose}
            aria-label="Close admin panel"
          >
            ×
          </button>
        </div>

        <div className="admin-actions">
          <button
            className="admin-refresh-button"
            type="button"
            onClick={loadDashboard}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh data"}
          </button>
        </div>

        {error && <p className="admin-error">{error}</p>}

        {loading && !dashboard && (
          <p className="admin-loading">Loading secure dashboard data...</p>
        )}

        {dashboard && (
          <>
            <div className="admin-stats-grid">
              <article className="admin-stat-card">
                <span>Total users</span>
                <strong>{dashboard.stats.totalUsers}</strong>
              </article>

              <article className="admin-stat-card">
                <span>Conversations</span>
                <strong>{dashboard.stats.totalConversations}</strong>
              </article>

              <article className="admin-stat-card">
                <span>Messages</span>
                <strong>{dashboard.stats.totalMessages}</strong>
              </article>

              <article className="admin-stat-card">
                <span>Helpful votes</span>
                <strong>{dashboard.stats.likes}</strong>
              </article>

              <article className="admin-stat-card">
                <span>Not helpful votes</span>
                <strong>{dashboard.stats.dislikes}</strong>
              </article>
            </div>

            <div className="admin-data-grid">
              <section className="admin-data-section">
                <h3>Newest users</h3>

                {dashboard.recentUsers.length === 0 ? (
                  <p className="admin-empty">No users found.</p>
                ) : (
                  <div className="admin-list">
                    {dashboard.recentUsers.map((user) => (
                      <article className="admin-list-row" key={user.id}>
                        <strong>{user.email}</strong>
                        <span>Joined: {formatDate(user.created_at)}</span>
                        <span>
                          Last sign in: {formatDate(user.last_sign_in_at)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="admin-data-section">
                <h3>Recent conversations</h3>

                {dashboard.recentConversations.length === 0 ? (
                  <p className="admin-empty">No conversations found.</p>
                ) : (
                  <div className="admin-list">
                    {dashboard.recentConversations.map((conversation) => (
                      <article
                        className="admin-list-row"
                        key={conversation.id}
                      >
                        <strong>{conversation.title || "Untitled chat"}</strong>
                        <span>Updated: {formatDate(conversation.updated_at)}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}