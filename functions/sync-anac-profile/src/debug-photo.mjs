const ANAC_URL = "https://consultadelicencas.anac.gov.br/consultadelicencas/";

function toMaskedCpf(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

const body = new URLSearchParams({
  txtCodAnac: "",
  IDIOMA: "P",
  txcoddac: "264933",
  txCPF: toMaskedCpf("06254435608"),
  DtNasc: "12/01/1998",
  enviar: "enviar",
});

const searchRes = await fetch(ANAC_URL, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: body.toString(),
});

const html = await searchRes.text();
const setCookieRaw = searchRes.headers.get("set-cookie") || "";
const cookies = typeof searchRes.headers.getSetCookie === "function" ? searchRes.headers.getSetCookie() : [];
const cookieHeader = [
  ...cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean),
  ...setCookieRaw
    .split(/,(?=\s*[a-zA-Z0-9_\-]+=)/g)
    .map((cookie) => cookie.split(";")[0].trim())
    .filter(Boolean),
].join("; ");

console.log("SEARCH", searchRes.status, "cookieHeader", cookieHeader);
console.log("HAS foto.asp", html.includes("foto.asp"));

const photoRes = await fetch(new URL("foto.asp", ANAC_URL), {
  headers: {
    cookie: cookieHeader,
    referer: ANAC_URL,
    origin: "https://consultadelicencas.anac.gov.br",
    accept: "image/*,*/*;q=0.8",
  },
});

console.log("PHOTO", photoRes.status, photoRes.headers.get("content-type"), photoRes.headers.get("content-length"));
const contentType = String(photoRes.headers.get("content-type") || "").toLowerCase();
if (contentType.includes("text/html")) {
  const photoHtml = await photoRes.text();
  console.log("PHOTO HTML snippet:", photoHtml.slice(0, 500).replace(/\s+/g, " "));
} else {
  const buffer = Buffer.from(await photoRes.arrayBuffer());
  console.log("PHOTO BYTES", buffer.length, "SIG", buffer.slice(0, 16).toString("hex"));
}
