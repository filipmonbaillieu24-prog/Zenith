import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Proxies OpenAI chat completions so the user's API key never reaches the
// browser. The key previously lived in localStorage and was attached to a
// fetch straight from the page, which put it in plaintext on disk and within
// reach of any script running on the origin.
//
// The caller is identified from their own JWT; the key is read here with the
// service role from user_ai_credentials, a table the client has no SELECT
// policy on. So a compromised page can trigger a completion but cannot read
// the key itself.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Not signed in." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Resolve the caller from their own token - never from anything in the body.
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userErr || !userId) {
    return json({ error: "Not signed in." }, 401);
  }

  let payload: { messages?: unknown; model?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Malformed request body." }, 400);
  }

  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "No messages supplied." }, 400);
  }

  // Service role: the client has no SELECT policy on this table by design.
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: cred, error: credErr } = await adminClient
    .from("user_ai_credentials")
    .select("openai_key, openai_model")
    .eq("user_id", userId)
    .maybeSingle();

  if (credErr) {
    console.error("Credential lookup failed:", credErr);
    return json({ error: "Could not read your AI settings." }, 500);
  }
  const apiKey = cred?.openai_key;
  if (!apiKey) {
    return json({ error: "No OpenAI API key saved. Add one in AI settings." }, 400);
  }

  const model = typeof payload.model === "string" && payload.model
    ? payload.model
    : (cred?.openai_model ?? "gpt-4o-mini");

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    });
  } catch (e) {
    console.error("Upstream request failed:", e);
    return json({ error: "Could not reach OpenAI." }, 502);
  }

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    // Pass the provider's message through, but never the key.
    const message = errBody?.error?.message ?? `OpenAI error: ${upstream.status}`;
    return json({ error: message }, upstream.status === 401 ? 400 : 502);
  }

  const data = await upstream.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content ?? "";
  return json({ content });
});
