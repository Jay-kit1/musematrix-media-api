const BACKEND_DOWNLOAD = "https://musematrix-media-api.onrender.com/api/download";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Range,If-Range",
  "Cache-Control": "no-store",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" };
  }

  try {
    const params = event.queryStringParameters || {};
    const target = new URL(params.url || "");
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.href.length > 2048) {
      return { statusCode: 400, headers: corsHeaders, body: "Invalid URL" };
    }

    const backend = new URL(BACKEND_DOWNLOAD);
    backend.searchParams.set("url", target.toString());
    backend.searchParams.set("filename", String(params.filename || "resource").slice(0, 160));
    if (params.audio) {
      const audio = new URL(params.audio);
      if (!["http:", "https:"].includes(audio.protocol) || audio.username || audio.password || audio.href.length > 2048) throw new Error("Invalid audio URL");
      backend.searchParams.set("audio", audio.href);
    }
    if(params.prepare==='1'||params.prepare==='status')backend.searchParams.set('prepare',params.prepare);
    return {
      statusCode: 302,
      headers: {
        ...corsHeaders,
        Location: backend.toString(),
      },
      body: "",
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: "Invalid URL",
    };
  }
}
