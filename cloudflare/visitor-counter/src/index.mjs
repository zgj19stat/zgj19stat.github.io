const DEFAULT_ORIGIN = "https://zgj19stat.github.io";
const SESSION_PATTERN = /^[A-Za-z0-9-]{16,128}$/;
const BOT_PATTERN = /bot|crawler|spider|slurp|preview|headless/i;

function configuredOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || DEFAULT_ORIGIN)
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
}

function requestOrigin(request) {
  return (request.headers.get("Origin") || "").replace(/\/$/, "");
}

function corsHeaders(request, env) {
  const origin = requestOrigin(request);
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff"
  };

  if (origin && configuredOrigins(env).has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function json(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, env)
  });
}

function isAllowedWrite(request, env) {
  const origin = requestOrigin(request);
  return Boolean(origin && configuredOrigins(env).has(origin));
}

async function sessionHash(session) {
  const encoded = new TextEncoder().encode(session);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentCounter(env) {
  const row = await env.DB.prepare(
    "SELECT total, since_label AS sinceLabel FROM visit_counter WHERE id = 1"
  ).first();

  if (!row) throw new Error("visit_counter has not been initialized");
  return {
    total: Number(row.total) || 0,
    since: env.SINCE_LABEL || row.sinceLabel || "Aug 2026"
  };
}

async function handleVisit(request, env) {
  if (!isAllowedWrite(request, env)) {
    return json(request, env, { error: "origin_not_allowed" }, 403);
  }

  const userAgent = request.headers.get("User-Agent") || "";
  if (BOT_PATTERN.test(userAgent)) {
    return json(request, env, { ...(await currentCounter(env)), recorded: false });
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json(request, env, { error: "invalid_json" }, 400);
  }

  const session = typeof body.session === "string" ? body.session : "";
  if (!SESSION_PATTERN.test(session)) {
    return json(request, env, { error: "invalid_session" }, 400);
  }

  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO visit_sessions (session_hash, created_at) VALUES (?1, ?2)"
  )
    .bind(await sessionHash(session), new Date().toISOString())
    .run();

  return json(request, env, {
    ...(await currentCounter(env)),
    recorded: Boolean(inserted && inserted.meta && inserted.meta.changes)
  });
}

export default {
  async fetch(request, env) {
    if (!env || !env.DB) {
      return json(request, env || {}, { error: "database_unavailable" }, 503);
    }

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!isAllowedWrite(request, env)) return json(request, env, { error: "origin_not_allowed" }, 403);
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === "GET" && url.pathname === "/count") {
      return json(request, env, await currentCounter(env));
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json(request, env, { ok: true });
    }

    if (request.method === "POST" && url.pathname === "/visit") {
      return handleVisit(request, env);
    }

    return json(request, env, { error: "not_found" }, 404);
  }
};
