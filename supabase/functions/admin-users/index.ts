// Supabase Edge Function "admin-users".
// Creates staff accounts and resets passwords. Only an admin may call it.
// The service-role key is read from the function environment (set by
// Supabase automatically); it is never sent to the browser or stored in Git.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Deploy a new function ->
// Via Editor, name "admin-users", paste this file, keep "Verify JWT" on.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://mindaugasmasedunskas-boop.github.io",
  "http://localhost:8765",
];
// Staff log in with a nickname (e.g. "minmas"); Supabase needs an email,
// so the app maps it to an internal address in this domain.
const LOGIN_DOMAIN = "vmkl.local";

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(origin: string | null, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean))].slice(0, 50);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "Netinkamas metodas." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Who is calling? The JWT must belong to a profile with role = 'admin'.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return reply(origin, 401, { error: "Neprisijungta." });
  const { data: callerProfile } = await admin
    .from("profiles").select("role").eq("id", caller.user.id).maybeSingle();
  if (callerProfile?.role !== "admin") return reply(origin, 403, { error: "Tik administratoriui." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(origin, 400, { error: "Netinkama užklausa." });
  }

  const password = String(body.password ?? "");
  if (password.length < 8 || password.length > 72) {
    return reply(origin, 400, { error: "Slaptažodis turi būti nuo 8 iki 72 simbolių." });
  }

  if (body.action === "create") {
    const username = String(body.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return reply(origin, 400, { error: "Prisijungimo vardas: 3–32 simboliai (a–z, skaičiai, taškas, brūkšnys)." });
    }
    const fullName = String(body.full_name ?? "").trim().slice(0, 120);
    const email = `${username}@${LOGIN_DOMAIN}`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created?.user) {
      const exists = /already|registered|exists/i.test(createError?.message ?? "");
      return reply(origin, 400, { error: exists ? "Toks prisijungimo vardas jau yra." : "Nepavyko sukurti paskyros." });
    }

    // The on_auth_user_created trigger has inserted the profile (role 'user').
    const values = {
      email,
      full_name: fullName,
      username,
      staff_group: String(body.staff_group ?? "").trim() || null,
      departments: textList(body.departments),
      must_change_password: true,
    };
    const { data: updated, error: updateError } = await admin
      .from("profiles").update(values).eq("id", created.user.id).select("id");
    if (updateError || !updated?.length) {
      const { error: insertError } = await admin
        .from("profiles").insert({ id: created.user.id, role: "user", ...values });
      if (insertError) {
        return reply(origin, 500, { error: "Paskyra sukurta, bet profilio išsaugoti nepavyko." });
      }
    }
    return reply(origin, 200, { id: created.user.id });
  }

  if (body.action === "reset_password") {
    const userId = String(body.user_id ?? "");
    const { data: target } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!target) return reply(origin, 404, { error: "Naudotojas nerastas." });
    const { error: resetError } = await admin.auth.admin.updateUserById(userId, { password });
    if (resetError) return reply(origin, 400, { error: "Nepavyko pakeisti slaptažodžio." });
    await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
    return reply(origin, 200, { ok: true });
  }

  return reply(origin, 400, { error: "Nežinomas veiksmas." });
});
