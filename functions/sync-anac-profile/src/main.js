const sdk = require("node-appwrite");
const cheerio = require("cheerio");

const ANAC_URL = "https://consultadelicencas.anac.gov.br/consultadelicencas/";
const REQUEST_TIMEOUT_MS = Number(process.env.ANAC_REQUEST_TIMEOUT_MS || 15000);

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new sdk.Databases(client);
const storage = new sdk.Storage(client);

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID;

function jsonResponse(res, status, payload) {
  return res.json(payload, status);
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeLoose(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toMaskedCpf(value) {
  const digits = normalizeDigits(value).slice(0, 11);
  if (digits.length !== 11) return "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function toBrDate(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }
  return "";
}

async function getProfileByUserId(userId) {
  const result = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    sdk.Query.equal("user_id", userId),
    sdk.Query.limit(1),
  ]);
  return result.documents[0] || null;
}

async function markPending(userId, reason) {
  try {
    const profile = await getProfileByUserId(userId);
    if (!profile) return;
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profile.$id, {
      anac_sync_status: "pending",
      anac_sync_error: String(reason || "ANAC sync failed").slice(0, 1024),
      anac_last_sync_at: new Date().toISOString(),
    });
  } catch {
    // best effort only
  }
}

async function postAnac({ anacCode, cpf, birthDate }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const body = new URLSearchParams({
    txtCodAnac: "",
    IDIOMA: "P",
    txcoddac: anacCode,
    txCPF: toMaskedCpf(cpf),
    DtNasc: toBrDate(birthDate),
    enviar: "enviar",
  });

  try {
    const response = await fetch(ANAC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ANAC request failed with status ${response.status}`);
    }
    const html = await response.text();
    const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    const rawCookie = response.headers.get("set-cookie") || "";
    const cookieHeader = [
      ...cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean),
      ...rawCookie
        .split(/,(?=\s*[a-zA-Z0-9_\-]+=)/g)
        .map((cookie) => cookie.split(";")[0].trim())
        .filter(Boolean),
    ]
      .filter(Boolean)
      .join("; ");
    return { html, cookieHeader };
  } finally {
    clearTimeout(timeoutId);
  }
}

function tableRows($, tableEl) {
  const rows = [];
  $(tableEl)
    .find("tr")
    .each((_, tr) => {
      const cells = $(tr)
        .find("th,td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (cells.length) rows.push(cells);
    });
  return rows;
}

function normalizeDateLike(value) {
  const text = String(value || "").trim();
  const match = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  return match ? match[0] : text;
}

function containsAllTokens(text, tokens) {
  const hay = normalizeLoose(text);
  return tokens.every((token) => hay.includes(normalizeLoose(token)));
}

function looksLikeSimpleTitle(title, expectedTokens) {
  const t = normalizeLoose(title);
  if (!containsAllTokens(t, expectedTokens)) return false;
  // Avoid giant "container" rows that include the full page text.
  return t.length <= 90;
}

function headersContain(headerRow, required) {
  const joined = normalizeLoose((headerRow || []).join(" "));
  return required.every((part) => joined.includes(normalizeLoose(part)));
}

function findSectionRows($, titleTokens, requiredHeaders) {
  let selected = [];
  $("table").each((_, table) => {
    if (selected.length) return;
    const rows = tableRows($, table);
    if (rows.length < 2) return;
    const firstRow = rows[0] || [];
    const secondRow = rows[1] || [];
    if (firstRow.length !== 1) return;
    const titleCell = firstRow[0] || "";
    if (!looksLikeSimpleTitle(titleCell, titleTokens)) return;
    if (!headersContain(secondRow, requiredHeaders)) return;
    if ((rows[2] || []).length < 2) return;
    selected = rows;
  });
  return selected;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isValidRatingType(value) {
  const text = cleanText(value);
  return /^[A-Z]{3,6}$/.test(text);
}

function isValidLicenseName(value) {
  const text = normalizeText(value);
  return text.includes("piloto");
}

function parseAnacHtml(html) {
  const $ = cheerio.load(html);

  const ratings = [];
  const licenses = [];
  const medical = {
    classe: "",
    validade: "",
    orgao_expedidor: "",
    observacoes: "",
  };

  const ratingRows = findSectionRows($, ["habilit"], ["tipo", "validade"]);
  ratingRows.slice(2).forEach((row) => {
    const tipo = cleanText(row[0]);
    const validade = normalizeDateLike(row[1] || "");
    if (!isValidRatingType(tipo) || !validade) return;
    ratings.push({ habilitacao: tipo, validade });
  });

  const licenseRows = findSectionRows($, ["licen"], ["licen", "data", "exped"]);
  licenseRows.slice(2).forEach((row) => {
    const licenca = cleanText(row[0]);
    const expedicao = normalizeDateLike(row[1] || "");
    if (!isValidLicenseName(licenca) || !expedicao) return;
    licenses.push({ licenca, expedicao });
  });

  const medicalRows = findSectionRows($, ["certificado"], ["classe", "validade"]);
  if (medicalRows.length >= 3) {
    const data = medicalRows[2] || [];
    medical.classe = cleanText(data[0]);
    medical.validade = normalizeDateLike(data[1] || "");
    medical.orgao_expedidor = cleanText(data[2]);
    medical.observacoes = cleanText(data[3]);

    for (const row of medicalRows.slice(3)) {
      const extra = cleanText(row[0]);
      if (!extra) continue;
      if (medical.observacoes) {
        medical.observacoes = `${medical.observacoes} | ${extra}`;
      } else {
        medical.observacoes = extra;
      }
    }
  }

  let photoUrl = "";
  const candidates = [
    ...$("img")
      .toArray()
      .map((img) => String($(img).attr("src") || "").trim())
      .filter(Boolean),
    ...$("a")
      .toArray()
      .map((link) => String($(link).attr("href") || "").trim())
      .filter(Boolean),
  ];

  const photoCandidate = candidates.find((src) => {
    const norm = normalizeText(src);
    if (!src) return false;
    if (src.startsWith("data:image/")) return true;
    if (norm.includes("logo") || norm.includes("banner") || norm.includes("brasao")) return false;
    return (
      norm.includes("foto.asp") ||
      norm.includes("/foto") ||
      norm.includes("foto") ||
      norm.includes("imagem") ||
      norm.includes("portrait") ||
      norm.includes("retrato")
    );
  });

  if (photoCandidate) {
    try {
      if (photoCandidate.startsWith("data:image/")) {
        photoUrl = photoCandidate;
      } else {
        photoUrl = new URL(photoCandidate, ANAC_URL).toString();
      }
    } catch {
      photoUrl = "";
    }
  }

  return { ratings, licenses, medical, photoUrl };
}

async function uploadPhoto(photoUrl, userId, cookieHeader = "") {
  if (!photoUrl || !BUCKET_ID) return null;
  let buffer = Buffer.alloc(0);
  if (photoUrl.startsWith("data:image/")) {
    const encoded = photoUrl.split(",")[1] || "";
    buffer = Buffer.from(encoded, "base64");
  } else {
    const res = await fetch(photoUrl, {
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        referer: ANAC_URL,
        origin: "https://consultadelicencas.anac.gov.br",
        accept: "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`Failed to download photo (${res.status})`);
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const nested = $("img")
        .toArray()
        .map((img) => String($(img).attr("src") || "").trim())
        .find((src) => src && !normalizeText(src).includes("logo"));
      if (nested && nested.startsWith("data:image/")) {
        const encoded = nested.split(",")[1] || "";
        buffer = Buffer.from(encoded, "base64");
      } else if (nested) {
        const nestedUrl = new URL(nested, photoUrl).toString();
        const nestedRes = await fetch(nestedUrl, {
          headers: {
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
            referer: ANAC_URL,
            origin: "https://consultadelicencas.anac.gov.br",
            accept: "image/*,*/*;q=0.8",
          },
        });
        if (!nestedRes.ok) throw new Error(`Failed to download nested photo (${nestedRes.status})`);
        const nestedBuffer = await nestedRes.arrayBuffer();
        buffer = Buffer.from(nestedBuffer);
      }
    } else {
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }
  }
  if (!buffer.length) return null;

  const inputFile =
    typeof File !== "undefined"
      ? new File([buffer], `anac-${userId}.jpg`, { type: "image/jpeg" })
      : sdk.InputFile?.fromBuffer
        ? sdk.InputFile.fromBuffer(buffer, `anac-${userId}.jpg`)
        : null;
  if (!inputFile) {
    throw new Error("No compatible file wrapper found for Appwrite upload.");
  }

  const uploaded = await storage.createFile(
    BUCKET_ID,
    sdk.ID.unique(),
    inputFile,
    [
      sdk.Permission.read(sdk.Role.users()),
      sdk.Permission.read(sdk.Role.user(userId)),
      sdk.Permission.update(sdk.Role.user(userId)),
      sdk.Permission.delete(sdk.Role.user(userId)),
    ],
  );
  return uploaded.$id;
}

function readPayload(req) {
  try {
    if (req.bodyJson && typeof req.bodyJson === "object") {
      return req.bodyJson;
    }
  } catch {
    // ignore parser failures and fallback to raw body
  }

  const rawBody = typeof req.body === "string" ? req.body.trim() : "";
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

module.exports = async ({ req, res, error, log }) => {
  let userId = "";
  try {
    if (!DATABASE_ID || !PROFILES_COLLECTION_ID || !BUCKET_ID) {
      return jsonResponse(res, 500, { message: "Missing required function environment variables." });
    }

    const payload = readPayload(req);
    userId = String(req.headers["x-appwrite-user-id"] || payload.userId || "").trim();
    if (!userId) {
      return jsonResponse(res, 401, { message: "Unauthorized request." });
    }

    const anacCode = normalizeDigits(payload.anacCode).slice(0, 32);
    const cpf = normalizeDigits(payload.cpf).slice(0, 11);
    const birthDate = String(payload.birthDate || "").trim();

    if (!anacCode || cpf.length !== 11) {
      await markPending(userId, "Missing ANAC code or CPF");
      return jsonResponse(res, 200, { pending: true, message: "ANAC sync pending: missing required fields." });
    }

    const profile = await getProfileByUserId(userId);
    if (!profile) {
      return jsonResponse(res, 404, { message: "Profile not found for current user." });
    }

    const { html, cookieHeader } = await postAnac({ anacCode, cpf, birthDate });
    const parsed = parseAnacHtml(html);

    if (!parsed.ratings.length && !parsed.licenses.length && !parsed.medical.classe && !parsed.photoUrl) {
      throw new Error("No ANAC pilot data detected in response.");
    }

    let photoFileId = "";
    try {
      photoFileId = (await uploadPhoto(parsed.photoUrl, userId, cookieHeader)) || "";
    } catch (photoError) {
      log(`ANAC photo upload warning: ${photoError?.message || photoError}`);
    }

    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profile.$id, {
      anac_ratings_json: JSON.stringify(parsed.ratings),
      anac_licenses_json: JSON.stringify(parsed.licenses),
      anac_medical_json: JSON.stringify(parsed.medical),
      anac_photo_file_id: photoFileId || profile.anac_photo_file_id || "",
      anac_sync_status: "success",
      anac_sync_error: "",
      anac_last_sync_at: new Date().toISOString(),
    });

    return jsonResponse(res, 200, {
      pending: false,
      ratings: parsed.ratings.length,
      licenses: parsed.licenses.length,
      hasMedical: Boolean(parsed.medical.classe || parsed.medical.validade),
      hasPhoto: Boolean(photoFileId),
    });
  } catch (err) {
    const message = String(err?.message || err || "ANAC sync failed");
    error(message);
    log(String(err?.stack || ""));
    if (userId) {
      await markPending(userId, message);
    }
    return jsonResponse(res, 200, { pending: true, message: "ANAC sync pending.", error: message });
  }
};
