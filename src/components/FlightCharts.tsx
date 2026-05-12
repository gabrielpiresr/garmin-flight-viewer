import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FlightEvent } from "../types/flight";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  TELEMETRY_PANELS,
  colorForKey,
  labelForKey,
  panelHasData,
  type ChartRow,
} from "../lib/telemetryCharts";

// Fewer points = much faster render & hover updates (600 is plenty for visual fidelity)
const MAX_CHART_POINTS = 600;
const CHART_SYNC_ID = "telemetry-sync";

function downsample(data: ChartRow[], maxPoints: number): ChartRow[] {
  if (data.length <= maxPoints) return data;
  const step = (data.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => data[Math.round(i * step)]!);
}

function formatX(v: number, hasTime: boolean, chartTimeBaseMs: number | null) {
  if (hasTime && chartTimeBaseMs != null) {
    try {
      return new Date(chartTimeBaseMs + v).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(v);
    }
  }
  if (hasTime) {
    try {
      return new Date(v).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(v);
    }
  }
  return `#${Math.round(v)}`;
}

type BaseProps = {
  chartData: ChartRow[];
  hasTime: boolean;
  chartTimeBaseMs: number | null;
  resolved: Record<string, string>;
};

type Props = BaseProps & {
  onHoverX?: (x: number | null) => void;
  /** Domínio [xMin, xMax] derivado dos bounds do mapa; null = mostrar tudo. */
  xDomain?: [number, number] | null;
  /** Janela de foco (ex.: trecho selecionado) para realce e escala Y. */
  focusDomain?: [number, number] | null;
  /** Eventos de voo para marcar com linhas pontilhadas. */
  events?: FlightEvent[];
};

type Domain = [number, number] | null;

function withinDomain(x: number, domain: Domain): boolean {
  if (!domain) return true;
  return x >= domain[0] && x <= domain[1];
}

function calcYDomain(
  data: ChartRow[],
  visibleKeys: string[],
  domain: Domain,
): [number, number] | ["auto", "auto"] {
  const vals: number[] = [];
  for (const row of data) {
    if (!withinDomain(row.x, domain)) continue;
    for (const key of visibleKeys) {
      const v = row[key];
      if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
    }
  }
  if (vals.length === 0) return ["auto", "auto"];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.08, 1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function focusedKey(key: string): string {
  return `${key}__focus`;
}

function defaultHiddenForPanel(panelId: string, keys: string[]): Set<string> {
  if (panelId === "alt") {
    if (keys.includes("gpsAltFt")) return new Set(keys.filter((k) => k !== "gpsAltFt"));
    return new Set();
  }
  if (panelId === "spd") {
    if (keys.includes("iasKt")) return new Set(keys.filter((k) => k !== "iasKt"));
    return new Set();
  }
  return new Set();
}

/** Grade completa de painéis de telemetria. Envolvida em memo: não re-renderiza durante hover. */
export const FlightCharts = memo(function FlightCharts({
  chartData,
  hasTime,
  chartTimeBaseMs,
  resolved,
  onHoverX,
  xDomain,
  focusDomain,
  events,
}: Props) {
  const resolvedMap = useMemo(() => new Map(Object.entries(resolved)), [resolved]);
  const displayData = useMemo(() => downsample(chartData, MAX_CHART_POINTS), [chartData]);
  const panels = useMemo(
    () => TELEMETRY_PANELS.filter((p) => panelHasData(p, displayData, resolvedMap)),
    [displayData, resolvedMap],
  );
  const [chartCount, setChartCount] = useState<1 | 2 | 3>(2);
  const [slotPanels, setSlotPanels] = useState<[string, string, string]>([
    "spd",
    "alt",
    TELEMETRY_PANELS[2]?.id ?? TELEMETRY_PANELS[0]?.id ?? "vs",
  ]);

  if (displayData.length === 0) {
    return (
      <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
        Sem linhas de dados para gráficos.
      </p>
    );
  }

  if (panels.length === 0) {
    return (
      <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
        Nenhuma das colunas de telemetria esperadas foi encontrada neste arquivo (além de lat/lon).
      </p>
    );
  }

  const visibleSlots = slotPanels.slice(0, chartCount).map((panelId, slotIdx) => {
    if (panels.some((p) => p.id === panelId)) return panelId;
    return panels[slotIdx]?.id ?? panels[0]!.id;
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 rounded-xl border border-slate-700 bg-slate-950/40 p-2.5">
      <div className="flex items-center justify-end gap-2">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => setChartCount(n as 1 | 2 | 3)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              chartCount === n
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className={`grid min-h-0 flex-1 gap-2.5 ${chartCount === 1 ? "md:grid-cols-1" : chartCount === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {visibleSlots.map((panelId, slotIdx) => {
          const panel = panels.find((p) => p.id === panelId) ?? panels[slotIdx] ?? panels[0]!;
          return (
            <SyncedPanelChart
              key={`panel-${slotIdx}-${panel.id}`}
            panel={panel}
            slotIndex={slotIdx}
            allPanels={panels}
            displayData={displayData}
            resolvedMap={resolvedMap}
            hasTime={hasTime}
            chartTimeBaseMs={chartTimeBaseMs}
            onHoverX={onHoverX}
            xDomain={xDomain}
            focusDomain={focusDomain}
            events={events}
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

/** Painel individual com toggle de legenda. Também memoizado para evitar re-renders desnecessários. */
const SyncedPanelChart = memo(function SyncedPanelChart({
  panel,
  slotIndex,
  allPanels,
  displayData,
  resolvedMap,
  hasTime,
  chartTimeBaseMs,
  onHoverX,
  xDomain,
  focusDomain,
  events,
  onPanelChange,
}: {
  panel: (typeof TELEMETRY_PANELS)[number];
  slotIndex: number;
  allPanels: (typeof TELEMETRY_PANELS);
  displayData: ChartRow[];
  resolvedMap: Map<string, string>;
  hasTime: boolean;
  chartTimeBaseMs: number | null;
  onHoverX?: (x: number | null) => void;
  xDomain?: [number, number] | null;
  focusDomain?: [number, number] | null;
  events?: FlightEvent[];
  onPanelChange: (panelId: string) => void;
}) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const lastHoverIndex = useRef<number | null>(null);
  const keys = panel.seriesKeys.filter((k) => resolvedMap.has(k));
  useEffect(() => {
    setHiddenKeys(defaultHiddenForPanel(panel.id, keys));
  }, [panel.id, keys]);
  const visibleKeys = keys.filter((k) => !hiddenKeys.has(k));
  const yDomain = useMemo(
    () => calcYDomain(displayData, visibleKeys, focusDomain ?? xDomain ?? null),
    [displayData, visibleKeys, focusDomain, xDomain],
  );
  const decoratedData = useMemo(() => {
    if (!focusDomain) return displayData;
    return displayData.map((row) => {
      const inFocus = withinDomain(row.x, focusDomain);
      const next = { ...row } as Record<string, number | null>;
      for (const key of keys) {
        const v = row[key];
        next[focusedKey(key)] = inFocus && typeof v === "number" ? v : null;
      }
      return next as ChartRow;
    });
  }, [displayData, focusDomain, keys]);

  const toggleKey = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-700 bg-slate-950/40 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">Gráfico {slotIndex + 1}</span>
        <select
          value={panel.id}
          onChange={(e) => onPanelChange(e.target.value)}
          className="w-40 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
        >
          {allPanels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      {events && events.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {events.map((ev) => (
            <span
              key={`ev-chip-${ev.type}-${ev.rowIdx}`}
              className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
              style={{ borderColor: ev.color, color: ev.color }}
            >
              {ev.label}
            </span>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={decoratedData}
            syncId={CHART_SYNC_ID}
            margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
            onMouseMove={(e) => {
              const idx = e.activeTooltipIndex;
              if (idx == null || idx === lastHoverIndex.current) return;
              lastHoverIndex.current = idx;
              if (e.activeLabel != null) onHoverX?.(Number(e.activeLabel));
            }}
            onMouseLeave={() => {
              lastHoverIndex.current = null;
              onHoverX?.(null);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="x"
              type="number"
              scale="linear"
              domain={xDomain ?? ["dataMin", "dataMax"]}
              allowDataOverflow={xDomain != null}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickFormatter={(v) => formatX(Number(v), hasTime, chartTimeBaseMs)}
            />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} domain={yDomain} width={44} />
            <Tooltip
              contentStyle={{
                background: "rgba(15, 23, 42, 0.78)",
                backdropFilter: "blur(6px)",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => formatX(Number(v), hasTime, chartTimeBaseMs)}
              formatter={(value: number, name: string) => {
                const label = typeof name === "string" ? labelForKey(name) : name;
                const n = typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : String(value);
                return [n, label];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              onClick={(e) => { if (typeof e.dataKey === "string") toggleKey(e.dataKey); }}
              formatter={(value) => (
                <span
                  className="cursor-pointer"
                  style={{ color: hiddenKeys.has(value) ? "#475569" : "#94a3b8" }}
                >
                  {labelForKey(value)}
                </span>
              )}
            />
            {keys.map((k) =>
              focusDomain ? (
                <Line
                  key={`${k}-context`}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  stroke={colorForKey(k)}
                  strokeDasharray="4 4"
                  opacity={0.35}
                  strokeWidth={1.4}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  hide={hiddenKeys.has(k)}
                />
              ) : (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  stroke={colorForKey(k)}
                  strokeWidth={1.75}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  hide={hiddenKeys.has(k)}
                />
              ),
            )}
            {focusDomain &&
              keys.map((k) => (
                <Line
                  key={`${k}-focus`}
                  type="monotone"
                  dataKey={focusedKey(k)}
                  name={k}
                  stroke={colorForKey(k)}
                  strokeWidth={2.2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  legendType="none"
                  hide={hiddenKeys.has(k)}
                />
              ))}
            {events?.map((ev) => (
              <ReferenceLine
                key={`${ev.type}-${ev.rowIdx}`}
                x={ev.xMs}
                stroke={ev.color}
                strokeDasharray="2 2"
                strokeWidth={2}
                label={{
                  value: ev.label,
                  position: "insideTopRight",
                  angle: -90,
                  fontSize: 10,
                  fill: ev.color,
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
