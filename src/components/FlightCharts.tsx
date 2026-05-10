import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
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
      return new Date(chartTimeBaseMs + v).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
        second: "2-digit",
      });
    } catch {
      return String(v);
    }
  }
  return `#${Math.round(v)}`;
}

type Props = {
  chartData: ChartRow[];
  hasTime: boolean;
  /** Epoch ms do primeiro instante; somar a `row.x` para horário no eixo. */
  chartTimeBaseMs: number | null;
  /** Mapeamento chave interna → nome da coluna no CSV */
  resolved: Record<string, string>;
};

export function FlightCharts({ chartData, hasTime, chartTimeBaseMs, resolved }: Props) {
  const resolvedMap = new Map(Object.entries(resolved));
  const sortedData = useMemo(
    () => [...chartData].sort((a, b) => (a.x === b.x ? 0 : a.x < b.x ? -1 : 1)),
    [chartData],
  );
  const panels = TELEMETRY_PANELS.filter((p) => panelHasData(p, sortedData, resolvedMap));

  if (sortedData.length === 0) {
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

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-medium text-slate-100">Telemetria</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        {panels.map((panel) => {
          const keys = panel.seriesKeys.filter((k) => resolvedMap.has(k));
          return (
            <div key={panel.id} className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
              <h3 className="mb-1 text-sm font-medium text-slate-200">{panel.title}</h3>
              <p className="mb-2 text-xs text-slate-500">{panel.yUnit}</p>
              <div className="h-56 w-full md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sortedData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      scale="linear"
                      domain={["dataMin", "dataMax"]}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickFormatter={(v) => formatX(Number(v), hasTime, chartTimeBaseMs)}
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      domain={["auto", "auto"]}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
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
                      formatter={(value) => <span className="text-slate-400">{labelForKey(value)}</span>}
                    />
                    {keys.map((k) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={k}
                        stroke={colorForKey(k)}
                        strokeWidth={1.75}
                        dot={false}
                        connectNulls
                        isAnimationActive={sortedData.length < 4000}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
