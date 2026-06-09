import type { OnboardingStep } from "../types/onboarding";
import { getOnboardingImageUrl } from "./onboardingDb";
import { richContentToHtml } from "./maneuverContent";

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

export function openOnboardingPdf(steps: OnboardingStep[]): void {
  if (steps.length === 0) return;

  const pages = steps
    .map((step, idx) => {
      const imageUrl = step.imageFileId ? getOnboardingImageUrl(step.imageFileId) : "";
      const richHtml = step.descriptionHtml || richContentToHtml(step.descriptionJson);
      const descriptionHtml = sanitizeRichHtml(richHtml) || `<p>${esc(step.description)}</p>`;
      return `
      <section class="page">
        <header class="page-header">
          <span class="badge">Etapa ${idx + 1} de ${steps.length}</span>
          <h1>${esc(step.title)}</h1>
          ${step.subtitle ? `<p class="subtitle">${esc(step.subtitle)}</p>` : ""}
        </header>
        ${imageUrl ? `<div class="image-wrap"><img src="${esc(imageUrl)}" alt="" /></div>` : ""}
        <article class="content">${descriptionHtml}</article>
      </section>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Onboarding</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      line-height: 1.6;
      font-size: 14px;
    }
    .container {
      max-width: 1120px;
      margin: 0 auto;
      padding: 20px;
    }
    .page {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .page + .page {
      page-break-before: always;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0369a1;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      border-radius: 999px;
      padding: 4px 10px;
      margin-bottom: 10px;
    }
    .page-header h1 {
      font-size: 22px;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .subtitle {
      color: #475569;
      margin-bottom: 10px;
    }
    .image-wrap {
      margin: 10px 0 12px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      background: #f8fafc;
      max-height: 280px;
    }
    .image-wrap img {
      display: block;
      max-width: 92%;
      width: auto;
      max-height: 280px;
      margin: 0 auto;
      object-fit: contain;
    }
    .content {
      color: #1e293b;
    }
    .content p { margin: 0 0 10px; }
    .content h1, .content h2, .content h3, .content h4 {
      margin: 14px 0 8px;
      color: #0f172a;
    }
    .content strong { font-weight: 700; }
    .content em { font-style: italic; }
    .content u { text-decoration: underline; }
    .content s { text-decoration: line-through; }
    .content ul, .content ol {
      margin: 0 0 10px 20px;
    }
    .content img {
      display: block;
      max-width: 88%;
      width: auto;
      max-height: 240px;
      margin: 10px auto;
      object-fit: contain;
    }
    .content blockquote {
      border-left: 3px solid #0ea5e9;
      padding-left: 10px;
      color: #334155;
      margin: 8px 0;
    }
    @media print {
      body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .container { max-width: none; padding: 0; }
      .page { border-radius: 0; margin: 0; border: none; }
      .image-wrap { max-height: 250px; }
      .image-wrap img { max-width: 90%; max-height: 250px; }
      .content img { max-width: 84%; max-height: 220px; }
      @page { size: landscape; margin: 0.9cm; }
    }
  </style>
</head>
<body>
  <main class="container">
    ${pages}
  </main>
  <script>
    async function waitForImages() {
      const images = Array.from(document.images);
      if (!images.length) return;
      await Promise.all(
        images.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
              }),
        ),
      );
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
