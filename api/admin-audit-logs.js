import { createClient } from "@supabase/supabase-js";

function getAccessToken(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7);
}

async function requireAdmin(req, res) {
  const accessToken = getAccessToken(req);

  if (!accessToken) {
    res.status(401).json({
      error: "You must be logged in.",
    });

    return null;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!supabaseUrl || !serviceRoleKey || !adminEmail) {
    res.status(500).json({
      error: "Admin environment variables are missing.",
    });

    return null;
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(accessToken);

  if (userError || !user) {
    res.status(401).json({
      error: "Your session is invalid or expired.",
    });

    return null;
  }

  if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
    res.status(403).json({
      error: "You are not allowed to view audit logs.",
    });

    return null;
  }

  return adminClient;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const adminClient = await requireAdmin(req, res);

  if (!adminClient) return;

  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const perPage = 30;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error } = await adminClient
      .from("admin_audit_logs")
      .select(
        "id, action, admin_email, target_user_id, target_user_email, details, created_at",
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json({
      logs: data || [],
      page,
      perPage,
      hasNextPage: (data || []).length === perPage,
    });
  } catch (error) {
    console.error("Admin audit logs error:", error);

    return res.status(500).json({
      error: "Could not load audit logs.",
    });
  }
}