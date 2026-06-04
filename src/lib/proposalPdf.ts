import type { CrmProposal, ProposalConfig, ProposalSection } from "../types/proposal";
import { youtubeEmbedUrl } from "../types/proposal";
import { getProposalImageUrl } from "./proposalSettingsDb";

function esc(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

type PmNode = {
  type?: string; text?: string; content?: PmNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
};

function convertMarks(text: string, marks: PmNode["marks"] = []): string {
  let r = esc(text);
  for (const m of marks) {
    if (m.type === "bold") r = `<strong>${r}</strong>`;
    else if (m.type === "italic") r = `<em>${r}</em>`;
    else if (m.type === "underline") r = `<u>${r}</u>`;
    else if (m.type === "strike") r = `<s>${r}</s>`;
    else if (m.type === "link") r = `<a href="${esc(String(m.attrs?.href ?? ""))}">${r}</a>`;
  }
  return r;
}

function convertNode(n: PmNode): string {
  switch (n.type) {
    case "text": return convertMarks(n.text ?? "", n.marks);
    case "paragraph": { const i = (n.content ?? []).map(convertNode).join(""); return i ? `<p>${i}</p>` : "<p>&nbsp;</p>"; }
    case "heading": { const l = Number(n.attrs?.level ?? 2); return `<h${l}>${(n.content ?? []).map(convertNode).join("")}</h${l}>`; }
    case "bulletList": return `<ul>${(n.content ?? []).map(convertNode).join("")}</ul>`;
    case "orderedList": return `<ol>${(n.content ?? []).map(convertNode).join("")}</ol>`;
    case "listItem": return `<li>${(n.content ?? []).map(convertNode).join("")}</li>`;
    case "blockquote": return `<blockquote>${(n.content ?? []).map(convertNode).join("")}</blockquote>`;
    case "hardBreak": return "<br>";
    case "horizontalRule": return "<hr>";
    default: return (n.content ?? []).map(convertNode).join("");
  }
}

function richToHtml(json: Record<string, unknown> | null): string {
  if (!json) return "";
  try { return convertNode(json as PmNode); } catch { return ""; }
}

function sectionIsVisible(sec: ProposalSection, proposal: CrmProposal): boolean {
  if (!sec.triggerProductKeyword) return true;
  const kw = sec.triggerProductKeyword.toLowerCase();
  return proposal.products.some((p) => p.name.toLowerCase().includes(kw));
}

export function openProposalPdf(proposal: CrmProposal, config: ProposalConfig): void {
  const primary = config.primaryColor || "#10b981";
  const accent  = config.accentColor  || "#38bdf8";
  const fontImport = config.fontFamily
    ? `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(config.fontFamily)}:wght@300;400;500;600;700&display=swap');`
    : "";
  const fontStack = config.fontFamily ? `'${config.fontFamily}', sans-serif` : "system-ui, sans-serif";

  const visibleSections = config.sections.filter((s) => sectionIsVisible(s, proposal));

  // ── Diferenciais ────────────────────────────────────────────────────────────
  const differentialsHtml = config.differentials.length > 0 ? `
    <section class="section">
      <h2 class="section-title">Por que escolher nossa escola?</h2>
      <div class="diff-grid">
        ${config.differentials.map((d) => `
          <div class="diff-card">
            ${d.imageFileId ? `<img src="${esc(getProposalImageUrl(d.imageFileId))}" class="diff-img" alt="" onerror="this.style.display='none'" />` : ""}
            <div class="diff-body">
              <div class="diff-icon">✓</div>
              <strong class="diff-title">${esc(d.title)}</strong>
              <p class="diff-desc">${esc(d.description)}</p>
            </div>
          </div>`).join("")}
      </div>
    </section>` : "";

  // ── Tabela unificada: horas (1º item) + produtos + total ─────────────────────
  const itemsSum = proposal.products.reduce((s, p) => s + p.price, 0);
  const grandTotal = proposal.totalValue + itemsSum;
  const itemsHtml = `
    <div class="items-table">
      <table>
        <thead><tr><th>Item</th><th class="right">Valor</th></tr></thead>
        <tbody>
          <tr>
            <td>Horas de voo <span class="dim">(${proposal.hours}h × ${fmtCurrency(proposal.hourPrice)}/h)</span></td>
            <td class="right">${fmtCurrency(proposal.totalValue)}</td>
          </tr>
          ${proposal.products.map((p) => `<tr><td>${esc(p.name)}</td><td class="right">${fmtCurrency(p.price)}</td></tr>`).join("")}
        </tbody>
        <tfoot>
          <tr class="total-row"><td><strong>Total</strong></td><td class="right total-amount"><strong>${fmtCurrency(grandTotal)}</strong></td></tr>
        </tfoot>
      </table>
    </div>`;

  // ── Vídeo de capa ────────────────────────────────────────────────────────────
  const coverVideoHtml = config.coverVideoUrl && youtubeEmbedUrl(config.coverVideoUrl)
    ? `<div class="cover-video"><span class="cover-video-label">📹 Vídeo de apresentação: </span><a href="${esc(config.coverVideoUrl)}" class="cover-video-link">${esc(config.coverVideoUrl)}</a></div>`
    : "";

  // ── Seções personalizadas ────────────────────────────────────────────────────
  const sectionsHtml = visibleSections.map((sec) => {
    const imagesHtml = sec.imageIds.length > 0
      ? `<div class="sec-images ${sec.imageIds.length === 1 ? "single" : ""}">
          ${sec.imageIds.map((id) => `<img src="${esc(getProposalImageUrl(id))}" class="sec-img" alt="" onerror="this.parentElement.style.display='none'" />`).join("")}
        </div>`
      : "";
    const descHtml = sec.description ? `<p class="sec-desc">${esc(sec.description).replace(/\n/g, "<br>")}</p>` : "";
    const videoHtml = sec.videoUrl && youtubeEmbedUrl(sec.videoUrl)
      ? `<p class="sec-video">📹 <a href="${esc(sec.videoUrl)}">${esc(sec.videoUrl)}</a></p>`
      : "";
    return `
      <section class="section">
        <h2 class="section-title">${esc(sec.title)}</h2>
        ${videoHtml}
        ${sec.imageIds.length > 0 ? `<div class="sec-layout">${imagesHtml}${descHtml}</div>` : descHtml}
      </section>`;
  }).join("");

  const paymentHtml = config.paymentMethodsRichJson
    ? `<section class="section"><h2 class="section-title">Formas de pagamento</h2><div class="rich">${richToHtml(config.paymentMethodsRichJson)}</div></section>` : "";
  const additionalHtml = config.additionalInfoRichJson
    ? `<section class="section"><h2 class="section-title">Informações adicionais</h2><div class="rich">${richToHtml(config.additionalInfoRichJson)}</div></section>` : "";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"/>
<title>Proposta — ${esc(proposal.leadName)}</title>
<style>
${fontImport}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:${fontStack};background:#fff;color:#1e293b;line-height:1.6;font-size:14px}
.page{max-width:780px;margin:0 auto;padding:36px 32px}
.header{display:flex;align-items:center;gap:18px;padding-bottom:20px;border-bottom:3px solid ${primary};margin-bottom:28px}
.logo{max-height:54px;max-width:160px;object-fit:contain}
.school-name{font-size:20px;font-weight:700;color:${primary}}
.subtitle{font-size:12px;color:#64748b;margin-top:2px}
.greeting{text-align:center;margin-bottom:32px}
.greeting h1{font-size:26px;font-weight:800;color:#0f172a}
.greeting p{color:#64748b;font-size:14px;margin-top:6px}
.section{margin-bottom:28px}
.section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#0f172a;padding-bottom:8px;border-bottom:2px solid ${primary};margin-bottom:14px}
.diff-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.diff-card{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
.diff-img{width:100%;height:100px;object-fit:cover;display:block}
.diff-body{padding:12px}
.diff-icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:${primary}20;color:${primary};font-weight:700;border-radius:6px;font-size:12px;margin-bottom:6px}
.diff-title{display:block;font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px}
.diff-desc{font-size:12px;color:#475569}
.hero{background:linear-gradient(135deg,${primary}12 0%,${accent}12 100%);border:1px solid ${primary}35;border-radius:12px;padding:24px;margin-bottom:28px}
.hero h2{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:4px}
.values{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
.value-box{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
.value-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
.value-amount{font-size:18px;font-weight:700;color:${primary};margin-top:2px}
.cover-video{margin-bottom:20px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px}
.cover-video-label{color:#475569}
.cover-video-link{color:${primary};word-break:break-all}
.items-table{margin-top:0}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{background:${primary}15}
th{padding:7px 10px;text-align:left;font-weight:600;color:#0f172a;border-bottom:1.5px solid ${primary}40}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;color:#334155}
.right{text-align:right}
.sec-layout{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:center}
.sec-images{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sec-images.single{grid-template-columns:1fr}
.sec-img{width:100%;height:120px;object-fit:cover;border-radius:6px;display:block}
.sec-desc{font-size:13px;color:#334155;white-space:pre-line;line-height:1.7}
.rich{font-size:13px;color:#334155}
.rich p{margin-bottom:6px}
.rich h1,.rich h2,.rich h3{margin:10px 0 5px;color:#0f172a}
.rich ul,.rich ol{padding-left:18px;margin-bottom:6px}
.rich li{margin-bottom:3px}
.rich blockquote{border-left:3px solid ${primary};padding-left:10px;color:#64748b;margin:6px 0}
.sec-video{font-size:12px;color:#475569;margin-bottom:8px}
.dim{color:#94a3b8;font-size:11px}
.total-row{background:${primary}18}
.total-amount{color:${primary};font-size:15px}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:18px 22px}@page{margin:.8cm}}
</style></head><body><div class="page">
<header class="header">
  ${config.logoUrl ? `<img src="${esc(config.logoUrl)}" class="logo" alt="" />` : ""}
  <div><div class="school-name">${esc(config.schoolName || "Escola de Aviação")}</div>
  <div class="subtitle">Proposta comercial · ${fmtDate(new Date().toISOString())}</div></div>
</header>

<div class="greeting">
  <h1>Olá, ${esc(proposal.leadName)}!</h1>
  <p>Preparamos esta proposta exclusiva para você.</p>
</div>

${coverVideoHtml}
${differentialsHtml}

<div class="hero">
  <h2>Sua proposta</h2>
  <div class="values">
    <div class="value-box"><div class="value-label">Horas de voo</div><div class="value-amount">${proposal.hours}h</div></div>
    <div class="value-box"><div class="value-label">Valor por hora</div><div class="value-amount">${fmtCurrency(proposal.hourPrice)}</div></div>
    <div class="value-box"><div class="value-label">Total estimado</div><div class="value-amount">${fmtCurrency(proposal.totalValue)}</div></div>
  </div>
  ${itemsHtml}
</div>

${sectionsHtml}
${paymentHtml}
${additionalHtml}

<div class="footer">
  ${esc(config.schoolName)} · Gerado em ${new Date().toLocaleString("pt-BR")}
</div>
</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},600)});</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
