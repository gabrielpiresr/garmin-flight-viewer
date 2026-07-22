import { useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_EASE = "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";
const LEAVE_DELAY_MS = 140;

/** Classes de transição compartilhadas pelo rail / aside. */
export const sidebarMotionClass = SIDEBAR_EASE;

/** Fade + slide dos rótulos ao expandir / recolher. */
export function sidebarRevealClass(compact: boolean, expandedExtra = "min-w-0") {
  return compact
    ? `pointer-events-none max-w-0 -translate-x-1 overflow-hidden whitespace-nowrap opacity-0 transition-all ${SIDEBAR_EASE}`
    : `${expandedExtra} max-w-[14rem] translate-x-0 overflow-hidden whitespace-nowrap opacity-100 transition-all ${SIDEBAR_EASE}`;
}

/**
 * Menu lateral recolhível no desktop:
 * - `collapsed` = preferência fixa (botão)
 * - hover enquanto recolhido faz peek temporário (abre / fecha)
 */
export function useCollapsibleSidebar(initialCollapsed = false) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [peeking, setPeeking] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current != null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  const expanded = !collapsed || peeking;
  const compact = !expanded;
  const isPeeking = collapsed && peeking;

  const onSidebarMouseEnter = useCallback(() => {
    clearLeaveTimer();
    if (collapsed) setPeeking(true);
  }, [clearLeaveTimer, collapsed]);

  const onSidebarMouseLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setPeeking(false);
      leaveTimerRef.current = null;
    }, LEAVE_DELAY_MS);
  }, [clearLeaveTimer]);

  const toggleCollapsed = useCallback(() => {
    clearLeaveTimer();
    setPeeking(false);
    setCollapsed((value) => !value);
  }, [clearLeaveTimer]);

  return {
    /** Preferência fixa do botão (recolhido / expandido). */
    collapsed,
    /** Estado visual compacto (recolhido e sem peek). */
    compact,
    /** Aberto visualmente (fixado ou peek por hover). */
    expanded,
    /** Peek por hover enquanto a preferência está recolhida. */
    isPeeking,
    toggleCollapsed,
    onSidebarMouseEnter,
    onSidebarMouseLeave,
    /** Largura reservada no layout (não muda no peek). */
    railWidthClass: collapsed ? "w-20" : "w-64",
    /** Largura visual do painel. */
    panelWidthClass: expanded ? "w-64" : "w-20",
  };
}
