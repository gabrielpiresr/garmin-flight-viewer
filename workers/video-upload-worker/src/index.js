// Cloudflare Worker — proxy de upload multipart para R2 (sem credenciais S3)
// Usa o binding R2 nativo, que já está autenticado pelo Cloudflare internamente.
//
// Endpoints:
//   POST /upload/initiate   { key, secret } → { uploadId, key }
//   PUT  /upload/part       headers: x-upload-id, x-upload-key, x-part-number, x-secret
//                           body: bytes do chunk → { etag, partNumber }
//   POST /upload/complete   { uploadId, key, parts: [{partNumber, etag}], secret } → { fileUrl }
//   GET  /health            → { ok: true }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-upload-id, x-upload-key, x-part-number, x-secret",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true });
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

    return new Response("Not found", { status: 404, headers: CORS });
  },
};

async function handleInitiate(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || body.secret !== env.WORKER_SECRET) return err("Unauthorized", 401);

  const key = `flights/${body.key || `video-${Date.now()}.mp4`}`;
  const upload = await env.FLIGHT_VIDEOS.createMultipartUpload(key, {
    httpMetadata: {
      contentType: "video/mp4",
      contentDisposition: "inline",
    },
  });

  return json({ uploadId: upload.uploadId, key: upload.key });
}

async function handlePart(request, env) {
  const secret = request.headers.get("x-secret");
  if (secret !== env.WORKER_SECRET) return err("Unauthorized", 401);

  const uploadId = request.headers.get("x-upload-id");
  const key = request.headers.get("x-upload-key");
  const partNumber = parseInt(request.headers.get("x-part-number") || "1", 10);

  if (!uploadId || !key) return err("x-upload-id e x-upload-key obrigatórios", 400);

  const upload = env.FLIGHT_VIDEOS.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);

  return json({ etag: part.etag, partNumber: part.partNumber });
}

async function handleComplete(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || body.secret !== env.WORKER_SECRET) return err("Unauthorized", 401);

  const { uploadId, key, parts } = body;
  if (!uploadId || !key || !parts) return err("uploadId, key e parts obrigatórios", 400);

  const upload = env.FLIGHT_VIDEOS.resumeMultipartUpload(key, uploadId);
  await upload.complete(parts);

  const fileUrl = `${env.R2_PUBLIC_URL}/${key}`;
  return json({ fileUrl });
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
