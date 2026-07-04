import { useCallback, useRef } from "react";

/**
 * Deslize horizontal (rolagem pro lado) para dar o feedback de navegação de
 * data/semana na escala. É IMPERATIVO: a animação só roda quando `slide()` é
 * chamado — deve ser disparado apenas pelas setas de navegação, nunca ao
 * selecionar um dia no cabeçalho.
 *
 * `slide("forward")` (avançar) faz o conteúdo entrar deslizando da direita;
 * `slide("back")` (voltar), da esquerda. Não remonta os filhos (preserva estado
 * interno do board) e respeita `prefers-reduced-motion`.
 */
export function useDirectionalSlide() {
  const ref = useRef<HTMLDivElement>(null);

  const slide = useCallback((direction: "forward" | "back") => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const forward = direction === "forward";
    el.animate(
      [
        { transform: `translateX(${forward ? "36px" : "-36px"})`, opacity: 0.35 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, []);

  return { ref, slide };
}
