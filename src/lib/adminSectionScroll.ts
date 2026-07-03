// Rolagem até uma seção da página após navegação da busca global.
// O alvo é resolvido por texto de título (h1–h4 visíveis, sem acento/caixa) ou
// por atributo explícito data-search-anchor. Faz polling porque as abas do
// admin são lazy e o conteúdo pode demorar a montar.

import { normalizeSearchText } from "./adminSearchIndex";

const POLL_INTERVAL_MS = 200;
const TIMEOUT_MS = 8000;

let activeToken = 0;

export function scrollToAdminSection(target: string): void {
  const wanted = normalizeSearchText(target);
  if (!wanted) return;
  const token = ++activeToken;
  const deadline = Date.now() + TIMEOUT_MS;

  const attempt = () => {
    if (token !== activeToken) return;
    const element = findVisibleTarget(wanted);
    if (element) {
      revealElement(element);
      return;
    }
    if (Date.now() < deadline) window.setTimeout(attempt, POLL_INTERVAL_MS);
  };
  window.setTimeout(attempt, POLL_INTERVAL_MS);
}

function isVisible(element: HTMLElement): boolean {
  return element.offsetParent !== null;
}

function findVisibleTarget(wanted: string): HTMLElement | null {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-search-anchor]"))) {
    if (isVisible(element) && normalizeSearchText(element.dataset.searchAnchor ?? "") === wanted) {
      return element;
    }
  }
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("main h1, main h2, main h3, main h4"))) {
    if (isVisible(element) && normalizeSearchText(element.textContent ?? "").includes(wanted)) {
      return element;
    }
  }
  return null;
}

function revealElement(element: HTMLElement): void {
  const card =
    element.closest<HTMLElement>("section, article, [class*='rounded-xl'], [class*='rounded-2xl']") ?? element;
  card.scrollIntoView({ behavior: "smooth", block: "start" });

  // Destaque temporário para o admin achar a seção de bater o olho.
  const previousBoxShadow = card.style.boxShadow;
  const previousTransition = card.style.transition;
  card.style.transition = "box-shadow 0.3s ease";
  card.style.boxShadow = "0 0 0 2px rgba(56, 189, 248, 0.7)";
  window.setTimeout(() => {
    card.style.boxShadow = previousBoxShadow;
    window.setTimeout(() => {
      card.style.transition = previousTransition;
    }, 400);
  }, 1800);
}
