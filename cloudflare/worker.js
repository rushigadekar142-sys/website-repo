const ALLOWED_ORIGINS = new Set([
  "https://headless-gwjjtomxzpx-rushigadekar142-140f.wix-site-host.com",
  "https://ekdant-leaddesk.vercel.app"
]);

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request.headers.get("Origin") || "");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({
          ok: result?.ok === 1,
          service: "ekdant-leaddesk-api",
          database: "connected",
          auth: "not-yet-enabled",
          checkedAt: new Date().toISOString()
        }, 200, headers);
      } catch {
        return json({
          ok: false,
          service: "ekdant-leaddesk-api",
          database: "unavailable"
        }, 503, headers);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: "CRM data endpoints are disabled until Wix member authentication and server-side role authorization are enabled."
      }, 503, headers);
    }

    return json({ error: "Not found" }, 404, headers);
  }
};
