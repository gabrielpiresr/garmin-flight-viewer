// Cloudflare Worker - proxy de upload multipart para R2.
//
// O browser nunca deve receber WORKER_SECRET. A Appwrite Function existente
// emite tokens HMAC curtos; este worker valida o token e escopa upload/listagem
// ao key/prefix autorizado.

const BASE_CORS = {
  "Access-Control-Allow-Origin": "https://localhost.invalid",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-upload-id, x-upload-key, x-part-number, x-token",
};

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "https://localhost.invalid";
  return { ...BASE_CORS, "Access-Control-Allow-Origin": allowOrigin, Vary: "Origin" };
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request, env), "Content-Type": "application/json" },
  });
}

function err(request, env, message, status = 400) {
  return json(request, env, { error: message }, status);
}

function videoContentType(key) {
  const extension = String(key || "").split(".").pop()?.toLowerCase();
  const types = {
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mts: "video/mp2t",
    m2ts: "video/mp2t",
  };
  return types[extension] || "application/octet-stream";
}

function contentTypeForKey(key) {
  const extension = String(key || "").split(".").pop()?.toLowerCase();
  const imageTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  };
  return imageTypes[extension] || videoContentType(key);
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyToken(env, token, expected) {
  if (!token || !env.WORKER_SECRET) return null;
  const [encoded, sig] = String(token).split(".");
  if (!encoded || !sig) return null;
  const expectedSig = await hmacHex(env.WORKER_SECRET, encoded);
  if (!timingSafeEqual(sig, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
  if (expected.action && payload.action !== expected.action) return null;
  if (expected.key && payload.key !== expected.key) return null;
  if (expected.prefix && payload.prefix !== expected.prefix) return null;
  return payload;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json(request, env, { ok: true });
    }

    if (url.pathname === "/upload/initiate" && request.method === "POST") {
      return handleInitiate(request, env);
    }

    if (url.pathname === "/upload/part" && request.method === "PUT") {
      return handlePart(request, env);
    }

    if (url.pathname === "/upload/complete" && request.method === "POST") {
      return handleComplete(request, env);
    }

    if (url.pathname === "/upload/file" && request.method === "PUT") {
      return handleFilePut(request, env);
    }

    if (url.pathname === "/storage/list" && request.method === "POST") {
      return handleList(request, env);
    }

    if (url.pathname === "/storage/object" && request.method === "DELETE") {
      return handleDeleteObject(request, env);
    }

    if (url.pathname === "/download" && (request.method === "GET" || request.method === "HEAD")) {
      return handleDownload(request, env, url);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders(request, env) });
  },
};

async function handleInitiate(request, env) {
  const body = await request.json().catch(() => null);
  const requestedKey = String(body?.key || `video-${Date.now()}.mp4`);
  const key = `flights/${requestedKey}`;
  if (!(await verifyToken(env, body?.token, { action: "upload", key }))) {
    return err(request, env, "Unauthorized", 401);
  }

  const upload = await env.FLIGHT_VIDEOS.createMultipartUpload(key, {
    httpMetadata: {
      contentType: videoContentType(key),
      contentDisposition: "inline",
    },
  });

  return json(request, env, { uploadId: upload.uploadId, key: upload.key });
}

async function handlePart(request, env) {
  const uploadId = request.headers.get("x-upload-id");
  const key = request.headers.get("x-upload-key");
  const partNumber = parseInt(request.headers.get("x-part-number") || "1", 10);
  const token = request.headers.get("x-token");

  if (!uploadId || !key) return err(request, env, "x-upload-id e x-upload-key obrigatorios", 400);
  if (!(await verifyToken(env, token, { action: "upload", key }))) return err(request, env, "Unauthorized", 401);

  const upload = env.FLIGHT_VIDEOS.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);

  return json(request, env, { etag: part.etag, partNumber: part.partNumber });
}

async function handleComplete(request, env) {
  const body = await request.json().catch(() => null);
  const { uploadId, key, parts } = body || {};
  if (!uploadId || !key || !parts) return err(request, env, "uploadId, key e parts obrigatorios", 400);
  if (!(await verifyToken(env, body.token, { action: "upload", key }))) return err(request, env, "Unauthorized", 401);

  const upload = env.FLIGHT_VIDEOS.resumeMultipartUpload(key, uploadId);
  await upload.complete(parts);

  const fileUrl = `${env.R2_PUBLIC_URL}/${key}`;
  return json(request, env, { fileUrl });
}

async function handleFilePut(request, env) {
  const key = request.headers.get("x-upload-key");
  const token = request.headers.get("x-token");
  if (!key) return err(request, env, "x-upload-key obrigatorio", 400);
  if (!key.startsWith("flights/") || key.includes("..")) return err(request, env, "Chave invalida", 400);
  if (!(await verifyToken(env, token, { action: "upload", key }))) return err(request, env, "Unauthorized", 401);

  const contentType = request.headers.get("Content-Type") || contentTypeForKey(key);
  await env.FLIGHT_VIDEOS.put(key, request.body, {
    httpMetadata: {
      contentType,
      contentDisposition: "inline",
    },
  });

  return json(request, env, { key, fileUrl: `${env.R2_PUBLIC_URL}/${key}` });
}

// Download com Content-Disposition: attachment. O bucket já é público para
// leitura (R2_PUBLIC_URL), então esta rota não amplia o acesso — só força o
// browser a salvar o arquivo em vez de reproduzir inline.
async function handleDownload(request, env, url) {
  const key = String(url.searchParams.get("key") || "");
  if (!key.startsWith("flights/") || key.includes("..")) {
    return err(request, env, "Chave invalida", 400);
  }

  const filename = (key.split("/").pop() || "video.mp4").replace(/["\\]/g, "");
  const baseHeaders = {
    ...corsHeaders(request, env),
    "Content-Type": contentTypeForKey(key),
    "Content-Disposition": `attachment; filename="${filename}"`,
  };

  if (request.method === "HEAD") {
    const head = await env.FLIGHT_VIDEOS.head(key);
    if (!head) return err(request, env, "Nao encontrado", 404);
    return new Response(null, {
      headers: { ...baseHeaders, "Content-Length": String(head.size) },
    });
  }

  const object = await env.FLIGHT_VIDEOS.get(key);
  if (!object) return err(request, env, "Nao encontrado", 404);
  return new Response(object.body, {
    headers: { ...baseHeaders, "Content-Length": String(object.size) },
  });
}

async function handleDeleteObject(request, env) {
  const body = await request.json().catch(() => null);
  const key = String(body?.key || "");
  if (!key.startsWith("flights/") || key.includes("..")) return err(request, env, "Chave invalida", 400);
  if (!(await verifyToken(env, body?.token, { action: "delete", key }))) return err(request, env, "Unauthorized", 401);
  await env.FLIGHT_VIDEOS.delete(key);
  return json(request, env, { ok: true });
}

async function handleList(request, env) {
  const body = await request.json().catch(() => null);
  const prefix = typeof body?.prefix === "string" ? body.prefix : "";
  if (!(await verifyToken(env, body?.token, { action: "list", prefix }))) return err(request, env, "Unauthorized", 401);

  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);
  const listed = await env.FLIGHT_VIDEOS.list({ prefix, limit });

  const objects = listed.objects.map((obj) => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded instanceof Date ? obj.uploaded.toISOString() : obj.uploaded ?? null,
    fileUrl: `${env.R2_PUBLIC_URL}/${obj.key}`,
  }));

  return json(request, env, { objects, truncated: listed.truncated === true });
}
