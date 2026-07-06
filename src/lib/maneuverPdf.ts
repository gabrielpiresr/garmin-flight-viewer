import type {
  ManeuverArticle,
  ManeuverCatalog,
  ManeuverRichContent,
  ManeuverSection,
  ManeuverSubsection,
} from "../types/maneuver";
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

function articleHtml(article: ManeuverArticle, articleIndex: number): string {
  const richHtml = article.contentHtml || richContentToHtml(article.contentJson as ManeuverRichContent);
  const content = sanitizeRichHtml(richHtml) || plainTextToHtml(article.plainText);
  const draftBadge = article.isPublished ? "" : `<span class="draft">Rascunho</span>`;
  const tags = article.tags.length
    ? `<div class="tags">${article.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>`
    : "";

  return `
    <article class="article">
      <header class="article-header">
        <p class="article-number">Artigo ${articleIndex + 1}</p>
        <h4>${esc(article.title)} ${draftBadge}</h4>
        ${article.summary ? `<p class="summary">${esc(article.summary)}</p>` : ""}
        ${tags}
      </header>
      <div class="content">${content}</div>
    </article>`;
}

function subsectionHtml(subsection: ManeuverSubsection, articles: ManeuverArticle[], startIndex: number): string {
  if (articles.length === 0) return "";
  return `
    <section class="subsection">
      <header class="subsection-header">
        <p class="subsection-number">Subsecao</p>
        <h3>${esc(subsection.title)}</h3>
        ${subsection.description ? `<p>${esc(subsection.description)}</p>` : ""}
      </header>
      ${articles.map((article, index) => articleHtml(article, startIndex + index)).join("")}
    </section>`;
}

function sectionHtml(
  section: ManeuverSection,
  subsections: ManeuverSubsection[],
  articles: ManeuverArticle[],
  sectionIndex: number,
): string {
  const sortedSubsections = [...subsections].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "pt-BR"));
  const sortedArticles = [...articles].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "pt-BR"));
  const looseArticles = sortedArticles.filter((article) => !article.subsectionId);
  let articleIndex = 0;
  const looseHtml = looseArticles
    .map((article) => articleHtml(article, articleIndex++))
    .join("");
  const groupedHtml = sortedSubsections
    .map((subsection) => {
      const groupArticles = sortedArticles.filter((article) => article.subsectionId === subsection.id);
      const html = subsectionHtml(subsection, groupArticles, articleIndex);
      articleIndex += groupArticles.length;
      return html;
    })
    .join("");

  return `
    <section class="section">
      <header class="section-header">
        <p class="section-number">Secao ${sectionIndex + 1}</p>
        <h2>${esc(section.title)}</h2>
        ${section.description ? `<p>${esc(section.description)}</p>` : ""}
      </header>
      ${looseHtml}${groupedHtml || ""}
      ${sortedArticles.length ? "" : `<p class="empty">Nenhum artigo nesta secao.</p>`}
    </section>`;
}

export function openManeuverCatalogPdf(
  catalog: ManeuverCatalog,
  options: { title?: string; includeDrafts?: boolean; brand?: PdfBrand } = {},
): void {
  const title = options.title ?? "Manual de manobras";
  const brand = options.brand;
  const logoSrc = getPdfBrandLogoSrc(brand);
  const schoolName = brand?.schoolName || "Escola de Aviacao";
  const primary = brand?.primaryColor || "#0369a1";
  const accent = brand?.accentColor || "#0f766e";
  const sections = [...catalog.sections].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "pt-BR"));
  const articleCount = catalog.articles.length;

  const body = sections
    .map((section, sectionIndex) => {
      const subsections = catalog.subsections.filter((subsection) => subsection.sectionId === section.id);
      const articles = catalog.articles.filter((article) => article.sectionId === section.id);
      return sectionHtml(section, subsections, articles, sectionIndex);
    })
    .join("");

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
    .container { max-width: 960px; margin: 0 auto; padding: 0 24px 40px; }
    .cover-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 54px 0 42px;
      page-break-after: always;
    }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 22px; }
    .brand-name { color: #475569; font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .logo { max-height: 74px; max-width: 210px; object-fit: contain; }
    .cover-mark { width: 92px; height: 8px; border-radius: 999px; background: linear-gradient(90deg, ${esc(primary)}, ${esc(accent)}); }
    .cover-title { max-width: 760px; }
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
    .toc {
      margin: 0 0 22px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #fff;
      padding: 16px 18px;
      break-inside: avoid;
    }
    .toc h2 { margin: 0 0 8px; font-size: 14px; }
    .toc ol { margin: 0; padding-left: 22px; color: #334155; }
    .toc li { margin: 4px 0; }
    .section {
      margin: 0 0 18px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #fff;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section + .section { page-break-before: always; }
    .section-header {
      border-bottom: 1px solid #e2e8f0;
      background: #f0f9ff;
      padding: 18px 20px;
    }
    .section-number, .subsection-number, .article-number {
      margin: 0 0 5px;
      color: ${esc(primary)};
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .section-header h2 { margin: 0; font-size: 24px; }
    .section-header p:not(.section-number), .subsection-header p:not(.subsection-number) { margin: 6px 0 0; color: #475569; }
    .subsection { border-top: 1px solid #e2e8f0; }
    .subsection-header { background: #f8fafc; padding: 14px 20px; border-bottom: 1px solid #e2e8f0; }
    .subsection-header h3 { margin: 0; font-size: 18px; }
    .article {
      padding: 18px 20px;
      border-bottom: 1px solid #e2e8f0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .article:last-child { border-bottom: 0; }
    .article-header h4 { margin: 0; font-size: 17px; }
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
    .content h1, .content h2, .content h3, .content h4 { margin: 16px 0 8px; }
    .content ul, .content ol { margin: 0 0 10px 22px; padding: 0; }
    .content blockquote { border-left: 3px solid ${esc(primary)}; margin: 10px 0; padding-left: 12px; color: #334155; }
    .content code { border-radius: 4px; background: #e2e8f0; padding: 1px 4px; }
    .content pre { overflow: auto; border-radius: 8px; background: #0f172a; color: #e2e8f0; padding: 12px; }
    .content img { display: block; max-width: 88%; max-height: 280px; width: auto; margin: 12px auto; object-fit: contain; }
    .content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    .content th, .content td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    .content th { background: #f1f5f9; }
    .empty { padding: 18px 20px; color: #64748b; }
    @media print {
      body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .container { max-width: none; padding: 0; }
      .cover-page { min-height: calc(100vh - 2.4cm); padding: 0; }
      .section { border-radius: 0; }
      @page { size: A4; margin: 1.2cm; }
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
        <p class="eyebrow">Material de estudo</p>
        <h1>${esc(title)}</h1>
        <p class="cover-subtitle">Conteudo organizado por secoes, subsecoes e artigos para consulta operacional.</p>
        <div class="cover-meta">
          <span>${sections.length} secoes</span>
          <span>${articleCount} artigos</span>
          <span>Gerado em ${esc(generatedAt)}</span>
          ${options.includeDrafts ? "<span>Inclui rascunhos</span>" : ""}
        </div>
      </div>
      <p class="brand-name">${esc(schoolName)}</p>
    </section>
    <nav class="toc">
      <h2>Indice</h2>
      <ol>${sections.map((section) => `<li>${esc(section.title)}</li>`).join("")}</ol>
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
