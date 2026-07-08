// Referência cruzada entre artigos da Central de Ajuda / Manual do Instrutor.
// Codificada como um href interno (começa com "/", que passa no validate do
// Link do TipTap — isSafeUrl). O viewer intercepta o clique e navega em memória,
// sem reload; se não for interceptada, cai numa rota inexistente (fallback raro).

const PREFIX = "/artigo-ajuda/";

export function buildHelpArticleHref(articleId: string): string {
  return `${PREFIX}${encodeURIComponent(articleId)}`;
}

export function parseHelpArticleHref(href: string | null | undefined): string | null {
  if (!href) return null;
  let path = href;
  if (/^https?:\/\//i.test(href)) {
    try {
      path = new URL(href).pathname;
    } catch {
      return null;
    }
  }
  if (!path.startsWith(PREFIX)) return null;
  const id = decodeURIComponent(path.slice(PREFIX.length)).trim();
  return id || null;
}
