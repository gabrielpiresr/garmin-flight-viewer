import type { ManeuverRichContent } from "../types/maneuver";
import type { HelpArticle, HelpCatalog, HelpCenterAudience, HelpSection } from "../types/helpCenter";
import { richContentToHtml } from "./maneuverContent";
import type { PdfBrand } from "./pdfBrand";
import { getPdfBrandLogoSrc } from "./pdfBrand";

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function plainTextToHtml(text: string): string {
  return esc(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function sortByOrderThenTitle<T extends { order: number; title: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "pt-BR"));
}

function domId(prefix: string, id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-") || "item";
  return `${prefix}-${safeId}`;
}

function sectionDomId(section: HelpSection): string {
  return domId("section", section.id);
}

function articleDomId(article: HelpArticle): string {
  return domId("article", article.id);
}

type PdfSection = {
  section: HelpSection;
  articles: HelpArticle[];
};

function draftBadge(isPublished: boolean): string {
  return isPublished ? "" : `<span class="draft">Rascunho</span>`;
}

function articleHtml(article: HelpArticle, sectionIndex: number, articleIndex: number): string {
  const richHtml = article.contentHtml || richContentToHtml(article.contentJson as ManeuverRichContent);
  const content = sanitizeRichHtml(richHtml) || plainTextToHtml(article.plainText);
  const tags = article.tags.length
    ? `<div class="tags">${article.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>`
    : "";
  const articleNumber = `${sectionIndex + 1}.${articleIndex + 1}`;

  return `
    <article class="article" id="${esc(articleDomId(article))}">
      <header class="article-header">
        <p class="article-number">Artigo ${articleNumber}</p>
        <h3>${esc(article.title)} ${draftBadge(article.isPublished)}</h3>
        ${article.summary ? `<p class="summary">${esc(article.summary)}</p>` : ""}
        ${tags}
      </header>
      <div class="content">${content}</div>
    </article>`;
}

function sectionCoverHtml(section: HelpSection, articles: HelpArticle[], sectionIndex: number): string {
  const articleLabel = articles.length === 1 ? "1 artigo" : `${articles.length} artigos`;
  return `
    <section class="section-cover" id="${esc(sectionDomId(section))}">
      <div class="section-cover-rule"></div>
      <p class="section-number">Secao ${sectionIndex + 1}</p>
      <h2>${esc(section.title)} ${draftBadge(section.isPublished)}</h2>
      ${section.description ? `<p class="section-description">${esc(section.description)}</p>` : ""}
      <div class="section-cover-meta">
        <span>${esc(articleLabel)}</span>
        <span>Consulta operacional</span>
      </div>
    </section>`;
}

function sectionHtml(pdfSection: PdfSection, sectionIndex: number): string {
  const { section, articles } = pdfSection;
  return `
    <div class="section-block">
      ${sectionCoverHtml(section, articles, sectionIndex)}
      <section class="section-articles" aria-label="${esc(section.title)}">
        ${
          articles.length
            ? articles.map((article, articleIndex) => articleHtml(article, sectionIndex, articleIndex)).join("")
            : `<p class="empty">Nenhum artigo nesta secao.</p>`
        }
      </section>
    </div>`;
}

function tocHtml(sections: PdfSection[]): string {
  return sections
    .map(({ section, articles }, sectionIndex) => {
      const articleList = articles.length
        ? `<ol class="toc-articles">${articles.map((article, articleIndex) => `
            <li>
              <a href="#${esc(articleDomId(article))}">
                <span>${sectionIndex + 1}.${articleIndex + 1}</span>
                ${esc(article.title)}
              </a>
            </li>`).join("")}</ol>`
        : "";
      return `
        <li>
          <a class="toc-section-link" href="#${esc(sectionDomId(section))}">
            <span class="toc-number">${sectionIndex + 1}</span>
            <span class="toc-title">${esc(section.title)}</span>
            <span class="toc-count">${articles.length} art.</span>
          </a>
          ${articleList}
        </li>`;
    })
    .join("");
}

export function openHelpCatalogPdf(
  catalog: HelpCatalog,
  options: { title?: string; audience?: HelpCenterAudience; includeDrafts?: boolean; brand?: PdfBrand } = {},
): void {
  const title = options.title ?? (options.audience === "instructor" ? "Manual do instrutor" : "Central de ajuda");
  const logoSrc = getPdfBrandLogoSrc(options.brand);
  const schoolName = options.brand?.schoolName || "Escola de Aviacao";
  const primary = options.brand?.primaryColor || "#0f766e";
  const accent = options.brand?.accentColor || "#0369a1";
  const sections = sortByOrderThenTitle(catalog.sections).map((section) => ({
    section,
    articles: sortByOrderThenTitle(catalog.articles.filter((article) => article.sectionId === section.id)),
  }));
  const articleCount = sections.reduce((total, section) => total + section.articles.length, 0);

  const body = sections.map((section, sectionIndex) => sectionHtml(section, sectionIndex)).join("");

  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f8fafc;
      color: #0f172a;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 0 28px 48px;
    }
    .cover-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 54px 0 42px;
      break-after: page;
      page-break-after: always;
    }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 22px; }
    .brand-name { color: #475569; font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .logo { max-height: 74px; max-width: 210px; object-fit: contain; }
    .cover-mark { width: 92px; height: 8px; border-radius: 999px; background: ${esc(primary)}; }
    .cover-title { max-width: 760px; }
    .cover-subtitle { margin-top: 16px; max-width: 620px; color: #475569; font-size: 17px; }
    .cover-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
    .cover-meta span {
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #fff;
      padding: 6px 12px;
      color: #334155;
      font-size: 12px;
      font-weight: 700;
    }
    .eyebrow {
      margin: 0 0 12px;
      color: ${esc(primary)};
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h1, h2, h3, h4 { color: #0f172a; line-height: 1.2; }
    h1 { margin: 0; font-size: 52px; letter-spacing: 0; }
    .toc-page {
      min-height: 100vh;
      padding: 42px 0;
      break-after: page;
      page-break-after: always;
    }
    .toc-eyebrow { margin: 0 0 8px; color: ${esc(primary)}; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
    .toc-page h2 { margin: 0 0 10px; font-size: 34px; }
    .toc-intro { margin: 0 0 22px; color: #64748b; }
    .toc-list { list-style: none; margin: 0; padding: 0; }
    .toc-list > li {
      margin: 0 0 14px;
      padding: 0 0 14px;
      border-bottom: 1px solid #e2e8f0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .toc-section-link,
    .toc-articles a {
      color: inherit;
      text-decoration: none;
    }
    .toc-section-link {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: baseline;
      color: #0f172a;
      font-weight: 800;
    }
    .toc-number {
      display: inline-flex;
      width: 26px;
      height: 26px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: ${esc(primary)};
      color: #fff;
      font-size: 12px;
    }
    .toc-title { font-size: 16px; }
    .toc-count { color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .toc-articles {
      list-style: none;
      margin: 7px 0 0 44px;
      padding: 0;
      color: #475569;
      font-size: 12px;
    }
    .toc-articles li { margin: 2px 0; }
    .toc-articles span { display: inline-block; min-width: 32px; color: ${esc(primary)}; font-weight: 800; }
    .section-block {
      break-before: page;
      page-break-before: always;
    }
    .section-cover {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 34px 0;
      break-after: page;
      page-break-after: always;
    }
    .section-cover-rule { width: 74px; height: 7px; margin-bottom: 26px; border-radius: 999px; background: ${esc(accent)}; }
    .section-number, .article-number {
      margin: 0 0 5px;
      color: ${esc(primary)};
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .section-cover h2 { margin: 0; max-width: 760px; font-size: 42px; letter-spacing: 0; }
    .section-description { margin: 16px 0 0; max-width: 680px; color: #475569; font-size: 17px; }
    .section-cover-meta { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 30px; }
    .section-cover-meta span {
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 5px 11px;
      color: #334155;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .section-articles { padding: 0 0 18px; }
    .article {
      position: relative;
      margin: 0 0 18px;
      padding: 0 0 18px 18px;
      border-bottom: 1px solid #e2e8f0;
      border-left: 4px solid #e2e8f0;
    }
    .article:last-child { border-bottom: 0; }
    .article-header {
      padding-top: 2px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .article-header h3 {
      margin: 0;
      font-size: 21px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .summary { margin: 7px 0 0; color: #475569; }
    .draft {
      display: inline-block;
      margin-left: 8px;
      border: 1px solid #f59e0b;
      border-radius: 999px;
      padding: 2px 8px;
      color: #92400e;
      background: #fffbeb;
      font-size: 10px;
      vertical-align: middle;
    }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
    .tags span {
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 2px 8px;
      color: #475569;
      font-size: 11px;
    }
    .content { margin-top: 14px; color: #1e293b; }
    .content p { margin: 0 0 10px; }
    .content h1, .content h2, .content h3, .content h4 {
      margin: 16px 0 8px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .content ul, .content ol { margin: 0 0 10px 22px; padding: 0; }
    .content li { margin: 0 0 4px; }
    .content blockquote { border-left: 3px solid ${esc(primary)}; margin: 10px 0; padding-left: 12px; color: #334155; }
    .content code { border-radius: 4px; background: #e2e8f0; padding: 1px 4px; }
    .content pre {
      overflow: auto;
      border-radius: 8px;
      background: #0f172a;
      color: #e2e8f0;
      padding: 12px;
      white-space: pre-wrap;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .content img {
      display: block;
      max-width: 88%;
      max-height: 300px;
      width: auto;
      margin: 12px auto;
      object-fit: contain;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    .content th, .content td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    .content th { background: #f1f5f9; }
    .content table,
    .content blockquote {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .content tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .empty { padding: 18px 20px; color: #64748b; }
    @media print {
      body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .container { max-width: none; padding: 0; }
      .cover-page,
      .toc-page,
      .section-cover { min-height: calc(100vh - 2.8cm); padding: 0; }
      .section-block:first-of-type { break-before: auto; page-break-before: auto; }
      .article { orphans: 3; widows: 3; }
      @page { size: A4; margin: 1.35cm 1.25cm; }
    }
  </style>
</head>
<body>
  <main class="container">
    <section class="cover-page">
      <div class="brand-row">
        <div>
          <div class="cover-mark"></div>
          <p class="brand-name">${esc(schoolName)}</p>
        </div>
        ${logoSrc ? `<img src="${esc(logoSrc)}" class="logo" alt="" />` : ""}
      </div>
      <div class="cover-title">
        <p class="eyebrow">Exportacao em PDF</p>
        <h1>${esc(title)}</h1>
        <p class="cover-subtitle">Conteudo organizado para consulta rapida, preservando secoes e artigos do manual.</p>
        <div class="cover-meta">
          <span>${sections.length} secoes</span>
          <span>${articleCount} artigos</span>
          <span>Gerado em ${esc(generatedAt)}</span>
          ${options.includeDrafts ? "<span>Inclui rascunhos</span>" : ""}
        </div>
      </div>
      <p class="brand-name">${esc(schoolName)}</p>
    </section>
    <nav class="toc-page" aria-label="Sumario">
      <p class="toc-eyebrow">Sumario clicavel</p>
      <h2>Indice</h2>
      <p class="toc-intro">Clique em uma secao ou artigo para navegar diretamente no PDF.</p>
      <ol class="toc-list">${tocHtml(sections)}</ol>
    </nav>
    ${body || `<p class="empty">Nenhum conteudo disponivel.</p>`}
  </main>
  <script>
    async function waitForImages() {
      const images = Array.from(document.images);
      await Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      })));
    }
    window.addEventListener("load", async function () {
      await waitForImages();
      setTimeout(function () {
        window.focus();
        window.print();
      }, 450);
    });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
