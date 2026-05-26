import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { FlightEvent } from "../types/flight";
import {
  TELEMETRY_PANELS,
  colorForKey,
  labelForKey,
  panelHasData,
  type ChartRow,
} from "../lib/telemetryCharts";

function formatX(v: number, hasTime: boolean, chartTimeBaseMs: number | null) {
  if (hasTime && chartTimeBaseMs != null) {
    try {
      return new Date(chartTimeBaseMs + v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return String(v);
    }
  }
  return hasTime ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : `#${Math.round(v)}`;
}

function formatTooltipX(v: number, hasTime: boolean, chartTimeBaseMs: number | null) {
  if (hasTime && chartTimeBaseMs != null) {
    try {
      return new Date(chartTimeBaseMs + v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return String(v);
    }
  }
  return hasTime ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : `#${Math.round(v)}`;
}

type BaseProps = {
  chartData: ChartRow[];
  hasTime: boolean;
  chartTimeBaseMs: number | null;
  resolved: Record<string, string>;
};

type Props = BaseProps & {
  onHoverX?: (x: number | null) => void;
  onXDomainChange?: (domain: [number, number] | null) => void;
  xDomain?: [number, number] | null;
  fullXDomain?: [number, number] | null;
  focusDomain?: [number, number] | null;
  events?: FlightEvent[];
  compact?: boolean;
};

type Domain = [number, number] | null;

function withinDomain(x: number, domain: Domain): boolean {
  if (!domain) return true;
  return x >= domain[0] && x <= domain[1];
}

function calcYDomain(data: ChartRow[], visibleKeys: string[], domain: Domain): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    if (!withinDomain(row.x, domain)) continue;
    for (const key of visibleKeys) {
      const v = row[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.08, 1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function defaultHiddenForPanel(panelId: string, keys: string[]): Set<string> {
  if (panelId === "alt" && keys.includes("gpsAltFt")) return new Set(keys.filter((k) => k !== "gpsAltFt"));
  if (panelId === "spd" && keys.includes("iasKt")) return new Set(keys.filter((k) => k !== "iasKt"));
  return new Set();
}

export const FlightCharts = memo(function FlightCharts({
  chartData,
  hasTime,
  chartTimeBaseMs,
  resolved,
  onHoverX,
  onXDomainChange,
  xDomain,
  fullXDomain,
  focusDomain,
  events,
  compact = false,
}: Props) {
  const resolvedMap = useMemo(() => new Map(Object.entries(resolved)), [resolved]);
  const panels = useMemo(
    () => TELEMETRY_PANELS.filter((p) => panelHasData(p, chartData, resolvedMap)),
    [chartData, resolvedMap],
  );
  const [chartCount, setChartCount] = useState<1 | 2 | 3>(compact ? 2 : 2);
  const [slotPanels, setSlotPanels] = useState<[string, string, string]>([
    "spd",
    "alt",
    TELEMETRY_PANELS[2]?.id ?? TELEMETRY_PANELS[0]?.id ?? "vs",
  ]);
  const [activeHoverX, setActiveHoverX] = useState<number | null>(null);
  const handlePanelHoverX = (x: number | null) => {
    setActiveHoverX(x);
    onHoverX?.(x);
  };

  if (chartData.length === 0) {
    return <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">Sem linhas de dados para graficos.</p>;
  }
  if (panels.length === 0) {
    return <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">Nenhuma coluna de telemetria esperada foi encontrada.</p>;
  }

  const visibleSlots = slotPanels.slice(0, chartCount).map((panelId, slotIdx) => {
    if (panels.some((p) => p.id === panelId)) return panelId;
    return panels[slotIdx]?.id ?? panels[0]!.id;
  });

  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 rounded-xl border border-slate-700 bg-slate-950/40 ${compact ? "p-1.5" : "p-2.5"}`}>
      {!compact ? (
        <div className="flex items-center justify-end gap-2">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setChartCount(n as 1 | 2 | 3)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                chartCount === n ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`grid min-h-0 flex-1 gap-2.5 ${chartCount === 1 ? "grid-cols-1" : chartCount === 2 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 lg:grid-cols-3"}`}>
        {visibleSlots.map((panelId, slotIdx) => {
          const panel = panels.find((p) => p.id === panelId) ?? panels[slotIdx] ?? panels[0]!;
          return (
            <CanvasPanelChart
              key={`panel-${slotIdx}-${panel.id}`}
              panel={panel}
              slotIndex={slotIdx}
              allPanels={panels}
              displayData={chartData}
              resolvedMap={resolvedMap}
              hasTime={hasTime}
              chartTimeBaseMs={chartTimeBaseMs}
              activeHoverX={activeHoverX}
              onHoverX={handlePanelHoverX}
              onXDomainChange={onXDomainChange}
              xDomain={xDomain}
              fullXDomain={fullXDomain}
              focusDomain={focusDomain}
              events={events}
              compact={compact}
              onPanelChange={(nextPanelId) => {
                const next = [...slotPanels] as [string, string, string];
                next[slotIdx] = nextPanelId;
                setSlotPanels(next);
              }}
            />
          );
        })}
      </div>
    </div>
  );
});

const CanvasPanelChart = memo(function CanvasPanelChart({
  panel,
  slotIndex,
  allPanels,
  displayData,
  resolvedMap,
  hasTime,
  chartTimeBaseMs,
  activeHoverX,
  onHoverX,
  onXDomainChange,
  xDomain,
  fullXDomain,
  focusDomain,
  events,
  compact,
  onPanelChange,
}: {
  panel: (typeof TELEMETRY_PANELS)[number];
  slotIndex: number;
  allPanels: typeof TELEMETRY_PANELS;
  displayData: ChartRow[];
  resolvedMap: Map<string, string>;
  hasTime: boolean;
  chartTimeBaseMs: number | null;
  activeHoverX: number | null;
  onHoverX?: (x: number | null) => void;
  onXDomainChange?: (domain: [number, number] | null) => void;
  xDomain?: [number, number] | null;
  fullXDomain?: [number, number] | null;
  focusDomain?: [number, number] | null;
  events?: FlightEvent[];
  compact: boolean;
  onPanelChange: (panelId: string) => void;
}) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const activeHoverXRef = useRef<number | null>(activeHoverX);
  const xDomainRef = useRef(xDomain);
  const fullXDomainRef = useRef(fullXDomain);
  const onXDomainChangeRef = useRef(onXDomainChange);
  const onHoverXRef = useRef(onHoverX);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef(0);
  const wheelClientXRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const [dragRange, setDragRange] = useState<[number, number] | null>(null);

  const keys = useMemo(() => panel.seriesKeys.filter((k) => resolvedMap.has(k)), [panel.seriesKeys, resolvedMap]);
  useEffect(() => setHiddenKeys(defaultHiddenForPanel(panel.id, keys)), [panel.id, keys]);
  useEffect(() => { xDomainRef.current = xDomain; }, [xDomain]);
  useEffect(() => { fullXDomainRef.current = fullXDomain; }, [fullXDomain]);
  useEffect(() => { onXDomainChangeRef.current = onXDomainChange; }, [onXDomainChange]);
  useEffect(() => { onHoverXRef.current = onHoverX; }, [onHoverX]);
  useEffect(() => { activeHoverXRef.current = activeHoverX; }, [activeHoverX]);

  const visibleKeys = keys.filter((k) => !hiddenKeys.has(k));
  const yDomain = useMemo(() => calcYDomain(displayData, visibleKeys, focusDomain ?? xDomain ?? null), [displayData, visibleKeys, focusDomain, xDomain]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return undefined;

    const applyWheelZoom = () => {
      wheelFrameRef.current = null;
      const full = fullXDomainRef.current;
      const onChange = onXDomainChangeRef.current;
      if (!full || !onChange) return;
      const [fullMin, fullMax] = full;
      const fullSpan = fullMax - fullMin;
      if (fullSpan <= 0) return;
      const current = xDomainRef.current ?? full;
      const currentSpan = current[1] - current[0];
      const rect = el.getBoundingClientRect();
      const clientX = wheelClientXRef.current ?? rect.left + rect.width / 2;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const anchor = current[0] + currentSpan * ratio;
      const factor = Math.exp(wheelDeltaRef.current * 0.0012);
      wheelDeltaRef.current = 0;
      const nextSpan = Math.min(fullSpan, Math.max(fullSpan / 800, currentSpan * factor));
      if (nextSpan >= fullSpan * 0.92) {
        onChange(null);
        return;
      }
      let nextMin = anchor - nextSpan * ratio;
      let nextMax = nextMin + nextSpan;
      if (nextMin < fullMin) {
        nextMin = fullMin;
        nextMax = fullMin + nextSpan;
      }
      if (nextMax > fullMax) {
        nextMax = fullMax;
        nextMin = fullMax - nextSpan;
      }
      onChange([nextMin, nextMax]);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!fullXDomainRef.current || !onXDomainChangeRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      wheelDeltaRef.current += event.deltaY;
      wheelClientXRef.current = event.clientX;
      if (wheelFrameRef.current === null) wheelFrameRef.current = window.requestAnimationFrame(applyWheelZoom);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return undefined;
    let frame = 0;

    const draw = () => {
      frame = 0;
      const rect = shell.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const left = compact ? 36 : 44;
      const right = 10;
      const top = 8;
      const bottom = compact ? 16 : 22;
      const plotW = Math.max(1, width - left - right);
      const plotH = Math.max(1, height - top - bottom);
      const xMin = xDomain?.[0] ?? displayData[0]?.x ?? 0;
      const xMax = xDomain?.[1] ?? displayData[displayData.length - 1]?.x ?? 1;
      const yMin = yDomain[0];
      const yMax = yDomain[1];
      const xSpan = xMax - xMin || 1;
      const ySpan = yMax - yMin || 1;
      const toX = (x: number) => left + ((x - xMin) / xSpan) * plotW;
      const toY = (y: number) => top + plotH - ((y - yMin) / ySpan) * plotH;

      ctx.strokeStyle = "#1e293b";
      ctx.fillStyle = "#64748b";
      ctx.lineWidth = 1;
      ctx.font = `${compact ? 9 : 10}px system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i += 1) {
        const y = top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.fillText(formatAxisValue(yMax - (ySpan * i) / 4), 4, y);
      }
      ctx.textBaseline = "top";
      for (let i = 0; i <= 4; i += 1) {
        const x = left + (plotW * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotH);
        ctx.stroke();
        if (!compact || i % 2 === 0) {
          ctx.fillText(formatX(xMin + (xSpan * i) / 4, hasTime, chartTimeBaseMs), Math.min(width - right - 42, Math.max(left, x - 20)), top + plotH + 4);
        }
      }

      if (focusDomain) {
        ctx.fillStyle = "rgba(34, 211, 238, 0.08)";
        const fx1 = toX(focusDomain[0]);
        const fx2 = toX(focusDomain[1]);
        ctx.fillRect(Math.min(fx1, fx2), top, Math.abs(fx2 - fx1), plotH);
      }

      if (dragRange) {
        const dx1 = toX(dragRange[0]);
        const dx2 = toX(dragRange[1]);
        ctx.fillStyle = "rgba(14, 165, 233, 0.18)";
        ctx.fillRect(Math.min(dx1, dx2), top, Math.abs(dx2 - dx1), plotH);
        ctx.strokeStyle = "rgba(125, 211, 252, 0.85)";
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.min(dx1, dx2), top, Math.abs(dx2 - dx1), plotH);
      }

      for (const ev of events ?? []) {
        if (ev.xMs < xMin || ev.xMs > xMax) continue;
        const x = toX(ev.xMs);
        ctx.save();
        ctx.strokeStyle = ev.color;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotH);
        ctx.stroke();
        ctx.restore();
      }

      for (const key of visibleKeys) {
        ctx.strokeStyle = colorForKey(key);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        let active = false;
        for (const row of displayData) {
          if (row.x < xMin || row.x > xMax) continue;
          const value = row[key];
          if (typeof value !== "number" || !Number.isFinite(value)) {
            active = false;
            continue;
          }
          const x = toX(row.x);
          const y = toY(value);
          if (!active) {
            ctx.moveTo(x, y);
            active = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      if (activeHoverX !== null && activeHoverX >= xMin && activeHoverX <= xMax) {
        const hoverRow = nearestRow(displayData, activeHoverX);
        const hoverX = toX(activeHoverX);
        ctx.save();
        ctx.strokeStyle = "rgba(226, 232, 240, 0.85)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hoverX, top);
        ctx.lineTo(hoverX, top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        if (hoverRow) {
          for (const key of visibleKeys) {
            const value = hoverRow[key];
            if (typeof value !== "number" || !Number.isFinite(value)) continue;
            ctx.fillStyle = colorForKey(key);
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(toX(hoverRow.x), toY(value), 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    };

    const ro = new ResizeObserver(() => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(draw);
    });
    ro.observe(shell);
    draw();
    return () => {
      ro.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeHoverX, chartTimeBaseMs, compact, displayData, dragRange, events, focusDomain, hasTime, visibleKeys, xDomain, yDomain]);

  const toggleKey = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const xValueFromClientX = (clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas || displayData.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const left = compact ? 36 : 44;
    const right = 10;
    const plotW = Math.max(1, rect.width - left - right);
    const xMin = xDomainRef.current?.[0] ?? displayData[0]?.x ?? 0;
    const xMax = xDomainRef.current?.[1] ?? displayData[displayData.length - 1]?.x ?? 1;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - left) / plotW));
    return xMin + (xMax - xMin) * ratio;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !onXDomainChangeRef.current || displayData.length < 2) return;
    const xValue = xValueFromClientX(event.clientX);
    if (xValue === null) return;
    dragStartXRef.current = xValue;
    dragPointerIdRef.current = event.pointerId;
    setDragRange([xValue, xValue]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip || displayData.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const left = compact ? 36 : 44;
    const right = 10;
    const plotW = Math.max(1, rect.width - left - right);
    const xMin = xDomainRef.current?.[0] ?? displayData[0]?.x ?? 0;
    const xMax = xDomainRef.current?.[1] ?? displayData[displayData.length - 1]?.x ?? 1;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - left) / plotW));
    const xValue = xMin + (xMax - xMin) * ratio;
    if (dragStartXRef.current !== null) {
      setDragRange([dragStartXRef.current, xValue]);
    }
    const row = nearestRow(displayData, xValue);
    if (!row) return;
    onHoverXRef.current?.(row.x);
    showTooltip(tooltip, row, visibleKeys, hasTime, chartTimeBaseMs, event.clientX - rect.left + 10, event.clientY - rect.top - 16, rect.width);
  };

  const finishDragSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) return;
    const start = dragStartXRef.current;
    const end = xValueFromClientX(event.clientX);
    dragStartXRef.current = null;
    dragPointerIdRef.current = null;
    setDragRange(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    if (start === null || end === null) return;
    const full = fullXDomainRef.current ?? [displayData[0]?.x ?? 0, displayData[displayData.length - 1]?.x ?? 1];
    const min = Math.max(full[0], Math.min(start, end));
    const max = Math.min(full[1], Math.max(start, end));
    const fullSpan = full[1] - full[0] || 1;
    if ((max - min) < fullSpan * 0.005) return;
    onXDomainChangeRef.current?.([min, max]);
  };

  const handlePointerLeave = () => {
    if (dragStartXRef.current === null) onHoverXRef.current?.(null);
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  };

  useEffect(() => {
    const shell = shellRef.current;
    const tooltip = tooltipRef.current;
    if (!shell || !tooltip) return;
    if (activeHoverX === null) {
      tooltip.style.display = "none";
      return;
    }
    const xMin = xDomain?.[0] ?? displayData[0]?.x ?? 0;
    const xMax = xDomain?.[1] ?? displayData[displayData.length - 1]?.x ?? 1;
    if (activeHoverX < xMin || activeHoverX > xMax) {
      tooltip.style.display = "none";
      return;
    }
    const row = nearestRow(displayData, activeHoverX);
    if (!row) return;
    const rect = shell.getBoundingClientRect();
    const left = compact ? 36 : 44;
    const right = 10;
    const plotW = Math.max(1, rect.width - left - right);
    const x = left + ((activeHoverX - xMin) / (xMax - xMin || 1)) * plotW + 10;
    showTooltip(tooltip, row, visibleKeys, hasTime, chartTimeBaseMs, x, 10, rect.width);
  }, [activeHoverX, chartTimeBaseMs, compact, displayData, hasTime, visibleKeys, xDomain]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-700 bg-slate-950/40 p-2">
      {!compact ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">Grafico {slotIndex + 1}</span>
          <select value={panel.id} onChange={(e) => onPanelChange(e.target.value)} className="w-40 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
            {allPanels.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      ) : null}
      {!compact ? (
        <div className="mb-1 flex flex-wrap gap-2">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleKey(key)}
              className="text-[11px]"
              style={{ color: hiddenKeys.has(key) ? "#475569" : colorForKey(key) }}
            >
              {labelForKey(key)}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={shellRef} className="relative min-h-0 flex-1 overscroll-contain">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDragSelection}
          onPointerCancel={finishDragSelection}
          onPointerLeave={handlePointerLeave}
        />
        <div ref={tooltipRef} className="pointer-events-none absolute left-0 top-0 hidden rounded-md border border-slate-700 bg-slate-950/90 px-2 py-1 text-[11px] text-slate-300 shadow-lg" />
      </div>
    </div>
  );
});

function formatAxisValue(value: number): string {
  if (Math.abs(value) >= 1000) return String(Math.round(value));
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function nearestRow(data: ChartRow[], x: number): ChartRow | null {
  if (data.length === 0) return null;
  let lo = 0;
  let hi = data.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid]!.x < x) lo = mid + 1;
    else hi = mid;
  }
  const a = data[lo - 1];
  const b = data[lo];
  if (!a) return b ?? null;
  if (!b) return a;
  return Math.abs(a.x - x) <= Math.abs(b.x - x) ? a : b;
}

function tooltipHtml(row: ChartRow, visibleKeys: string[], hasTime: boolean, chartTimeBaseMs: number | null): string {
  const lines = visibleKeys
    .map((key) => {
      const value = row[key];
      return typeof value === "number" && Number.isFinite(value)
        ? `<div><span style="color:${colorForKey(key)}">●</span> ${labelForKey(key)}: ${value.toFixed(2)}</div>`
        : "";
    })
    .filter(Boolean)
    .join("");
  return `<div style="color:#cbd5e1;margin-bottom:2px">${formatTooltipX(row.x, hasTime, chartTimeBaseMs)}</div>${lines}`;
}

function showTooltip(
  tooltip: HTMLDivElement,
  row: ChartRow,
  visibleKeys: string[],
  hasTime: boolean,
  chartTimeBaseMs: number | null,
  x: number,
  y: number,
  width: number,
): void {
  tooltip.style.display = "block";
  tooltip.style.transform = `translate(${Math.min(width - 150, Math.max(0, x))}px, ${Math.max(0, y)}px)`;
  tooltip.innerHTML = tooltipHtml(row, visibleKeys, hasTime, chartTimeBaseMs);
}
