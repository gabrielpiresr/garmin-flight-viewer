import type { Contract, ContractSignature } from "../types/contracts";
import { CONTRACT_STATUS_LABELS, resolveCustomVars } from "../types/contracts";

// ─── Escape / formatação ──────────────────────────────────────────────────────

function esc(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ─── Hash de verificação ──────────────────────────────────────────────────────

export function generateVerificationCode(contractId: string, signerUserId: string, signedAt: string): string {
  const input = `${contractId}::${signerUserId}::${signedAt}`;
  let h0 = 0x6A09E667, h1 = 0xBB67AE85, h2 = 0x3C6EF372, h3 = 0xA54FF53A;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x9e3779b9) >>> 0;
    h1 = Math.imul(h1 ^ (c << 3), 0x6c62272e) >>> 0;
    h2 = Math.imul(h2 ^ (c << 7), 0x94d049bb) >>> 0;
    h3 = Math.imul(h3 ^ (c << 11), 0xbf58476d) >>> 0;
  }
  h0 = (h0 ^ (h0 >>> 16)) >>> 0;
  h1 = (h1 ^ (h1 >>> 13)) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  h3 = (h3 ^ (h3 >>> 13)) >>> 0;
  const hex = (n: number) => (n >>> 0).toString(16).toUpperCase().padStart(4, "0").slice(-4);
  return `${hex(h0)}-${hex(h1)}-${hex(h2)}-${hex(h3)}`;
}

// ─── Conversor de ProseMirror JSON → HTML ─────────────────────────────────────
// Implementação própria para não depender de Tiptap fora do contexto React.

type PmNode = {
  type?: string;
  text?: string;
  content?: PmNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
};

function convertMarks(text: string, marks: PmNode["marks"] = []): string {
  let out = esc(text);
  for (const mark of marks) {
    if (mark.type === "bold") out = `<strong>${out}</strong>`;
    else if (mark.type === "italic") out = `<em>${out}</em>`;
    else if (mark.type === "underline") out = `<u>${out}</u>`;
    else if (mark.type === "strike") out = `<s>${out}</s>`;
    else if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? esc(mark.attrs.href) : "#";
      out = `<a href="${href}">${out}</a>`;
    }
  }
  return out;
}

function convertNodes(nodes: PmNode[] | undefined): string {
  return (nodes ?? []).map(convertNode).join("");
}

function convertNode(node: PmNode): string {
  switch (node.type) {
    case "text":
      return convertMarks(node.text ?? "", node.marks);
    case "paragraph":
      return `<p>${convertNodes(node.content)}</p>`;
    case "heading": {
      const level = Number(node.attrs?.level) || 2;
      const tag = `h${Math.min(Math.max(level, 1), 6)}`;
      return `<${tag}>${convertNodes(node.content)}</${tag}>`;
    }
    case "bulletList":
      return `<ul>${convertNodes(node.content)}</ul>`;
    case "orderedList":
      return `<ol>${convertNodes(node.content)}</ol>`;
    case "listItem":
      return `<li>${convertNodes(node.content)}</li>`;
    case "blockquote":
      return `<blockquote>${convertNodes(node.content)}</blockquote>`;
    case "horizontalRule":
      return `<hr/>`;
    case "hardBreak":
      return `<br/>`;
    case "table":
      return `<table>${convertNodes(node.content)}</table>`;
    case "tableRow":
      return `<tr>${convertNodes(node.content)}</tr>`;
    case "tableHeader":
      return `<th>${convertNodes(node.content)}</th>`;
    case "tableCell":
      return `<td>${convertNodes(node.content)}</td>`;
    case "image": {
      const src = typeof node.attrs?.src === "string" ? esc(node.attrs.src) : "";
      const alt = typeof node.attrs?.alt === "string" ? esc(node.attrs.alt) : "";
      return src ? `<img src="${src}" alt="${alt}" />` : "";
    }
    case "doc":
      return convertNodes(node.content);
    default:
      return convertNodes(node.content);
  }
}

function richJsonToHtml(resolvedJson: string): string {
  try {
    const doc = JSON.parse(resolvedJson) as PmNode;
    return convertNode(doc);
  } catch {
    // Fallback: tratar como texto simples
    return resolvedJson.split("\n").map(line => `<p>${esc(line)}</p>`).join("");
  }
}

// ─── Bloco de assinatura ──────────────────────────────────────────────────────

function sigBlock(opts: {
  label: string;
  name: string;
  role: string;
  signed: boolean;
  signedAt: string | null;
  code?: string;
}): string {
  const { label, name, role, signed, signedAt, code } = opts;
  return `
  <div class="sig-block ${signed ? "sig-ok" : "sig-wait"}">
    <div class="sig-header">
      <span class="sig-label">${esc(label)}</span>
      <span class="sig-status">${signed ? "✓ Assinado eletronicamente" : "Aguardando assinatura"}</span>
    </div>
    <div class="sig-line"></div>
    <table class="sig-table">
      <tr><td class="sk">Nome</td><td class="sv">${esc(name)}</td></tr>
      <tr><td class="sk">Papel</td><td class="sv">${esc(role)}</td></tr>
      ${signed && signedAt ? `<tr><td class="sk">Data / Hora</td><td class="sv">${fmtDateTime(signedAt)}</td></tr>` : ""}
      ${signed && code ? `<tr><td class="sk">Cód. verificação</td><td class="sv hash">${esc(code)}</td></tr>` : ""}
      ${!signed ? `<tr><td colspan="2" class="sig-hint">Assinatura pendente — espaço reservado.</td></tr>` : ""}
    </table>
  </div>`;
}

// ─── HTML completo ────────────────────────────────────────────────────────────

function buildHtml(opts: {
  contract: Contract;
  signatures: ContractSignature[];
  schoolName: string;
  logoUrl?: string;
}): string {
  const { contract, signatures, schoolName, logoUrl } = opts;

  // Resolver variáveis customizadas
  const resolvedJson = resolveCustomVars(contract.contentResolvedJson, contract.customVarValues);
  const bodyHtml = richJsonToHtml(resolvedJson);

  const shortId = contract.id.slice(-12).toUpperCase();
  const statusLabel = CONTRACT_STATUS_LABELS[contract.status] ?? contract.status;
  const isSigned = contract.status === "signed_both";

  const recipientSig = signatures.find(s => s.signerRole === "aluno" || s.signerRole === "instrutor");
  const adminSig = signatures.find(s => s.signerRole === "admin");

  const recipientCode = recipientSig
    ? generateVerificationCode(contract.id, recipientSig.signerUserId, recipientSig.signedAt)
    : undefined;
  const adminCode = adminSig
    ? generateVerificationCode(contract.id, adminSig.signerUserId, adminSig.signedAt)
    : undefined;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${esc(contract.templateName)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:11pt}
body{font-family:"Times New Roman",Times,Georgia,serif;color:#111;background:#fff;line-height:1.65}
@page{size:A4;margin:18mm 20mm 22mm 20mm}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}

/* Cabeçalho */
.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1a1a2e;padding-bottom:12px;margin-bottom:18px}
.hdr-logo img{max-height:52px;max-width:180px;object-fit:contain}
.hdr-logo-text{font-size:17pt;font-weight:bold;color:#1a1a2e}
.hdr-right{text-align:right}
.hdr-title{font-size:14pt;font-weight:bold;text-transform:uppercase;letter-spacing:.8px;color:#1a1a2e}
.hdr-id{font-size:8pt;color:#777;font-family:"Courier New",monospace;margin-top:2px}

/* Meta */
.meta{background:#f7f7f9;border:1px solid #ddd;border-radius:3px;padding:10px 14px;margin-bottom:26px;display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;font-size:9.5pt}
.mrow{display:flex;gap:5px;align-items:baseline}
.mk{color:#666;white-space:nowrap;min-width:100px;font-style:italic}
.mv{color:#111;font-weight:bold}
.ms-ok{display:inline-block;padding:1px 8px;border-radius:3px;font-size:8.5pt;font-weight:bold;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7}
.ms-pending{display:inline-block;padding:1px 8px;border-radius:3px;font-size:8.5pt;font-weight:bold;background:#fef3c7;color:#92400e;border:1px solid #fcd34d}

/* Corpo */
.body{margin:0 0 32px}
.body h1{font-size:14pt;font-weight:bold;text-align:center;margin:22px 0 14px;text-transform:uppercase;letter-spacing:.5px}
.body h2{font-size:12pt;font-weight:bold;margin:18px 0 8px;border-bottom:1px solid #ccc;padding-bottom:3px}
.body h3{font-size:11pt;font-weight:bold;margin:14px 0 6px}
.body h4,.body h5,.body h6{font-size:10.5pt;font-weight:bold;margin:10px 0 5px}
.body p{margin:0 0 9px;text-align:justify;text-indent:24px}
.body p:first-child{text-indent:0}
.body ul,.body ol{margin:7px 0 10px 28px}
.body li{margin-bottom:3px}
.body blockquote{border-left:3px solid #888;padding:5px 12px;color:#444;margin:10px 0;font-style:italic}
.body hr{border:none;border-top:1px solid #ccc;margin:18px 0}
.body strong{font-weight:bold}
.body em{font-style:italic}
.body u{text-decoration:underline}
.body s{text-decoration:line-through}
.body a{color:#1a1a2e}
.body table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}
.body th{background:#f0f0f0;border:1px solid #bbb;padding:5px 9px;font-weight:bold;text-align:left}
.body td{border:1px solid #bbb;padding:4px 9px}
.body img{max-width:100%;height:auto;display:block;margin:8px 0}

/* Assinaturas */
.sig-title{font-size:10.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.8px;color:#1a1a2e;border-top:2px solid #1a1a2e;padding-top:12px;margin-bottom:16px}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
.sig-block{border:1px solid #ccc;border-radius:3px;padding:12px}
.sig-ok{border-color:#6ee7b7;background:#f0fdf4}
.sig-wait{background:#fafafa}
.sig-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.sig-label{font-size:8.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#444}
.sig-status{font-size:7.5pt;padding:1px 6px;border-radius:3px;font-weight:bold}
.sig-ok .sig-status{background:#d1fae5;color:#065f46}
.sig-wait .sig-status{background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb}
.sig-line{height:36px;border-bottom:1.5px solid #555;margin-bottom:8px}
.sig-ok .sig-line{border-color:#059669}
.sig-table{width:100%;font-size:8pt;border-collapse:collapse}
.sig-table td{padding:2px 0;vertical-align:top}
.sk{color:#666;white-space:nowrap;width:100px;font-style:italic}
.sv{color:#111;font-weight:bold;padding-left:6px}
.hash{font-family:"Courier New",monospace;letter-spacing:.8px;color:#1a1a2e}
.sig-hint{color:#bbb;font-style:italic;padding-top:4px}

/* Rodapé integridade */
.integrity{border:1px solid #d1d5db;border-radius:3px;background:#f9fafb;padding:10px 14px;font-size:8pt;color:#555;line-height:1.5}
.integrity strong{color:#111}
.integrity-id{font-family:"Courier New",monospace;font-size:7.5pt;color:#999;margin-top:4px;word-break:break-all}

/* Footer de página */
.pfooter{margin-top:28px;border-top:1px solid #ddd;padding-top:7px;display:flex;justify-content:space-between;font-size:7.5pt;color:#bbb}
</style>
</head>
<body>
<div style="max-width:800px;margin:0 auto;padding:28px 36px">

<!-- Cabeçalho -->
<div class="hdr">
  <div class="hdr-logo">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(schoolName)}"/>` : `<div class="hdr-logo-text">${esc(schoolName || "Escola")}</div>`}
  </div>
  <div class="hdr-right">
    <div class="hdr-title">${esc(contract.templateName)}</div>
    <div class="hdr-id">Nº ${esc(shortId)}</div>
  </div>
</div>

<!-- Metadados -->
<div class="meta">
  <div class="mrow"><span class="mk">Contratante:</span><span class="mv">${esc(contract.recipientName)}</span></div>
  <div class="mrow"><span class="mk">Status:</span><span class="${isSigned ? "ms-ok" : "ms-pending"}">${esc(statusLabel)}</span></div>
  <div class="mrow"><span class="mk">Contratada:</span><span class="mv">${esc(schoolName || "Escola")}</span></div>
  <div class="mrow"><span class="mk">Emissão:</span><span class="mv">${fmtDate(contract.createdAt)}</span></div>
  ${contract.signedByRecipientAt ? `<div class="mrow"><span class="mk">Assin. aluno:</span><span class="mv">${fmtDate(contract.signedByRecipientAt)}</span></div>` : ""}
  ${contract.signedByAdminAt ? `<div class="mrow"><span class="mk">Assin. escola:</span><span class="mv">${fmtDate(contract.signedByAdminAt)}</span></div>` : ""}
</div>

<!-- Corpo -->
<div class="body">${bodyHtml}</div>

<!-- Assinaturas -->
<div class="sig-title">Assinaturas</div>
<div class="sig-grid">
  ${sigBlock({ label:"Contratante", name:contract.recipientName, role:"Aluno / Preenchente",
    signed:!!contract.signedByRecipientAt,
    signedAt:contract.signedByRecipientAt ?? recipientSig?.signedAt ?? null,
    code:recipientCode })}
  ${sigBlock({ label:"Contratada (Escola)", name:schoolName||"Escola", role:"Representante Legal",
    signed:!!contract.signedByAdminAt,
    signedAt:contract.signedByAdminAt ?? adminSig?.signedAt ?? null,
    code:adminCode })}
</div>

<!-- Integridade -->
<div class="integrity">
  <strong>Documento eletrônico</strong> — gerado pela plataforma de gestão de escola de aviação.
  ${isSigned ? "Ambas as partes confirmaram ciência e concordância com os termos por meio de assinatura eletrônica registrada com data, hora e código de verificação." : "O documento ainda não possui assinaturas de ambas as partes."}
  <div class="integrity-id">ID: ${esc(contract.id)}</div>
  ${recipientCode ? `<div class="integrity-id">Hash (aluno): ${esc(recipientCode)}</div>` : ""}
  ${adminCode ? `<div class="integrity-id">Hash (escola): ${esc(adminCode)}</div>` : ""}
</div>

<!-- Footer -->
<div class="pfooter">
  <span>${esc(schoolName)} · ${esc(contract.templateName)}</span>
  <span>Gerado em ${new Date().toLocaleString("pt-BR")}</span>
</div>

</div>
<script>
window.addEventListener("load", function() {
  setTimeout(function() { window.focus(); window.print(); }, 500);
});
</script>
</body>
</html>`;
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

export function openContractPdf(opts: {
  contract: Contract;
  signatures: ContractSignature[];
  schoolName: string;
  logoUrl?: string;
}): void {
  const html = buildHtml(opts);
  // Seguir exatamente o padrão do flightFichaPdf.ts — sem "noopener"
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup bloqueado. Permita popups para este site e tente novamente.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
