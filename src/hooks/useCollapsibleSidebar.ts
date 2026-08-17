import { useCallback, useState } from "react";

const SIDEBAR_EASE = "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";

/** Classes de transição compartilhadas pelo rail / aside. */
export const sidebarMotionClass = SIDEBAR_EASE;

/** Fade + slide dos rótulos ao expandir / recolher. */
export function sidebarRevealClass(compact: boolean, expandedExtra = "min-w-0") {
  return compact
    ? `pointer-events-none max-h-0 max-w-0 -translate-x-1 overflow-hidden whitespace-nowrap opacity-0 transition-all ${SIDEBAR_EASE}`
    : `${expandedExtra} max-h-8 max-w-[14rem] translate-x-0 overflow-hidden whitespace-nowrap opacity-100 transition-all ${SIDEBAR_EASE}`;
}

/** Layout do botão de aba: coluna (ícone + nome) no rail recolhido. */
export function sidebarCompactItemClass(compact: boolean, expandedExtra = "gap-3 px-3 py-2 text-left") {
  return compact ? "flex-col justify-center gap-0.5 px-1 py-1.5 text-center" : expandedExtra;
}

/** Ícone um pouco menor no rail recolhido. */
export function sidebarCompactIconClass(compact: boolean, extra = "") {
  return `${extra} ${compact ? "[&_svg]:h-4 [&_svg]:w-4" : ""}`.trim();
}

/** Nome da aba abaixo do ícone, só no menu fechado. */
export function sidebarCompactLabelClass(compact: boolean) {
  return compact
    ? "mt-0.5 w-full px-0.5 text-center text-[9px] font-medium leading-tight line-clamp-2"
    : "hidden";
}

/** Label de categoria das abas: visível no menu aberto e fechado. */
export function sidebarGroupLabelClass(compact: boolean) {
  return compact
    ? "school-accent-text px-0.5 pb-1 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide"
    : "school-accent-text px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest";
}

/** Scroll do nav: esconde a barra quando o menu está fechado. */
export function sidebarNavScrollClass(compact: boolean) {
  return compact
    ? "overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    : "overflow-y-auto";
}

/**
 * Menu lateral recolhível no desktop:
 * - começa recolhido
 * - só abre / fecha pelo botão de fixar
 */
export function useCollapsibleSidebar(initialCollapsed = true) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);

  const widthClass = collapsed ? "w-24" : "w-64";

  return {
    /** Preferência fixa do botão (recolhido / expandido). */
    collapsed,
    /** Estado visual compacto (recolhido). */
    compact: collapsed,
    /** Aberto visualmente (fixado). */
    expanded: !collapsed,
    toggleCollapsed,
    /** Largura reservada no layout. */
    railWidthClass: widthClass,
    /** Largura visual do painel. */
    panelWidthClass: widthClass,
  };
}
