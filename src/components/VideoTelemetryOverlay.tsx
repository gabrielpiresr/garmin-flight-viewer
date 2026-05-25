import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  altitudeMToFt,
  formatVerticalSpeedFpm,
  formatVideoAltitude,
  formatVideoHeading,
  formatVideoSpeed,
  speedMpsToKt,
  type AirspeedArcLimits,
  type VideoTelemetryPoint,
  type VideoTelemetryWidget,
} from "../lib/videoTelemetry";
import {
  ovBottomCharts,
  ovBottomHdg,
  ovBrandLogo,
  ovChartCompact,
  ovChartHud,
  ovChartVert,
  ovCrosshairLg,
  ovCrosshairSm,
  ovGapMd,
  ovGapSm,
  ovHorizonArc,
  ovChartPanelHud,
  ovHudChartsBottom,
  ovHudChartsRow1,
  ovHudChartsRow2,
  ovHudMapOpacity,
  ovHudMapTop,
  ovHudMapW,
  ovInsetL,
  ovInsetTop,
  ovTextHudLegend,
  ovMapHud,
  ovMapHudWithCharts,
  ovMapStack,
  ovMapVert,
  ovPadMd,
  ovPadSm,
  ovPadXs,
  ovPointerBorderL,
  ovPointerBorderR,
  ovStackW,
  ovTapeAltCluster,
  ovTapeAltEmbed,
  ovTapeSpeed,
  ovTapeVsi,
  ovTextLg,
  ovTextMd,
  ovTextSm,
  ovTextXl,
  ovTextXs,
} from "../lib/overlayScaleClasses";

export type TelemetryOverlayStyle = "compact" | "hud";

export type TelemetryOverlayProps = {
  airspeedArcs: AirspeedArcLimits | null;
  altitudeChartRef: RefObject<HTMLCanvasElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  currentPoint: VideoTelemetryPoint | null;
  enabledWidgets: VideoTelemetryWidget[];
  speedChartRef: RefObject<HTMLCanvasElement | null>;
  verticalSpeedFpm: number | null;
};

type TapeKind = "speed" | "altitude";

const VSI_SCALE_MIN = -10;
const VSI_SCALE_MAX = 10;
const SPEED_ARC_OPACITY = 0.55;
const HUD_TAPE_BG = "bg-slate-900/42";
/** HUD tapes: each column centered in its lateral third (not screen center). */
const HUD_TAPE_HEIGHT = "h-[56%]";
const HUD_TAPE_ANCHOR = "absolute top-1/2 -translate-x-1/2 -translate-y-1/2";
const HUD_CHARTS_BOTTOM = ovBottomCharts;

function tapeSpan(kind: TapeKind): number {
  if (kind === "speed") return 60;
  return 600;
}

function arcLimitValues(arcs: AirspeedArcLimits): number[] {
  return [arcs.whiteMin, arcs.whiteMax, arcs.greenMin, arcs.greenMax, arcs.yellowMin, arcs.yellowMax, arcs.vne].filter(
    (n): n is number => n != null && Number.isFinite(n),
  );
}

function tapeRange(kind: TapeKind, value: number, arcs?: AirspeedArcLimits | null): { min: number; max: number } {
  if (kind === "speed" && arcs) {
    const limits = arcLimitValues(arcs);
    const pad = 10;
    return {
      min: Math.min(...limits, value) - pad,
      max: Math.max(...limits, arcs.vne ?? value, value) + pad,
    };
  }
  const span = tapeSpan(kind);
  return { min: value - span / 2, max: value + span / 2 };
}

function tapeStep(kind: TapeKind): number {
  return kind === "speed" ? 10 : 100;
}

function invertTapeScale(kind: TapeKind): boolean {
  return kind === "speed" || kind === "altitude";
}

function valueToTapePx(value: number, min: number, max: number, pxPerUnit: number, invert: boolean): number {
  return invert ? (max - value) * pxPerUnit : (value - min) * pxPerUnit;
}

function formatTapeValue(kind: TapeKind, value: number): string {
  if (kind === "altitude") return String(Math.round(value));
  return String(Math.round(value));
}

function formatTickLabel(kind: TapeKind, value: number): string {
  if (kind === "altitude") return String(Math.round(value / 100) * 100).slice(0, 4);
  return String(Math.round(value));
}

function arcSegments(arcs: AirspeedArcLimits, tapeMax: number): Array<{ min: number; max: number; color: string }> {
  const segments: Array<{ min: number; max: number; color: string }> = [];
  if (arcs.whiteMin != null && arcs.whiteMax != null) {
    segments.push({ min: arcs.whiteMin, max: arcs.whiteMax, color: "#f8fafc" });
  }
  if (arcs.greenMin != null && arcs.greenMax != null) {
    segments.push({ min: arcs.greenMin, max: arcs.greenMax, color: "#22c55e" });
  }
  if (arcs.yellowMin != null && arcs.yellowMax != null) {
    segments.push({ min: arcs.yellowMin, max: arcs.yellowMax, color: "#eab308" });
  }
  const redFrom = arcs.yellowMax ?? arcs.vne;
  if (redFrom != null && tapeMax > redFrom) {
    segments.push({ min: redFrom, max: tapeMax, color: "#ef4444" });
  }
  return segments;
}

function useTapeTrackHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, height };
}

function HudScrollingTape({
  kind,
  label,
  unit,
  value,
  side,
  arcs,
  embedded = false,
  inCluster = false,
}: {
  kind: TapeKind;
  label: string;
  unit: string;
  value: number;
  side: "left" | "right";
  arcs?: AirspeedArcLimits | null;
  embedded?: boolean;
  /** Speed tape inside horizontally centered HUD cluster. */
  inCluster?: boolean;
}) {
  const step = tapeStep(kind);
  const invert = invertTapeScale(kind);
  const { min, max } = tapeRange(kind, value, arcs ?? undefined);
  const span = max - min || 1;
  const ticks: number[] = [];
  const start = Math.floor(min / step) * step;
  for (let tick = start; tick <= max + step; tick += step) ticks.push(tick);

  const { ref: trackRef, height: trackHeight } = useTapeTrackHeight();
  const pxPerUnit = trackHeight > 0 ? trackHeight / span : 1;
  const offsetPx = valueToTapePx(value, min, max, pxPerUnit, invert);

  const speedArcs = kind === "speed" && arcs ? arcSegments(arcs, max) : [];

  return (
    <div
      className={
        embedded
          ? `relative flex h-full ${ovTapeAltEmbed} flex-col overflow-hidden rounded text-white ${HUD_TAPE_BG}`
          : inCluster
            ? `relative flex h-full w-full shrink-0 flex-col overflow-hidden rounded text-white ${HUD_TAPE_BG}`
            : `absolute flex ${HUD_TAPE_HEIGHT} top-1/2 -translate-y-1/2 flex-col overflow-hidden rounded text-white ${HUD_TAPE_BG} right-[16%] ${ovTapeSpeed}`
      }
    >
      <div className={`shrink-0 pt-[0.15em] text-center ${ovTextXs} font-bold text-sky-200`}>{label}</div>
      <div ref={trackRef} className="relative mx-[0.35em] min-h-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-x-0 top-1/2 will-change-transform"
          style={{ height: trackHeight > 0 ? trackHeight : undefined, transform: `translateY(-${offsetPx}px)` }}
        >
          {kind === "speed" &&
            speedArcs.map((segment) => {
              const topPx = valueToTapePx(segment.max, min, max, pxPerUnit, invert);
              const bottomPx = valueToTapePx(segment.min, min, max, pxPerUnit, invert);
              const heightPx = Math.max(2, bottomPx - topPx);
              if (heightPx <= 0) return null;
              return (
                <span
                  key={`${segment.min}-${segment.max}-${segment.color}`}
                  className="absolute right-[0.1em] w-[0.35em] rounded-sm"
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                    backgroundColor: segment.color,
                    opacity: SPEED_ARC_OPACITY,
                  }}
                />
              );
            })}
          {ticks.map((tick) => {
            const y = valueToTapePx(tick, min, max, pxPerUnit, invert);
            return (
              <div key={tick} className="absolute left-0 right-0 flex items-center" style={{ top: `${y}px` }}>
                <span className={`${kind === "altitude" ? "w-[38%]" : "w-[28%]"} text-right ${ovTextXs} tabular-nums text-white/85`}>{formatTickLabel(kind, tick)}</span>
                <span className="ml-auto mr-[0.35em] h-px w-[0.75em] bg-white/75" />
              </div>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2">
          <div className={`flex items-center ${side === "left" ? "justify-start" : "justify-end"}`}>
            <div className={`rounded bg-black/85 ${ovPadSm} ${ovTextLg} font-bold text-white`}>
              {formatTapeValue(kind, value)}
            </div>
            <span className={side === "left" ? ovPointerBorderL : ovPointerBorderR} />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/35" />
      </div>
      <div className={`shrink-0 pb-[0.15em] text-center ${ovTextXs} text-slate-400`}>{unit}</div>
    </div>
  );
}

/** VSI: fixed scale -10…+10 (×100 fpm); pointer moves, scale stays put. */
function HudVsiTape({ value, side }: { value: number; side: "left" | "right" }) {
  const displayFpm = Math.round(value / 50) * 50;
  const scaleValue = Math.max(VSI_SCALE_MIN, Math.min(VSI_SCALE_MAX, displayFpm / 100));
  const span = VSI_SCALE_MAX - VSI_SCALE_MIN;
  const toPercent = (v: number) => ((v - VSI_SCALE_MIN) / span) * 100;
  const pointerTop = toPercent(scaleValue);

  const ticks: number[] = [];
  for (let t = VSI_SCALE_MIN; t <= VSI_SCALE_MAX; t += 2) ticks.push(t);

  const { ref: trackRef } = useTapeTrackHeight();

  return (
    <div className={`flex h-full ${ovTapeVsi} flex-col overflow-hidden rounded text-white ${HUD_TAPE_BG}`}>
      <div className={`shrink-0 pt-[0.15em] text-center ${ovTextXs} font-bold text-sky-200`}>VS</div>
      <div ref={trackRef} className="relative mx-[0.2em] min-h-0 flex-1 overflow-hidden">
        {ticks.map((tick) => {
          const label = tick === 0 ? "0" : tick > 0 ? `+${tick}` : String(tick);
          return (
            <div key={tick} className="absolute left-0 right-0 flex items-center" style={{ top: `${toPercent(tick)}%` }}>
              <span className={`w-[32%] text-right ${ovTextXs} tabular-nums text-white/85`}>{label}</span>
              <span className="ml-auto mr-[0.2em] h-px w-[0.5em] bg-white/75" />
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[1] h-px bg-white/35" />
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 flex -translate-y-1/2 items-center"
          style={{ top: `${pointerTop}%` }}
        >
          <div className={`flex w-full items-center ${side === "left" ? "justify-start" : "justify-end"}`}>
            <div className={`min-w-[28%] rounded bg-black/85 ${ovPadXs} text-center ${ovTextSm} font-bold text-white`}>
              {formatVerticalSpeedFpm(displayFpm)}
            </div>
            <span className={side === "left" ? ovPointerBorderL : ovPointerBorderR} />
          </div>
        </div>
      </div>
      <div className={`shrink-0 pb-[0.15em] text-center ${ovTextXs} text-slate-400`}>fpm</div>
    </div>
  );
}

function TelemetryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className={`rounded-md border border-white/15 bg-black/65 ${ovPadMd} text-white shadow`}>
      <span className={`mr-[0.4em] ${ovTextSm} font-bold text-sky-200`}>{label}</span>
      <span className={`${ovTextMd} font-semibold`}>{value}</span>
    </div>
  );
}

export function TelemetryBrandMark({ brand, compact }: { brand: { schoolName: string; logoUrl: string }; compact: boolean }) {
  return (
    <div
      className={`flex items-center ${ovGapMd} rounded bg-black/45 ${ovPadMd} text-white ${
        compact ? `absolute ${ovInsetL} top-[2cqh]` : "absolute left-1/2 top-[2.2cqh] z-10 -translate-x-1/2"
      }`}
    >
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt="" className={`${ovBrandLogo} rounded-sm object-contain`} />
      ) : (
        <span className={`flex ${ovBrandLogo} items-center justify-center rounded-sm bg-sky-400/30 ${ovTextSm} font-black`}>FV</span>
      )}
      <span className={`${compact ? ovTextSm : ovTextMd} font-bold uppercase tracking-wide`}>{brand.schoolName}</span>
    </div>
  );
}

/** SPD no terço esquerdo; ALT+VS no terço direito — cada um centralizado na sua faixa. */
function HudSideTapeColumns({
  airspeedArcs,
  altFt,
  enabledWidgets,
  hasLeftWidgets,
  speedKt,
  verticalSpeedFpm,
}: {
  airspeedArcs: AirspeedArcLimits | null;
  altFt: number | null;
  enabledWidgets: VideoTelemetryWidget[];
  hasLeftWidgets: boolean;
  speedKt: number | null;
  verticalSpeedFpm: number | null;
}) {
  const showSpeed = enabledWidgets.includes("speed") && speedKt != null;
  const showAlt = enabledWidgets.includes("altitude") && altFt != null;
  if (!showSpeed && !showAlt) return null;

  return (
    <>
      {showSpeed && (
        <div
          className={`pointer-events-none ${HUD_TAPE_ANCHOR} ${HUD_TAPE_HEIGHT} ${ovTapeSpeed}`}
          style={{ left: hasLeftWidgets ? "27%" : "22%" }}
        >
          <HudScrollingTape
            inCluster
            kind="speed"
            label="SPD"
            unit="kt"
            value={speedKt}
            arcs={airspeedArcs}
            side="left"
          />
        </div>
      )}
      {showAlt && (
        <div
          className={`pointer-events-none ${HUD_TAPE_ANCHOR} flex ${HUD_TAPE_HEIGHT} ${ovTapeAltCluster} items-stretch gap-[0.15em]`}
          style={{ left: hasLeftWidgets ? "73%" : "78%" }}
        >
          <HudScrollingTape embedded kind="altitude" label="ALT" unit="ft" value={altFt} side="right" />
          <HudVsiTape value={verticalSpeedFpm ?? 0} side="right" />
        </div>
      )}
    </>
  );
}

/** HUD: mapa canto superior esquerdo; gráficos lado a lado no canto inferior esquerdo. */
function HudLeftCorner({
  altitudeChartRef,
  canvasRef,
  enabledWidgets,
  speedChartRef,
}: {
  altitudeChartRef: RefObject<HTMLCanvasElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  enabledWidgets: VideoTelemetryWidget[];
  speedChartRef: RefObject<HTMLCanvasElement | null>;
}) {
  const hasRoute = enabledWidgets.includes("route");
  const hasAltChart = enabledWidgets.includes("altitudeChart");
  const hasSpeedChart = enabledWidgets.includes("speedChart");
  if (!hasRoute && !hasAltChart && !hasSpeedChart) return null;

  const chartCount = (hasAltChart ? 1 : 0) + (hasSpeedChart ? 1 : 0);
  const hasCharts = chartCount > 0;
  const chartsWidthClass = chartCount === 2 ? ovHudChartsRow2 : ovHudChartsRow1;

  return (
    <>
      {hasRoute && (
        <canvas
          ref={canvasRef}
          className={`absolute ${ovInsetL} ${ovHudMapTop} ${ovHudMapW} ${ovHudMapOpacity} rounded-md ${
            hasCharts ? ovMapHudWithCharts : ovMapHud
          }`}
        />
      )}
      {(hasAltChart || hasSpeedChart) && (
        <div className={`absolute ${ovHudChartsBottom} ${ovInsetL} flex min-h-0 items-end ${ovGapSm} ${chartsWidthClass}`}>
          {hasAltChart && <ChartPanel hudCorner title="ALT FT" canvasRef={altitudeChartRef} />}
          {hasSpeedChart && <ChartPanel hudCorner title="SPD KT" canvasRef={speedChartRef} />}
        </div>
      )}
    </>
  );
}

export function CompactTelemetryOverlay(props: TelemetryOverlayProps) {
  const { altitudeChartRef, canvasRef, currentPoint, enabledWidgets, speedChartRef, verticalSpeedFpm } = props;

  return (
    <div className="absolute inset-0">
      <HudLeftCorner
        altitudeChartRef={altitudeChartRef}
        canvasRef={canvasRef}
        enabledWidgets={enabledWidgets}
        speedChartRef={speedChartRef}
      />
      <div className={`absolute ${ovHudChartsBottom} right-[1.5%] flex max-w-[48%] flex-wrap items-end justify-end ${ovGapMd}`}>
        {enabledWidgets.includes("speed") && (
          <TelemetryPill label="SPD" value={formatVideoSpeed(currentPoint?.speed ?? null)} />
        )}
        {enabledWidgets.includes("altitude") && (
          <>
            <TelemetryPill label="ALT" value={formatVideoAltitude(currentPoint?.altitude ?? null)} />
            <TelemetryPill
              label="VS"
              value={verticalSpeedFpm != null ? `${formatVerticalSpeedFpm(verticalSpeedFpm)} fpm` : "-"}
            />
          </>
        )}
        {enabledWidgets.includes("heading") && (
          <TelemetryPill label="HDG" value={formatVideoHeading(currentPoint?.heading ?? null)} />
        )}
      </div>
    </div>
  );
}

/** Layout compacto otimizado para o frame 9:16 (modo vertical). */
export type VerticalOverlayProps = Omit<TelemetryOverlayProps, "airspeedArcs">;

export function VerticalCompactOverlay({
  altitudeChartRef,
  canvasRef,
  currentPoint,
  enabledWidgets,
  speedChartRef,
  verticalSpeedFpm,
}: VerticalOverlayProps) {
  const hasRoute = enabledWidgets.includes("route");
  const hasAltChart = enabledWidgets.includes("altitudeChart");
  const hasSpeedChart = enabledWidgets.includes("speedChart");
  const hasCharts = hasAltChart || hasSpeedChart;

  return (
    <div className="absolute inset-0">
      {/* Mapa de rota — topo, largura total, acima dos gráficos (apenas se há gráficos) */}
      {hasRoute && hasCharts && (
        <canvas
          ref={canvasRef}
          className={`absolute top-[13cqh] ${ovInsetL} right-[1.5%] ${ovMapVert} w-[calc(100%-3%)] rounded-xl border border-white/15`}
        />
      )}

      {/* Coluna inferior: gráficos lado a lado + pills */}
      <div className={`absolute bottom-0 ${ovInsetL} right-[1.5%] flex flex-col ${ovGapSm}`}>
        {/* Mapa sem gráficos — ocupa o lugar dos gráficos */}
        {hasRoute && !hasCharts && (
          <canvas
            ref={canvasRef}
            className={`${ovMapVert} w-full rounded-xl border border-white/15`}
          />
        )}
        {hasCharts && (
          <div className={`flex flex-row ${ovGapSm}`}>
            {hasAltChart && (
              <div className={`flex-1 min-w-0 ${ovChartPanelHud}`}>
                <p className={`shrink-0 ${ovTextHudLegend} font-bold tracking-wide text-sky-100/95 mb-[0.2em]`}>ALT FT</p>
                <canvas ref={altitudeChartRef} className={`${ovChartVert} w-full shrink-0`} />
              </div>
            )}
            {hasSpeedChart && (
              <div className={`flex-1 min-w-0 ${ovChartPanelHud}`}>
                <p className={`shrink-0 ${ovTextHudLegend} font-bold tracking-wide text-sky-100/95 mb-[0.2em]`}>SPD KT</p>
                <canvas ref={speedChartRef} className={`${ovChartVert} w-full shrink-0`} />
              </div>
            )}
          </div>
        )}
        {/* Pills inline */}
        <div className={`flex flex-row flex-wrap items-center ${ovGapSm} pb-[0.2em]`}>
          {enabledWidgets.includes("speed") && (
            <TelemetryPill label="SPD" value={formatVideoSpeed(currentPoint?.speed ?? null)} />
          )}
          {enabledWidgets.includes("altitude") && (
            <>
              <TelemetryPill label="ALT" value={formatVideoAltitude(currentPoint?.altitude ?? null)} />
              <TelemetryPill
                label="VS"
                value={verticalSpeedFpm != null ? `${formatVerticalSpeedFpm(verticalSpeedFpm)} fpm` : "-"}
              />
            </>
          )}
          {enabledWidgets.includes("heading") && (
            <TelemetryPill label="HDG" value={formatVideoHeading(currentPoint?.heading ?? null)} />
          )}
        </div>
      </div>
    </div>
  );
}

export function HudTelemetryOverlay(props: TelemetryOverlayProps) {
  const { airspeedArcs, altitudeChartRef, canvasRef, currentPoint, enabledWidgets, speedChartRef, verticalSpeedFpm } = props;
  const speedKt = speedMpsToKt(currentPoint?.speed ?? null);
  const altFt = altitudeMToFt(currentPoint?.altitude ?? null);
  const hasLeftWidgets =
    enabledWidgets.includes("route") ||
    enabledWidgets.includes("altitudeChart") ||
    enabledWidgets.includes("speedChart");

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-x-0 top-[4.6cqh] flex justify-center">
        <div className={ovHorizonArc} />
      </div>
      <div className={`absolute left-1/2 top-[44%] h-px ${ovCrosshairLg} -translate-x-1/2 bg-white/80`} />
      <div className={`absolute left-1/2 top-[52%] h-px ${ovCrosshairSm} -translate-x-1/2 bg-white/70`} />
      <HudSideTapeColumns
        airspeedArcs={airspeedArcs}
        altFt={altFt}
        enabledWidgets={enabledWidgets}
        hasLeftWidgets={hasLeftWidgets}
        speedKt={speedKt}
        verticalSpeedFpm={verticalSpeedFpm}
      />
      {enabledWidgets.includes("heading") && (
        <div className={`absolute ${ovBottomHdg} left-1/2 -translate-x-1/2 rounded bg-black/55 ${ovPadMd} ${ovTextXl} font-black text-white`}>
          HDG <span className="text-sky-200">{formatVideoHeading(currentPoint?.heading ?? null)}</span>
        </div>
      )}
      <HudLeftCorner
        altitudeChartRef={altitudeChartRef}
        canvasRef={canvasRef}
        enabledWidgets={enabledWidgets}
        speedChartRef={speedChartRef}
      />
    </div>
  );
}

function ChartPanel({
  title,
  canvasRef,
  compact = false,
  hudCorner = false,
}: {
  title: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  compact?: boolean;
  hudCorner?: boolean;
}) {
  const canvasClass = hudCorner ? `${ovChartHud} min-w-0 flex-1 w-full` : compact ? `${ovChartCompact} w-full` : `${ovChartHud} w-full`;
  const panelClass = hudCorner ? `${ovChartPanelHud} min-w-0 flex-1` : `${ovChartPanelHud} w-full`;

  return (
    <div className={panelClass}>
      <p className={`shrink-0 ${ovTextHudLegend} font-bold tracking-wide text-sky-100/95 mb-[0.2em]`}>{title}</p>
      <canvas ref={canvasRef} className={`${canvasClass} shrink-0`} />
    </div>
  );
}

type ChartYAxis = { min: number; max: number; step: number; gridLines: number };

function speedChartYAxis(rawMin: number, rawMax: number): ChartYAxis {
  const pad = Math.max(10, (rawMax - rawMin) * 0.08);
  let min = Math.floor((rawMin - pad) / 10) * 10;
  let max = Math.ceil((rawMax + pad) / 10) * 10;
  if (max <= min) max = min + 20;

  let step = 10;
  let span = max - min;
  while (span / step > 6) step += 10;
  while (span / step < 4 && step > 10) step -= 10;

  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  span = max - min;
  if (span / step < 4) {
    const extra = (4 - span / step) * step;
    min -= Math.floor(extra / 2 / step) * step;
    max += Math.ceil(extra / 2 / step) * step;
  }

  const gridLines = Math.round((max - min) / step);
  return { min, max, step, gridLines };
}

function altitudeChartYAxis(rawMin: number, rawMax: number): ChartYAxis {
  const pad = Math.max(100, (rawMax - rawMin) * 0.08);
  const dataMin = Math.floor((rawMin - pad) / 100) * 100;
  const dataMax = Math.ceil((rawMax + pad) / 100) * 100;
  const span = Math.max(200, dataMax - dataMin);

  let step = 100;
  for (const candidate of [100, 200, 500, 1000]) {
    const lines = span / candidate;
    if (lines >= 4 && lines <= 6) {
      step = candidate;
      break;
    }
    if (lines > 6) step = candidate;
  }

  let min = Math.floor(dataMin / step) * step;
  let max = Math.ceil(dataMax / step) * step;
  let gridLines = Math.round((max - min) / step);
  if (gridLines < 4) {
    const deficit = (4 - gridLines) * step;
    min -= Math.floor(deficit / 2 / step) * step;
    max += Math.ceil(deficit / 2 / step) * step;
    gridLines = Math.round((max - min) / step);
  }
  if (gridLines > 6) {
    step *= 2;
    min = Math.floor(dataMin / step) * step;
    max = Math.ceil(dataMax / step) * step;
    gridLines = Math.round((max - min) / step);
  }

  return { min, max, step, gridLines };
}

export type TelemetryChartDrawStyle = "default" | "hud";

export function drawTelemetryChart(
  canvas: HTMLCanvasElement,
  points: VideoTelemetryPoint[],
  current: VideoTelemetryPoint | null,
  key: "altitude" | "speed",
  style: TelemetryChartDrawStyle = "default",
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  // Fall back to pre-set canvas dimensions for off-screen elements (used during video export)
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width > 0 ? Math.round(rect.width * dpr) : Math.max(200, canvas.width);
  const height = rect.height > 0 ? Math.round(rect.height * dpr) : Math.max(80, canvas.height);
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const values = points.map((p) =>
    key === "altitude" ? (p.altitude == null ? null : p.altitude * 3.28084) : p.speed == null ? null : p.speed * 1.94384,
  );
  const valid = values.filter((v): v is number => Number.isFinite(v));
  if (valid.length < 2) return;

  const rawMin = Math.min(...valid);
  const rawMax = Math.max(...valid);
  const yAxis = key === "speed" ? speedChartYAxis(rawMin, rawMax) : altitudeChartYAxis(rawMin, rawMax);
  const { min, max, step, gridLines } = yAxis;
  const scale = Math.min(width, height);
  const fontMul = style === "hud" ? 1.2 : 1;
  const yFont = Math.max(7, Math.round(scale * 0.075 * fontMul));
  const xFont = Math.max(6, Math.round(yFont * 0.9));

  // Padding proporcional (evita margem esquerda fixa ~40px em gráficos pequenos)
  const sampleLabels = Array.from({ length: gridLines + 1 }, (_, i) => String(min + i * step));
  ctx.font = `${yFont}px system-ui, sans-serif`;
  const maxLabelW = Math.max(...sampleLabels.map((l) => ctx.measureText(l).width), yFont * 2);
  const leftPad = Math.min(Math.round(width * 0.28), Math.max(14, Math.round(maxLabelW + yFont * 0.5)));
  const rightPad = Math.max(4, Math.round(yFont * 0.4));
  const topPad = Math.max(2, Math.round(yFont * 0.45));
  const bottomPad = Math.max(8, Math.round(xFont * 1.6));
  const chartW = Math.max(1, width - leftPad - rightPad);
  const chartH = Math.max(1, height - topPad - bottomPad);

  const xLabels = 4;
  ctx.strokeStyle = "rgba(148,163,184,.22)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(203,213,225,.75)";
  ctx.font = `${yFont}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= gridLines; i++) {
    const value = min + i * step;
    const y = topPad + chartH - ((value - min) / (max - min || 1)) * chartH;
    ctx.beginPath();
    ctx.moveTo(leftPad, y);
    ctx.lineTo(width - rightPad, y);
    ctx.stroke();
    ctx.fillText(String(value), leftPad - Math.round(yFont * 0.35), y);
  }

  const durationMs = Math.max(1, (points[points.length - 1]?.timeMs ?? 0) - (points[0]?.timeMs ?? 0));
  ctx.fillStyle = "rgba(203,213,225,.9)";
  ctx.font = `${xFont}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= xLabels; i++) {
    const index = Math.round((i / xLabels) * Math.max(0, points.length - 1));
    const x = leftPad + (index / Math.max(1, values.length - 1)) * chartW;
    const elapsedSec = Math.round(((points[index]?.timeMs ?? 0) - (points[0]?.timeMs ?? 0)) / 1000);
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    const label = durationMs > 120000 ? `${mins}:${String(secs).padStart(2, "0")}` : `${elapsedSec}s`;
    ctx.fillText(label, x, height - bottomPad + 4);
  }

  const lineW = Math.max(1.5, scale * 0.004 * (style === "hud" ? 1.1 : 1));
  ctx.lineWidth = lineW;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (style === "hud") {
    const grad = ctx.createLinearGradient(leftPad, topPad, leftPad + chartW, topPad);
    grad.addColorStop(0, "rgba(186, 230, 253, 0.98)");
    grad.addColorStop(0.45, "rgba(56, 189, 248, 0.96)");
    grad.addColorStop(1, "rgba(37, 99, 235, 0.94)");
    ctx.strokeStyle = grad;
  } else {
    ctx.strokeStyle = "rgba(125,211,252,.92)";
  }

  ctx.beginPath();
  values.forEach((value, index) => {
    if (value == null) return;
    const x = leftPad + (index / Math.max(1, values.length - 1)) * chartW;
    const y = topPad + chartH - ((value - min) / (max - min || 1)) * chartH;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (current) {
    const idx = points.findIndex((p) => p.timeMs >= current.timeMs);
    const currentValue = key === "altitude" ? current.altitude : current.speed;
    if (idx >= 0 && currentValue != null) {
      const normalized = key === "altitude" ? currentValue * 3.28084 : currentValue * 1.94384;
      const x = leftPad + (idx / Math.max(1, values.length - 1)) * chartW;
      const y = topPad + chartH - ((normalized - min) / (max - min || 1)) * chartH;
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, scale * 0.006), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
