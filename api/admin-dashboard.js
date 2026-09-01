import { createClient } from "@supabase/supabase-js";

function getAccessToken(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.replace("Bearer ", "");
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

    const [
      usersResult,
      conversationsResult,
      messagesResult,
      likesResult,
      dislikesResult,
      recentConversationsResult,
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
    ]);

    if (usersResult.error) throw usersResult.error;
    if (conversationsResult.error) throw conversationsResult.error;
    if (messagesResult.error) throw messagesResult.error;
    if (likesResult.error) throw likesResult.error;
    if (dislikesResult.error) throw dislikesResult.error;
    if (recentConversationsResult.error) throw recentConversationsResult.error;

    const recentUsers = usersResult.data.users
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

    return res.status(200).json({
      stats: {
        totalUsers: usersResult.data.users.length,
        totalConversations: conversationsResult.count || 0,
        totalMessages: messagesResult.count || 0,
        likes: likesResult.count || 0,
        dislikes: dislikesResult.count || 0,
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