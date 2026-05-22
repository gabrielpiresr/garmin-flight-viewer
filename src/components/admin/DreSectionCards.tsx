import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import type { FinancialDreResponse, FinancialDreValueType } from "../../types/financialDre";

function fmt(value: number, type: FinancialDreValueType): string {
  if (type === "percent") return `${(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (type === "hours") return `${(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
  if (type === "number") return (value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Lines that are stored internally for snapshot purposes but should not appear as cards
const META_KEYS = new Set(["meta_flown_hours", "meta_fuel_liters"]);

// Seções em que valor crescendo é ruim (custos e deduções)
const COST_KEYS = new Set([
  "section_commercial_deductions",
  "section_variable_costs",
  "section_fixed_costs",
  "section_taxes",
]);

export function DreSectionCards({ dre }: { dre: FinancialDreResponse }) {
  const level1Lines = useMemo(() => dre.lines.filter((l) => l.level === 1 && !META_KEYS.has(l.key)), [dre.lines]);

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {level1Lines.map((line) => {
        const monthData = dre.months.map((m) => ({ name: m.label, value: line.values[m.key] ?? 0 }));
        const total = dre.months.reduce((sum, m) => sum + (line.values[m.key] ?? 0), 0);
        const last = dre.months.length >= 1 ? (line.values[dre.months[dre.months.length - 1].key] ?? 0) : 0;
        const prev = dre.months.length >= 2 ? (line.values[dre.months[dre.months.length - 2].key] ?? 0) : 0;
        const isCost = COST_KEYS.has(line.key);
        const trendUp = last > prev;
        const trendGood = dre.months.length >= 2 ? (isCost ? !trendUp : trendUp) : true;
        const color = trendGood ? "#10b981" : "#f43f5e";
        const gradId = `scard-grad-${line.key.replace(/_/g, "-")}`;

        return (
          <article key={line.key} className="flex flex-col rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <p className="truncate text-[10px] font-medium uppercase tracking-widest text-slate-500">{line.label}</p>
            <p className="mt-2 text-lg font-semibold leading-tight text-slate-100">{fmt(total, line.valueType)}</p>
            {dre.months.length >= 2 && (
              <p className="mt-1 text-xs" style={{ color }}>
                {trendUp ? "▲" : "▼"} {fmt(Math.abs(last - prev), line.valueType)} vs anterior
              </p>
            )}
            {dre.months.length >= 2 && (
              <div className="-mx-1 mt-3 h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthData} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      formatter={(v: number) => [fmt(v, line.valueType), line.label]}
                      labelFormatter={(label) => String(label)}
                      contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(51, 65, 85, 0.7)", color: "#e2e8f0", fontSize: 11, borderRadius: 6, backdropFilter: "blur(6px)", padding: "4px 8px" }}
                      cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }}
                      position={{ y: 2 }}
                      offset={8}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={color}
                      strokeWidth={1.5}
                      fill={`url(#${gradId})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
