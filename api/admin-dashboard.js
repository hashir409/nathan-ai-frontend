import { createClient } from "@supabase/supabase-js";

function getAccessToken(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.replace("Bearer ", "");
}

function startOfDay(daysAgo = 0) {
  const date = new Date();

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);

  return date;
}

function formatDayKey(dateValue) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDayLabel(dayKey) {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function percentage(part, total) {
  if (!total) return 0;

  return Math.round((part / total) * 100);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return res.status(401).json({
      error: "You must be logged in.",
    });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!supabaseUrl || !serviceRoleKey || !adminEmail) {
      throw new Error("Admin dashboard environment variables are missing.");
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

    if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      return res.status(403).json({
        error: "You are not allowed to access the admin dashboard.",
      });
    }

    const now = new Date();
    const todayStart = startOfDay(0).toISOString();
    const sevenDaysStart = startOfDay(6).toISOString();
    const thirtyDaysStart = startOfDay(29).toISOString();

    const [
      usersResult,
      conversationsResult,
      messagesResult,
      likesResult,
      dislikesResult,
      recentConversationsResult,
      newUsersTodayResult,
      newUsersSevenDaysResult,
      newUsersThirtyDaysResult,
      messagesTodayResult,
      messagesSevenDaysResult,
      recentMessagesResult,
    ] = await Promise.all([
      adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      }),
      adminClient
        .from("conversations")
        .select("*", { count: "exact", head: true }),
      adminClient.from("messages").select("*", { count: "exact", head: true }),
      adminClient
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("feedback", "like"),
      adminClient
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("feedback", "dislike"),
      adminClient
        .from("conversations")
        .select("id, user_id, title, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(8),
      adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      }),
      adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      }),
      adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      }),
      adminClient
        .from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart),
      adminClient
        .from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysStart),
      adminClient
        .from("messages")
        .select("id, user_id, role, content, created_at, feedback")
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    if (usersResult.error) throw usersResult.error;
    if (conversationsResult.error) throw conversationsResult.error;
    if (messagesResult.error) throw messagesResult.error;
    if (likesResult.error) throw likesResult.error;
    if (dislikesResult.error) throw dislikesResult.error;
    if (recentConversationsResult.error) throw recentConversationsResult.error;
    if (newUsersTodayResult.error) throw newUsersTodayResult.error;
    if (newUsersSevenDaysResult.error) throw newUsersSevenDaysResult.error;
    if (newUsersThirtyDaysResult.error) throw newUsersThirtyDaysResult.error;
    if (messagesTodayResult.error) throw messagesTodayResult.error;
    if (messagesSevenDaysResult.error) throw messagesSevenDaysResult.error;
    if (recentMessagesResult.error) throw recentMessagesResult.error;

    const allUsers = usersResult.data.users || [];

    const newUsersToday = allUsers.filter(
      (userItem) => new Date(userItem.created_at) >= new Date(todayStart),
    ).length;

    const newUsersLast7Days = allUsers.filter(
      (userItem) => new Date(userItem.created_at) >= new Date(sevenDaysStart),
    ).length;

    const newUsersLast30Days = allUsers.filter(
      (userItem) => new Date(userItem.created_at) >= new Date(thirtyDaysStart),
    ).length;

    const dayMap = new Map();

    for (let index = 6; index >= 0; index -= 1) {
      const dayKey = formatDayKey(startOfDay(index));

      dayMap.set(dayKey, {
        date: dayKey,
        label: formatDayLabel(dayKey),
        users: 0,
        messages: 0,
      });
    }

    allUsers.forEach((userItem) => {
      const dayKey = formatDayKey(userItem.created_at);

      if (dayMap.has(dayKey)) {
        dayMap.get(dayKey).users += 1;
      }
    });

    (recentMessagesResult.data || []).forEach((messageItem) => {
      const dayKey = formatDayKey(messageItem.created_at);

      if (dayMap.has(dayKey)) {
        dayMap.get(dayKey).messages += 1;
      }
    });

    const recentUsers = [...allUsers]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 8)
      .map((userItem) => ({
        id: userItem.id,
        email: userItem.email || "No email",
        created_at: userItem.created_at,
        last_sign_in_at: userItem.last_sign_in_at,
      }));

    const totalFeedback = (likesResult.count || 0) + (dislikesResult.count || 0);

    return res.status(200).json({
      stats: {
        totalUsers: allUsers.length,
        totalConversations: conversationsResult.count || 0,
        totalMessages: messagesResult.count || 0,
        likes: likesResult.count || 0,
        dislikes: dislikesResult.count || 0,
      },
      analytics: {
        newUsersToday,
        newUsersLast7Days,
        newUsersLast30Days,
        messagesToday: messagesTodayResult.count || 0,
        messagesLast7Days: messagesSevenDaysResult.count || 0,
        feedbackRate: percentage(totalFeedback, messagesResult.count || 0),
        helpfulRate: percentage(likesResult.count || 0, totalFeedback),
        activityLast7Days: Array.from(dayMap.values()),
        generatedAt: now.toISOString(),
      },
      recentUsers,
      recentConversations: recentConversationsResult.data || [],
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      error: "Could not load admin dashboard data.",
    });
  }
}