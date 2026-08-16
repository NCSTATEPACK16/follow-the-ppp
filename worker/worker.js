/**
 * Public read proxy for the follow-the-ppp R2 bucket.
 *
 * Replaces the pub-*.r2.dev URL, which Cloudflare documents as rate-limited
 * and not meant for production traffic (measured: 429 on every read at 16
 * threads against 9,000 objects — see CLAUDE.md). Requests here go over the
 * R2 binding, not the public r2.dev gateway, so they aren't subject to that
 * limit.
 *
 * Range support is not optional: pmtiles and duckdb-wasm's Parquet reads
 * both work by range request, and a proxy that drops Range silently breaks
 * the map rather than erroring, which is why this exists as its own small
 * file rather than a two-line passthrough.
 */

const ALLOWED_ORIGIN = "https://follow-the-ppp.netlify.app";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, ETag, Accept-Ranges",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const cors = corsHeaders(request.headers.get("Origin") || "");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!key) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    if (request.method === "HEAD") {
      const obj = await env.BUCKET.head(key);
      if (!obj) return new Response(null, { status: 404, headers: cors });
      const headers = new Headers(cors);
      obj.writeHttpMetadata(headers);
      headers.set("ETag", obj.httpEtag);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", String(obj.size));
      return new Response(null, { status: 200, headers });
    }

    // No onlyIf/conditional-request handling: every object here is served
    // either `immutable, max-age=31536000` or `max-age=3600`, so the browser
    // won't send a revalidating If-None-Match until the object is actually
    // stale — and a plain 200 on a stale fetch is correct, just not the
    // smallest possible response. Handling conditionals right (R2 returns a
    // bodyless object on a failed precondition, and the caller must pick
    // 304 vs 412) is real complexity this proxy doesn't need to take on.
    //
    // Passing `range: request.headers` unconditionally is wrong even for a
    // request with no Range header at all — measured: the binding still
    // returns a "partial" object spanning the full byte range (206, not
    // 200). Only pass range when a Range header actually exists.
    const hasRange = request.headers.has("Range");
    const obj = hasRange
      ? await env.BUCKET.get(key, { range: request.headers })
      : await env.BUCKET.get(key);
    if (obj === null) {
      return new Response("Not found", { status: 404, headers: cors });
    }

    const headers = new Headers(cors);
    obj.writeHttpMetadata(headers);
    headers.set("ETag", obj.httpEtag);
    headers.set("Accept-Ranges", "bytes");

    // obj.range is populated even on a plain (non-range) get — describing
    // the whole object as one range, not "a partial range was served" — so
    // whether to answer 206 has to key off the client's own Range header,
    // not off obj.range's mere presence. Measured: without the `hasRange`
    // guard, every request came back 206, including ones with no Range
    // header at all.
    if (hasRange && obj.range) {
      const { offset, length } = obj.range;
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
      headers.set("Content-Length", String(length));
      return new Response(obj.body, { status: 206, headers });
    }

    headers.set("Content-Length", String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  },
};
