import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CRM_REPORT_CATEGORY_LABELS,
  CRM_REPORT_PANEL_CATALOG,
  createPanel,
  getPanelMeta,
  loadReportLayout,
  resetReportLayout,
  resolveKpi,
  resolvePanelBuckets,
  saveReportLayout,
  type CrmReportPanel,
  type CrmReportPanelSize,
  type CrmReportPanelType,
  type CrmReportViz,
} from "../../../lib/crmReportLayout";
import {
  buildCrmReportSnapshot,
  collectLossReasonsFromLeads,
  collectReferralSources,
  filterLeadsForReport,
  formatNum,
  inferTimelineGranularity,
  type CrmReportDateField,
  type CrmReportDateFilter,
  type CrmReportExtraFilters,
} from "../../../lib/crmReportMetrics";
import {
  CRM_COURSE_OPTIONS,
  CRM_STATUS_LABELS,
  CRM_STATUSES,
  type CrmLead,
  type CrmLeadScoreRule,
  type CrmStatus,
} from "../../../types/crm";

type Props = {
  leads: CrmLead[];
  scoreRules: CrmLeadScoreRule[];
  /** Leads already filtered by the CRM search/filters panel (base set). */
  baseLeads: CrmLead[];
};

type PeriodPreset = "7d" | "30d" | "90d" | "ytd" | "all" | "custom";

const inputCls =
  "rounded-lg border border-slate-700 bg-[var(--bg)] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none";

const TONE_STYLES: Record<string, { value: string; ring: string; glow: string }> = {
  sky: { value: "text-sky-300", ring: "border-sky-500/20", glow: "from-sky-500/10" },
  emerald: { value: "text-emerald-300", ring: "border-emerald-500/20", glow: "from-emerald-500/10" },
  amber: { value: "text-amber-300", ring: "border-amber-500/20", glow: "from-amber-500/10" },
  rose: { value: "text-rose-300", ring: "border-rose-500/20", glow: "from-rose-500/10" },
  violet: { value: "text-violet-300", ring: "border-violet-500/20", glow: "from-violet-500/10" },
  slate: { value: "text-slate-200", ring: "border-slate-600/40", glow: "from-slate-500/10" },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function yearStartIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function sizeClass(size: CrmReportPanelSize): string {
  const w =
    size.w === 3
      ? "col-span-12 sm:col-span-6 lg:col-span-3"
      : size.w === 4
        ? "col-span-12 sm:col-span-6 lg:col-span-4"
        : size.w === 6
          ? "col-span-12 lg:col-span-6"
          : size.w === 8
            ? "col-span-12 lg:col-span-8"
            : "col-span-12";
  const h = size.h === 1 ? "min-h-[120px]" : size.h === 2 ? "min-h-[280px]" : "min-h-[400px]";
  return `${w} ${h}`;
}

function chartHeight(size: CrmReportPanelSize): number {
  if (size.h === 1) return 56;
  if (size.h === 2) return 200;
  return 320;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? "1"
        : `${selected.length} selecionados`;

  return (
    <div className="min-w-[140px]">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <details className="group relative">
        <summary className={`${inputCls} w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <span className="flex items-center justify-between gap-2">
            <span className={`truncate ${selected.length > 0 ? "text-sky-300" : "text-slate-300"}`}>{summary}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-slate-500 group-open:rotate-180 transition">
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </span>
        </summary>
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-700 bg-[var(--panel)] p-1 shadow-xl">
          {options.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-800/60">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() =>
                  onChange(
                    selected.includes(opt.value)
                      ? selected.filter((v) => v !== opt.value)
                      : [...selected, opt.value],
                  )
                }
                className="h-3.5 w-3.5 rounded accent-sky-500"
              />
              <span className="text-xs text-slate-200">{opt.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  showPercent = false,
  total,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: { category?: string; name?: string; value?: number; fill?: string; color?: string };
    percent?: number;
  }>;
  label?: string;
  showPercent?: boolean;
  total?: number;
}) {
  if (!active || !payload?.length) return null;
  const sum =
    total ??
    (payload[0]?.payload
      ? undefined
      : payload.reduce((s, p) => s + Number(p.value ?? 0), 0));
  // For pie, payload is one slice; for bars with showPercent, use provided total.
  const effectiveTotal =
    sum ??
    total ??
    payload.reduce((s, p) => s + Number(p.value ?? 0), 0);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-xl">
      {label && !showPercent && <p className="mb-1 text-[11px] font-medium text-slate-300">{label}</p>}
      {payload.map((p, i) => {
        const value = Number(p.value ?? 0);
        const itemName =
          p.payload?.category ??
          (typeof label === "string" && label && label !== "Quantidade" ? label : null) ??
          p.name ??
          p.payload?.name ??
          "Item";
        const pct =
          typeof p.percent === "number"
            ? p.percent * 100
            : effectiveTotal > 0
              ? (value / effectiveTotal) * 100
              : 0;
        return (
          <p key={i} className="text-xs tabular-nums text-slate-200">
            <span
              className="mr-2 inline-block h-2 w-2 rounded-full"
              style={{ background: p.color ?? p.payload?.fill ?? p.payload?.color }}
            />
            {itemName}: <span className="font-semibold">{formatNum(value)}</span>
            {showPercent && (
              <span className="ml-1.5 text-slate-400">
                ({pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
              </span>
            )}
          </p>
        );
      })}
    </div>
  );
}

function StatPanel({
  title,
  kpi,
  compact = false,
}: {
  title: string;
  kpi: NonNullable<ReturnType<typeof resolveKpi>>;
  compact?: boolean;
}) {
  const tone = TONE_STYLES[kpi.tone] ?? TONE_STYLES.slate!;
  if (compact) {
    return (
      <div className="flex h-full flex-col justify-center">
        <p className={`text-3xl font-semibold tabular-nums tracking-tight ${tone.value}`}>{kpi.value}</p>
        <p className="mt-1 text-xs text-slate-500">{kpi.subtitle}</p>
      </div>
    );
  }
  return (
    <div className={`relative flex h-full flex-col justify-between overflow-hidden rounded-xl border ${tone.ring} bg-[var(--panel)] p-4`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.glow} to-transparent`} />
      <p className="relative text-[11px] font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="relative">
        <p className={`text-3xl font-semibold tabular-nums tracking-tight ${tone.value}`}>{kpi.value}</p>
        <p className="mt-1 text-xs text-slate-500">{kpi.subtitle}</p>
      </div>
    </div>
  );
}

function BucketChart({
  data,
  viz,
  height,
  unitSuffix = "",
}: {
  data: { key: string; label: string; value: number; color?: string }[];
  viz: CrmReportViz;
  height: number;
  unitSuffix?: string;
}) {
  // Keep chart payload free of reserved Recharts/React fields (key, label, name).
  const chartData = data.map((d, i) => ({
    category: d.label,
    value: d.value,
    fill: d.color ?? "#38bdf8",
    id: `${d.key}-${i}`,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-slate-500">
        Sem dados neste recorte
      </div>
    );
  }

  if (viz === "table") {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    return (
      <div className="max-h-full overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[var(--panel)] text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">Item</th>
              <th className="px-2 py-1.5 font-medium text-right">Qtd</th>
              <th className="px-2 py-1.5 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.key} className="border-t border-slate-800/80">
                <td className="px-2 py-1.5 text-slate-200">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: row.color }} />
                  {row.label}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                  {formatNum(row.value)}
                  {unitSuffix}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                  {((row.value / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (viz === "pie") {
    const pieTotal = chartData.reduce((s, d) => s + d.value, 0);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="category" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
            {chartData.map((entry) => (
              <Cell key={entry.id} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip showPercent total={pieTotal} />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-[10px] text-slate-400">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const horizontal = viz === "hbar";
  const categoryTick = (props: {
    x?: number;
    y?: number;
    payload?: { value?: string | number };
    index?: number;
  }) => {
    const raw = props.payload?.value;
    const text =
      typeof raw === "string" && raw.length > 0
        ? raw
        : chartData[props.index ?? -1]?.category ?? String(raw ?? "");
    const x = props.x ?? 0;
    const y = props.y ?? 0;
    if (horizontal) {
      return (
        <text x={x} y={y} dy={4} textAnchor="end" fill="#94a3b8" fontSize={10}>
          {text.length > 22 ? `${text.slice(0, 20)}…` : text}
        </text>
      );
    }
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={12} dx={-4} textAnchor="end" fill="#64748b" fontSize={10} transform="rotate(-28)">
          {text.length > 18 ? `${text.slice(0, 16)}…` : text}
        </text>
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout={horizontal ? "vertical" : undefined}
        margin={{ top: 8, right: 12, left: horizontal ? 8 : 4, bottom: horizontal ? 4 : 12 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="category"
              width={128}
              interval={0}
              tick={categoryTick}
            />
          </>
        ) : (
          <>
            <XAxis
              type="category"
              dataKey="category"
              interval={0}
              height={58}
              tick={categoryTick}
            />
            <YAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
          </>
        )}
        <Tooltip
          content={
            <ChartTooltip
              showPercent
              total={chartData.reduce((s, d) => s + d.value, 0)}
            />
          }
        />
        <Bar dataKey="value" name="Quantidade" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.id} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TimelineChart({
  data,
  viz,
  height,
}: {
  data: { key: string; label: string; value: number; won?: number; lost?: number; open?: number; qualified?: number }[];
  viz: CrmReportViz;
  height: number;
}) {
  const chartData = data.map((d) => ({ ...d, category: d.label }));

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-slate-500">
        Sem entradas neste período
      </div>
    );
  }

  if (viz === "table") {
    return (
      <div className="max-h-full overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[var(--panel)] text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5">Período</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">Qualif.</th>
              <th className="px-2 py-1.5 text-right">Ganhos</th>
              <th className="px-2 py-1.5 text-right">Perdidos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.key} className="border-t border-slate-800/80">
                <td className="px-2 py-1.5 text-slate-200">{row.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{row.value}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-violet-300">{row.qualified ?? 0}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">{row.won ?? 0}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-rose-300">{row.lost ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (viz === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="category" dataKey="category" tick={{ fill: "#64748b", fontSize: 10 }} />
          <YAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend formatter={(v) => <span className="text-[10px] text-slate-400">{v}</span>} />
          <Bar dataKey="open" name="Abertos" stackId="a" fill="#38bdf8" />
          <Bar dataKey="won" name="Em curso" stackId="a" fill="#34d399" />
          <Bar dataKey="lost" name="Perdidos" stackId="a" fill="#f87171" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (viz === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="category" dataKey="category" tick={{ fill: "#64748b", fontSize: 10 }} />
          <YAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="value" name="Entradas" stroke="#38bdf8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="qualified" name="Qualificados" stroke="#a78bfa" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="crmAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis type="category" dataKey="category" tick={{ fill: "#64748b", fontSize: 10 }} />
        <YAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="value" name="Entradas" stroke="#38bdf8" fill="url(#crmAreaFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PanelShell({
  panel,
  editing,
  onChange,
  onRemove,
  onMove,
  children,
}: {
  panel: CrmReportPanel;
  editing: boolean;
  onChange: (next: CrmReportPanel) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  children: ReactNode;
}) {
  const meta = getPanelMeta(panel.type);
  const effectiveViz = panel.viz === "auto" ? meta.defaultViz : panel.viz;

  return (
    <div className={`flex flex-col rounded-xl border border-slate-800/80 bg-[var(--panel)] ${editing ? "ring-1 ring-sky-500/25" : ""}`}>
      <div className="flex items-center gap-2 border-b border-slate-800/80 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-200">{meta.label}</p>
          {!editing && <p className="truncate text-[10px] text-slate-600">{meta.description}</p>}
        </div>
        {editing && (
          <div className="flex flex-wrap items-center gap-1">
            <select
              value={panel.type}
              onChange={(e) => {
                const type = e.target.value as CrmReportPanelType;
                const nextMeta = getPanelMeta(type);
                onChange({
                  ...panel,
                  type,
                  viz: nextMeta.allowedViz.includes(panel.viz) ? panel.viz : nextMeta.defaultViz,
                  size: panel.size.h === 1 && nextMeta.defaultSize.h > 1 ? nextMeta.defaultSize : panel.size,
                });
              }}
              className={`${inputCls} max-w-[140px]`}
              title="Métrica"
            >
              {CRM_REPORT_PANEL_CATALOG.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={effectiveViz}
              onChange={(e) => onChange({ ...panel, viz: e.target.value as CrmReportViz })}
              className={inputCls}
              title="Visualização"
            >
              {meta.allowedViz.map((v) => (
                <option key={v} value={v}>
                  {v === "stat"
                    ? "KPI"
                    : v === "hbar"
                      ? "Barras ↔"
                      : v === "bar"
                        ? "Barras"
                        : v === "line"
                          ? "Linha"
                          : v === "area"
                            ? "Área"
                            : v === "pie"
                              ? "Rosca"
                              : "Tabela"}
                </option>
              ))}
            </select>
            <select
              value={`${panel.size.w}x${panel.size.h}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number) as [CrmReportPanelSize["w"], CrmReportPanelSize["h"]];
                onChange({ ...panel, size: { w, h } });
              }}
              className={inputCls}
              title="Tamanho"
            >
              <option value="3x1">Pequeno</option>
              <option value="4x1">KPI largo</option>
              <option value="4x2">1/3</option>
              <option value="6x2">1/2</option>
              <option value="8x2">2/3</option>
              <option value="12x2">Largo</option>
              <option value="12x3">Extra</option>
            </select>
            <button
              type="button"
              onClick={() => onMove(-1)}
              className="rounded-md border border-slate-700 px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-800"
              title="Mover para esquerda"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              className="rounded-md border border-slate-700 px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-800"
              title="Mover para direita"
            >
              →
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md border border-rose-900/60 px-1.5 py-1 text-[10px] text-rose-400 hover:bg-rose-950/40"
              title="Remover painel"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 p-3">{children}</div>
    </div>
  );
}

function AddPanelModal({ onAdd, onClose }: { onAdd: (type: CrmReportPanelType) => void; onClose: () => void }) {
  const categories = (["kpi", "funil", "qualificacao", "perda", "operacao"] as const).filter((cat) =>
    CRM_REPORT_PANEL_CATALOG.some((p) => p.category === cat),
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Adicionar painel</h2>
            <p className="text-xs text-slate-500">Escolha a métrica para um novo espaço no dashboard</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {CRM_REPORT_CATEGORY_LABELS[cat]}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CRM_REPORT_PANEL_CATALOG.filter((p) => p.category === cat).map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => onAdd(item.type)}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-left transition hover:border-sky-600/50 hover:bg-slate-900/60"
                  >
                    <p className="text-sm font-medium text-slate-100">{item.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{item.description}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CrmReportView({ leads, scoreRules, baseLeads }: Props) {
  const [panels, setPanels] = useState<CrmReportPanel[]>(() => loadReportLayout());
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [dateField, setDateField] = useState<CrmReportDateField>("funnelEnteredAt");
  const [fromDate, setFromDate] = useState(() => daysAgoIso(30));
  const [toDate, setToDate] = useState(() => todayIso());
  const [statuses, setStatuses] = useState<CrmStatus[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [lossReasons, setLossReasons] = useState<string[]>([]);
  const [referralSources, setReferralSources] = useState<string[]>([]);
  const [qualOnly, setQualOnly] = useState<"all" | "filled" | "pending">("all");
  const [includeLost, setIncludeLost] = useState(true);

  useEffect(() => {
    saveReportLayout(panels);
  }, [panels]);

  function applyPeriod(preset: PeriodPreset) {
    setPeriod(preset);
    if (preset === "custom") return;
    setToDate(todayIso());
    if (preset === "7d") setFromDate(daysAgoIso(7));
    else if (preset === "30d") setFromDate(daysAgoIso(30));
    else if (preset === "90d") setFromDate(daysAgoIso(90));
    else if (preset === "ytd") setFromDate(yearStartIso());
    else if (preset === "all") {
      setFromDate("");
      setToDate("");
    }
  }

  const dateFilter: CrmReportDateFilter = useMemo(
    () => ({ from: fromDate, to: toDate, field: dateField }),
    [fromDate, toDate, dateField],
  );

  const extraFilters: CrmReportExtraFilters = useMemo(
    () => ({
      statuses,
      courses,
      lossReasons,
      referralSources,
      qualOnly: qualOnly === "all" ? null : qualOnly === "filled",
      includeLost,
    }),
    [statuses, courses, lossReasons, referralSources, qualOnly, includeLost],
  );

  const reportLeads = useMemo(
    () => filterLeadsForReport(baseLeads, dateFilter, extraFilters),
    [baseLeads, dateFilter, extraFilters],
  );

  const granularity = useMemo(
    () => inferTimelineGranularity(fromDate || "2020-01-01", toDate || todayIso()),
    [fromDate, toDate],
  );

  const snapshot = useMemo(
    () => buildCrmReportSnapshot(reportLeads, scoreRules, dateFilter, { timelineGranularity: granularity }),
    [reportLeads, scoreRules, dateFilter, granularity],
  );

  const referralOptions = useMemo(() => collectReferralSources(leads), [leads]);
  const lossReasonOptions = useMemo(() => collectLossReasonsFromLeads(leads), [leads]);

  const activeFilterCount =
    (statuses.length > 0 ? 1 : 0) +
    (courses.length > 0 ? 1 : 0) +
    (lossReasons.length > 0 ? 1 : 0) +
    (referralSources.length > 0 ? 1 : 0) +
    (qualOnly !== "all" ? 1 : 0) +
    (!includeLost ? 1 : 0);

  function updatePanel(id: string, next: CrmReportPanel) {
    setPanels((prev) => prev.map((p) => (p.id === id ? next : p)));
  }

  function removePanel(id: string) {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }

  function movePanel(id: string, dir: -1 | 1) {
    setPanels((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item!);
      return copy;
    });
  }

  function addPanel(type: CrmReportPanelType) {
    setPanels((prev) => [...prev, createPanel(type)]);
    setAddOpen(false);
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="rounded-xl border border-slate-800/80 bg-[var(--panel)] p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Período</span>
            <div className="flex rounded-lg border border-slate-700 p-0.5">
              {(
                [
                  ["7d", "7d"],
                  ["30d", "30d"],
                  ["90d", "90d"],
                  ["ytd", "Ano"],
                  ["all", "Tudo"],
                  ["custom", "Custom"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPeriod(key)}
                  className={`rounded-md px-2 py-1 text-[11px] transition ${
                    period === key ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Data de</span>
            <select
              value={dateField}
              onChange={(e) => setDateField(e.target.value as CrmReportDateField)}
              className={inputCls}
            >
              <option value="funnelEnteredAt">Entrada no funil</option>
              <option value="createdAt">Criação do lead</option>
              <option value="qualFilledAt">Qualificação</option>
            </select>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">De</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPeriod("custom");
                setFromDate(e.target.value);
              }}
              className={inputCls}
            />
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Até</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPeriod("custom");
                setToDate(e.target.value);
              }}
              className={inputCls}
            />
          </div>

          <MultiSelect
            label="Status"
            options={CRM_STATUSES.map((s) => ({ value: s, label: CRM_STATUS_LABELS[s] }))}
            selected={statuses}
            onChange={(v) => setStatuses(v as CrmStatus[])}
          />
          <MultiSelect
            label="Curso"
            options={CRM_COURSE_OPTIONS.map((c) => ({ value: c, label: c }))}
            selected={courses}
            onChange={setCourses}
          />
          <MultiSelect
            label="Origem"
            options={referralOptions.map((r) => ({ value: r, label: r }))}
            selected={referralSources}
            onChange={setReferralSources}
          />
          <MultiSelect
            label="Motivo perda"
            options={lossReasonOptions.map((r) => ({ value: r, label: r }))}
            selected={lossReasons}
            onChange={setLossReasons}
          />

          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Qualificação</span>
            <select
              value={qualOnly}
              onChange={(e) => setQualOnly(e.target.value as typeof qualOnly)}
              className={inputCls}
            >
              <option value="all">Todas</option>
              <option value="filled">Preenchida</option>
              <option value="pending">Pendente</option>
            </select>
          </div>

          <label className="mb-1 flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={includeLost}
              onChange={(e) => setIncludeLost(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-500"
            />
            Incluir perdidos
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-[11px] tabular-nums text-slate-500">
              {reportLeads.length}
              <span className="text-slate-600">/{baseLeads.length} leads</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-sky-900/50 px-1.5 py-0.5 text-[10px] text-sky-300">
                  {activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                editing
                  ? "border-sky-600 bg-sky-950/40 text-sky-300"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {editing ? "Concluir layout" : "Editar layout"}
            </button>
            {editing && (
              <>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-500 transition"
                >
                  + Painel
                </button>
                <button
                  type="button"
                  onClick={() => setPanels(resetReportLayout())}
                  className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition"
                >
                  Resetar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip always visible summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {[
          { label: "Leads", value: snapshot.kpis.total, tone: "text-sky-300" },
          { label: "Conversão", value: `${snapshot.kpis.conversionRate.toFixed(1)}%`, tone: "text-emerald-300" },
          { label: "Qualif.", value: `${snapshot.kpis.qualRate.toFixed(1)}%`, tone: "text-violet-300" },
          { label: "Win rate", value: `${snapshot.kpis.closedWinRate.toFixed(1)}%`, tone: "text-emerald-300" },
          { label: "Perda", value: `${snapshot.kpis.lostRate.toFixed(1)}%`, tone: "text-rose-300" },
          { label: "Pipeline", value: snapshot.kpis.open, tone: "text-sky-300" },
          { label: "Score", value: snapshot.kpis.avgScore == null ? "—" : Math.round(snapshot.kpis.avgScore), tone: "text-amber-300" },
          { label: "FUPs", value: snapshot.kpis.overdueFups + snapshot.kpis.pendingFups, tone: snapshot.kpis.overdueFups > 0 ? "text-amber-300" : "text-slate-300" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-800/70 bg-slate-950/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-600">{item.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Dynamic grid */}
      {panels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-16 text-center">
          <p className="text-sm text-slate-400">Nenhum painel no dashboard</p>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setAddOpen(true);
            }}
            className="mt-3 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
          >
            Adicionar painel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-3">
          {panels.map((panel) => {
            const meta = getPanelMeta(panel.type);
            const viz = panel.viz === "auto" ? meta.defaultViz : panel.viz;
            const kpi = resolveKpi(panel.type, snapshot);
            const buckets = resolvePanelBuckets(panel.type, snapshot);
            const height = chartHeight(panel.size);

            return (
              <div key={panel.id} className={sizeClass(panel.size)}>
                {kpi && viz === "stat" ? (
                  <div className="h-full">
                    {editing ? (
                      <PanelShell
                        panel={panel}
                        editing={editing}
                        onChange={(next) => updatePanel(panel.id, next)}
                        onRemove={() => removePanel(panel.id)}
                        onMove={(dir) => movePanel(panel.id, dir)}
                      >
                        <StatPanel title={meta.label} kpi={kpi} compact />
                      </PanelShell>
                    ) : (
                      <StatPanel title={meta.label} kpi={kpi} />
                    )}
                  </div>
                ) : (
                  <PanelShell
                    panel={panel}
                    editing={editing}
                    onChange={(next) => updatePanel(panel.id, next)}
                    onRemove={() => removePanel(panel.id)}
                    onMove={(dir) => movePanel(panel.id, dir)}
                  >
                    {panel.type === "leads_timeline" ? (
                      <TimelineChart data={snapshot.timeline} viz={viz} height={height} />
                    ) : buckets ? (
                      <BucketChart
                        data={buckets}
                        viz={viz}
                        height={height}
                        unitSuffix={panel.type === "aging_by_status" ? "d" : ""}
                      />
                    ) : kpi ? (
                      <StatPanel title={meta.label} kpi={kpi} compact />
                    ) : (
                      <div className="text-xs text-slate-500">Painel indisponível</div>
                    )}
                  </PanelShell>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && <AddPanelModal onAdd={addPanel} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
