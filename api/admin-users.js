import { createClient } from "@supabase/supabase-js";

function getAccessToken(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email || "No email",
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    banned_until: user.banned_until,
    email_confirmed_at: user.email_confirmed_at,
  };
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
      error: "You are not allowed to manage users.",
    });

    return null;
  }

  return {
    adminClient,
    adminEmail: adminEmail.toLowerCase(),
  };
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) return;

  try {
    if (req.method === "GET") {
      const search =
        typeof req.query.search === "string"
          ? req.query.search.trim().toLowerCase()
          : "";

      const page =
        Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const perPage = 50;

      const { data, error } = await admin.adminClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) throw error;

      const allUsers = data.users || [];

      const users = search
        ? allUsers.filter((user) =>
            (user.email || "").toLowerCase().includes(search),
          )
        : allUsers;

      return res.status(200).json({
        users: users.map(publicUser),
        page,
        perPage,
        hasNextPage: allUsers.length === perPage,
      });
    }

    if (req.method === "PATCH") {
      const { userId, action } = req.body || {};

      if (!userId || !["ban", "unban"].includes(action)) {
        return res.status(400).json({
          error: "A valid userId and action are required.",
        });
      }

      const { data: targetUser, error: targetUserError } =
        await admin.adminClient.auth.admin.getUserById(userId);

      if (targetUserError || !targetUser?.user) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      if (targetUser.user.email?.toLowerCase() === admin.adminEmail) {
        return res.status(403).json({
          error: "You cannot ban or unban your own admin account.",
        });
      }

      const banDuration = action === "ban" ? "876000h" : "none";

      const { data, error } =
        await admin.adminClient.auth.admin.updateUserById(userId, {
          ban_duration: banDuration,
        });

      if (error) throw error;

      return res.status(200).json({
        message: action === "ban" ? "User banned." : "User unbanned.",
        user: publicUser(data.user),
      });
    }

    if (req.method === "DELETE") {
      const { userId } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          error: "A userId is required.",
        });
      }

      const { data: targetUser, error: targetUserError } =
        await admin.adminClient.auth.admin.getUserById(userId);

      if (targetUserError || !targetUser?.user) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      if (targetUser.user.email?.toLowerCase() === admin.adminEmail) {
        return res.status(403).json({
          error: "You cannot delete your own admin account.",
        });
      }

      const { error } = await admin.adminClient.auth.admin.deleteUser(userId, true);

      if (error) throw error;

      return res.status(200).json({
        message: "User was soft-deleted.",
      });
    }

    return res.status(405).json({
      error: "Method not allowed.",
    });
  } catch (error) {
    console.error("Admin users error:", error);

    return res.status(500).json({
      error: "Could not complete user management request.",
    });
  }
}