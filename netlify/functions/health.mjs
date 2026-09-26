const RENDER_HEALTH_URL = "https://musematrix-media-api.onrender.com/api/health";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export function toHealthPayload(data = {}) {
  return {
    status: data.status === "ok" ? "ok" : "warming",
    extractor: String(data.extractor || "starting").slice(0, 40),
    revision: String(data.revision || "gateway").slice(0, 64),
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(RENDER_HEALTH_URL, {
      headers: { "Accept": "application/json", "User-Agent": "MuseMatrix-Netlify-Gateway/2.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const payload = toHealthPayload(await response.json());
    return { statusCode: payload.status === "ok" ? 200 : 503, headers, body: JSON.stringify(payload) };
  } catch {
    return {
      statusCode: 202,
      headers,
      body: JSON.stringify(toHealthPayload()),
    };
  } finally {
    clearTimeout(timeout);
  }
}
