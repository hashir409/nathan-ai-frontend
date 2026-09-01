import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function formatDate(dateValue) {
  if (!dateValue) return "Never";

  return new Date(dateValue).toLocaleString();
}

function getBarHeight(value, maxValue) {
  if (maxValue <= 0) return 8;

  return Math.max(8, Math.round((value / maxValue) * 100));
}

export default function AdminPanel({ onClose }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
const [usersLoading, setUsersLoading] = useState(false);
const [usersError, setUsersError] = useState("");
const [userSearch, setUserSearch] = useState("");
const [userPage, setUserPage] = useState(1);
const [hasNextUserPage, setHasNextUserPage] = useState(false);
const [userActionId, setUserActionId] = useState(null);
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
async function getAdminHeaders() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (!session?.access_token) {
    throw new Error("Please log in again.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function loadUsers(page = 1, search = userSearch) {
  setUsersLoading(true);
  setUsersError("");

  try {
    const headers = await getAdminHeaders();
    const params = new URLSearchParams({
      page: String(page),
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    const response = await fetch(`/api/admin-users?${params.toString()}`, {
      headers,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not load users.");
    }

    setUsers(result.users || []);
    setUserPage(result.page || page);
    setHasNextUserPage(Boolean(result.hasNextPage));
  } catch (loadError) {
    console.error(loadError);
    setUsersError(loadError.message || "Could not load users.");
  } finally {
    setUsersLoading(false);
  }
}

async function handleUserAction(user, action) {
  const isBan = action === "ban";
  const message = isBan
    ? `Ban ${user.email}? They will not be able to sign in.`
    : `Unban ${user.email}?`;

  if (!window.confirm(message)) return;

  if (
    action === "delete" &&
    !window.confirm(
      `FINAL CONFIRMATION: Soft-delete ${user.email}? This action cannot be undone.`,
    )
  ) {
    return;
  }

  setUserActionId(user.id);
  setUsersError("");

  try {
    const headers = await getAdminHeaders();

    const response = await fetch("/api/admin-users", {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers,
      body: JSON.stringify(
        action === "delete"
          ? { userId: user.id }
          : { userId: user.id, action },
      ),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not update this user.");
    }

    await Promise.all([
      loadUsers(userPage),
      loadDashboard(),
    ]);
  } catch (actionError) {
    console.error(actionError);
    setUsersError(actionError.message || "Could not update this user.");
  } finally {
    setUserActionId(null);
  }
}

function handleUserSearchSubmit(event) {
  event.preventDefault();
  loadUsers(1, userSearch);
}

function formatBanStatus(user) {
  if (!user.banned_until) return "Active";

  const bannedUntil = new Date(user.banned_until);

  if (Number.isNaN(bannedUntil.getTime()) || bannedUntil <= new Date()) {
    return "Active";
  }

  return `Banned until ${formatDate(user.banned_until)}`;
}
  useEffect(() => {
  loadDashboard();
  loadUsers(1, "");
}, []);

  const activity = dashboard?.analytics?.activityLast7Days || [];
  const maxActivity = Math.max(
    1,
    ...activity.flatMap((day) => [day.users, day.messages]),
  );

  return (
    <div className="admin-overlay">
      <section className="admin-panel" role="dialog" aria-modal="true">
        <div className="admin-header">
          <div>
            <p className="admin-eyebrow">Private dashboard</p>
            <h2>Admin Analytics</h2>
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
          <span className="admin-generated-time">
            {dashboard?.analytics?.generatedAt
              ? `Updated: ${formatDate(dashboard.analytics.generatedAt)}`
              : ""}
          </span>

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
          <><section className="analytics-section user-management-section">
  <div className="analytics-section-heading">
    <div>
      <p className="admin-eyebrow">Account controls</p>
      <h3>User management</h3>
    </div>
  </div>

  <form className="user-search-form" onSubmit={handleUserSearchSubmit}>
    <input
      type="search"
      value={userSearch}
      onChange={(event) => setUserSearch(event.target.value)}
      placeholder="Search by email..."
      aria-label="Search users by email"
    />

    <button type="submit" disabled={usersLoading}>
      Search
    </button>

    {userSearch && (
      <button
        className="user-clear-search"
        type="button"
        onClick={() => {
          setUserSearch("");
          loadUsers(1, "");
        }}
        disabled={usersLoading}
      >
        Clear
      </button>
    )}
  </form>

  {usersError && <p className="admin-error">{usersError}</p>}

  {usersLoading ? (
    <p className="admin-loading">Loading users...</p>
  ) : (
    <div className="user-table-wrap">
      <table className="user-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Joined</th>
            <th>Last sign in</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan="5" className="user-table-empty">
                No users found.
              </td>
            </tr>
          ) : (
            users.map((user) => {
              const isBanned =
                user.banned_until &&
                new Date(user.banned_until) > new Date();
              const isBusy = userActionId === user.id;

              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    {!user.email_confirmed_at && (
                      <small className="unverified-user">Email not confirmed</small>
                    )}
                  </td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>{formatDate(user.last_sign_in_at)}</td>
                  <td>
                    <span
                      className={`user-status ${
                        isBanned ? "user-status-banned" : "user-status-active"
                      }`}
                    >
                      {formatBanStatus(user)}
                    </span>
                  </td>
                  <td>
                    <div className="user-actions">
                      <button
                        type="button"
                        className={
                          isBanned
                            ? "user-action-button user-unban-button"
                            : "user-action-button user-ban-button"
                        }
                        onClick={() =>
                          handleUserAction(user, isBanned ? "unban" : "ban")
                        }
                        disabled={isBusy}
                      >
                        {isBusy
                          ? "Please wait..."
                          : isBanned
                            ? "Unban"
                            : "Ban"}
                      </button>

                      <button
                        type="button"
                        className="user-action-button user-delete-button"
                        onClick={() => handleUserAction(user, "delete")}
                        disabled={isBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  )}

  <div className="user-pagination">
    <button
      type="button"
      onClick={() => loadUsers(userPage - 1)}
      disabled={usersLoading || userPage <= 1}
    >
      Previous
    </button>

    <span>Page {userPage}</span>

    <button
      type="button"
      onClick={() => loadUsers(userPage + 1)}
      disabled={usersLoading || !hasNextUserPage}
    >
      Next
    </button>
  </div>
</section>
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
                <span>Total messages</span>
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

            <section className="analytics-section">
              <div className="analytics-section-heading">
                <div>
                  <p className="admin-eyebrow">Growth and engagement</p>
                  <h3>Key analytics</h3>
                </div>
              </div>

              <div className="analytics-grid">
                <article className="analytics-card">
                  <span>New users today</span>
                  <strong>{dashboard.analytics.newUsersToday}</strong>
                </article>

                <article className="analytics-card">
                  <span>New users · 7 days</span>
                  <strong>{dashboard.analytics.newUsersLast7Days}</strong>
                </article>

                <article className="analytics-card">
                  <span>New users · 30 days</span>
                  <strong>{dashboard.analytics.newUsersLast30Days}</strong>
                </article>

                <article className="analytics-card">
                  <span>Messages today</span>
                  <strong>{dashboard.analytics.messagesToday}</strong>
                </article>

                <article className="analytics-card">
                  <span>Messages · 7 days</span>
                  <strong>{dashboard.analytics.messagesLast7Days}</strong>
                </article>

                <article className="analytics-card">
                  <span>Feedback coverage</span>
                  <strong>{dashboard.analytics.feedbackRate}%</strong>
                  <small>Messages with a like or dislike</small>
                </article>

                <article className="analytics-card">
                  <span>Helpful rate</span>
                  <strong>{dashboard.analytics.helpfulRate}%</strong>
                  <small>Likes out of all feedback</small>
                </article>
              </div>
            </section>

            <section className="analytics-section">
              <div className="analytics-section-heading">
                <div>
                  <p className="admin-eyebrow">Last seven days</p>
                  <h3>Daily activity</h3>
                </div>

                <div className="chart-legend">
                  <span>
                    <i className="legend-users" />
                    New users
                  </span>

                  <span>
                    <i className="legend-messages" />
                    Messages
                  </span>
                </div>
              </div>

              <div className="activity-chart">
                {activity.map((day) => (
                  <div className="activity-day" key={day.date}>
                    <div className="activity-bars">
                      <div
                        className="activity-bar activity-users"
                        style={{
                          height: `${getBarHeight(day.users, maxActivity)}%`,
                        }}
                        title={`${day.users} new users`}
                      />

                      <div
                        className="activity-bar activity-messages"
                        style={{
                          height: `${getBarHeight(day.messages, maxActivity)}%`,
                        }}
                        title={`${day.messages} messages`}
                      />
                    </div>

                    <span className="activity-value">
                      {day.users}/{day.messages}
                    </span>

                    <span className="activity-label">{day.label}</span>
                  </div>
                ))}
              </div>

              <p className="activity-help">
                Each day shows <strong>new users / messages</strong>.
              </p>
            </section>

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
                        <span>
                          Updated: {formatDate(conversation.updated_at)}
                        </span>
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