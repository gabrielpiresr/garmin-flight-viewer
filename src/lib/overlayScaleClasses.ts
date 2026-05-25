/**
 * Classes de escala para widgets sobre o vídeo.
 * Referência ~1920×1080; tudo relativo a `.video-overlay-root` (container-type: size).
 * Tipografia usa `em` (font-size do root em cqh).
 */

export const ovTextXs = "text-[0.64em] leading-none";
export const ovTextSm = "text-[0.75em] leading-tight";
export const ovTextMd = "text-[0.875em]";
export const ovTextLg = "text-[1.25em] leading-none";
export const ovTextXl = "text-[1.5em] leading-none";

export const ovPadXs = "px-[0.35em] py-[0.2em]";
export const ovPadSm = "px-[0.5em] py-[0.35em]";
export const ovPadMd = "px-[0.65em] py-[0.45em]";
export const ovGapSm = "gap-[0.35em]";
export const ovGapMd = "gap-[0.5em]";

export const ovInsetL = "left-[1.5%]";
export const ovInsetTop = "top-[11cqh]";
export const ovBottomCharts = "bottom-[1.8cqh]";
export const ovBottomHdg = "bottom-[11cqh]";

/** HUD — mapa e gráficos canto esquerdo */
export const ovHudMapTop = "top-[1.5%]";
export const ovHudMapOpacity = "opacity-80";
export const ovHudChartsBottom = "bottom-0";
export const ovTextHudLegend = "text-[0.82em] leading-none";
export const ovChartPanelHud =
  "flex min-h-0 flex-col rounded-md bg-black/40 p-[0.4em] pb-[0.15em] shadow-[0_3px_14px_rgba(0,0,0,0.55)]";

export const ovTapeSpeed = "w-[5cqw] min-w-[3rem] max-w-[6rem]";
export const ovTapeAltEmbed = "w-[4.2cqw] min-w-[3.25rem]";
export const ovTapeAltCluster = "w-[10.4cqw] min-w-[7rem] max-w-[12.5rem]";
export const ovTapeVsi = "w-[2.7cqw] min-w-[2.5rem]";

/** Mapa HUD maior; min-h-0 para encolher com o player */
export const ovMapHud = "h-[26cqh] min-h-0 max-h-[12rem]";
export const ovMapHudWithCharts = "h-[20cqh] min-h-0 max-h-[9.5rem]";
export const ovMapStack = "h-[19cqh] min-h-0 max-h-[9rem]";
export const ovMapVert = "h-[20cqh] min-h-0 max-h-[7rem]";

/** HUD 16:9 — +25% altura/largura dos painéis de gráfico */
export const ovChartHud = "h-[21.25cqh] min-h-0 max-h-[8.125rem]";
/** Compacto 16:9 — +50% (empilhados quando há dois) */
export const ovChartCompact = "h-[24cqh] min-h-0 max-h-[9rem]";
/** 9:16 — +30% altura dos gráficos */
export const ovChartVert = "h-[15.6cqh] min-h-0 max-h-[8.45rem]";

export const ovStackW = "w-[min(42%,18.5cqw)] max-w-[46%]";
export const ovHudMapW = "w-[min(28%,15cqw)]";
export const ovHudChartsRow2 = "w-[min(30%,30cqw)]";
export const ovHudChartsRow1 = "w-[min(15%,15cqw)]";
/** Coluna compacta: gráficos empilhados (−30% largura vs anterior) */
export const ovCompactChartsCol = "w-[min(23.1%,19.425cqw)]";
/** Espaço triplicado entre dois gráficos compactos empilhados */
export const ovGapCompactStack = "gap-[1.05em]";
/** 9:16 — esquerda; altura −60% vs 50cqh, próximo ao topo */
export const ovMapVertTop = "top-[5cqh]";
export const ovMapVertPanel =
  "w-[48%] h-[20cqh] max-h-[20%] rounded-xl overflow-hidden bg-slate-900/90";

export const ovHorizonArc = "h-[38cqh] w-[58%] max-w-[58%] rounded-full border-t-[0.14em] border-white/85";
export const ovCrosshairLg = "w-[5cqw] max-w-[6rem]";
export const ovCrosshairSm = "w-[3.3cqw] max-w-[4rem]";

export const ovPointerBorderL = "border-y-[0.35em] border-y-transparent border-r-[0.4em] border-r-black/85";
export const ovPointerBorderR = "border-y-[0.35em] border-y-transparent border-l-[0.4em] border-l-black/85";

export const ovBrandLogo = "h-[1.25em] w-[1.25em]";
