import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinancialDreResponse } from "../../types/financialDre";

const C = {
  receita: "#10b981",
  custosVar: "#f43f5e",
  custosFixos: "#f97316",
  margemOper: "#60a5fa",
  ebitda: "#a78bfa",
  lucroLiq: "#34d399",
  horas: "#38bdf8",
  combustivel: "#fbbf24",
} as const;

const TOOLTIP_STYLE = { backgroundColor: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 12, borderRadius: 6 };
const AXIS_TICK = { fill: "#64748b", fontSize: 11 };
const GRID = { stroke: "#1e293b", strokeDasharray: "3 3" };

function fmtBRL(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtH(v: number) {
  return `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}
function fmtPct(v: number) {
  return `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
function fmtK(v: number) {
  return `R$${(v / 1000).toFixed(0)}k`;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </article>
  );
}

export function DreAnalytics({ dre }: { dre: FinancialDreResponse }) {
  const chartData = useMemo(() => {
    const months = dre.months;
    const lv = (key: string): Record<string, number> => dre.lines.find((l) => l.key === key)?.values ?? {};
    const cv = (key: string): Record<string, number> => dre.cards.find((c) => c.key === key)?.values ?? {};

    const rev = lv("section_revenue");
    const varCosts = lv("section_variable_costs");
    const fixedCosts = lv("section_fixed_costs");
    const opMargin = lv("section_operational_margin");
    const ebitda = lv("section_ebitda");
    const netProfit = lv("section_net_profit");
    // fuel_cost, meta_flown_hours and meta_fuel_liters are DRE lines — reliable even for closed months
    const fuelLine = lv("fuel_cost");
    const hoursLine = lv("meta_flown_hours");
    const litersLine = lv("meta_fuel_liters");
    const revPH = cv("revenue_per_hour");
    const costPH = cv("cost_per_hour");
    const resultPH = cv("result_per_hour");

    const label = (m: (typeof months)[number]) => m.label;
    const h = (m: (typeof months)[number]): number => hoursLine[m.key] ?? 0;

    return {
      revenueVsCosts: months.map((m) => ({
        name: label(m),
        Receita: rev[m.key] ?? 0,
        "Custos Var.": varCosts[m.key] ?? 0,
        "Custos Fixos": fixedCosts[m.key] ?? 0,
      })),
      margins: months.map((m) => {
        const r = rev[m.key] || 1;
        return {
          name: label(m),
          "Margem Op. %": +((opMargin[m.key] ?? 0) / r * 100).toFixed(1),
          "EBITDA %": +((ebitda[m.key] ?? 0) / r * 100).toFixed(1),
          "Margem Líq. %": +((netProfit[m.key] ?? 0) / r * 100).toFixed(1),
        };
      }),
      // fuel cost comes directly from the DRE line "fuel_cost"
      fuel: months.map((m) => ({
        name: label(m),
        Combustível: +(fuelLine[m.key] ?? 0).toFixed(2),
      })),
      hours: months.map((m) => ({
        name: label(m),
        "Horas Voadas": +h(m).toFixed(1),
      })),
      perHour: months.map((m) => ({
        name: label(m),
        "Receita/h": +(revPH[m.key] ?? 0).toFixed(2),
        "Custo/h": +Math.abs(costPH[m.key] ?? 0).toFixed(2),
        "Resultado/h": +(resultPH[m.key] ?? 0).toFixed(2),
        "Combustível/h": h(m) > 0 ? +((fuelLine[m.key] ?? 0) / h(m)).toFixed(2) : 0,
      })),
      // fuel consumption per hour: liters / hours (from meta_fuel_liters DRE line)
      fuelPerHourMonthly: months.map((m) => ({
        name: label(m),
        value: h(m) > 0 ? +((litersLine[m.key] ?? 0) / h(m)).toFixed(2) : 0,
      })),
      opMarginPH: months.map((m) => ({
        name: label(m),
        value: h(m) > 0 ? +((opMargin[m.key] ?? 0) / h(m)).toFixed(2) : 0,
      })),
      ebitdaPH: months.map((m) => ({
        name: label(m),
        value: h(m) > 0 ? +((ebitda[m.key] ?? 0) / h(m)).toFixed(2) : 0,
      })),
      netProfitPH: months.map((m) => ({
        name: label(m),
        value: h(m) > 0 ? +((netProfit[m.key] ?? 0) / h(m)).toFixed(2) : 0,
      })),
    };
  }, [dre]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        <h2 className="text-sm font-semibold text-slate-100">Análise de Desempenho</h2>
        <span className="text-xs text-slate-500">
          {dre.fromMonth} – {dre.toMonth}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Receita vs Custos por Mês" subtitle="Comparativo mensal de receita, custos variáveis e fixos">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.revenueVsCosts} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={fmtK} width={52} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar dataKey="Receita" fill={C.receita} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Custos Var." fill={C.custosVar} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Custos Fixos" fill={C.custosFixos} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolução de Margens" subtitle="Margem operacional, EBITDA e lucro líquido como % da receita">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData.margins} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} width={42} />
              <Tooltip formatter={(v: number) => fmtPct(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Line type="monotone" dataKey="Margem Op. %" stroke={C.margemOper} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="EBITDA %" stroke={C.ebitda} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Margem Líq. %" stroke={C.lucroLiq} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Custo de Combustível por Mês" subtitle="Abastecimentos / combustível — valor direto da DRE">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.fuel} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={fmtK} width={52} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="Combustível" fill={C.combustivel} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Horas Voadas por Mês" subtitle="Quantidade de horas de voo executadas no período">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.hours} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => `${v}h`} width={42} />
              <Tooltip formatter={(v: number) => fmtH(v)} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="Horas Voadas" fill={C.horas} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Métricas por Hora de Voo" subtitle="Receita, custo, resultado e combustível por hora voada">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData.perHour} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => `R$${v}`} width={56} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Line type="monotone" dataKey="Receita/h" stroke={C.receita} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Custo/h" stroke={C.custosVar} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Resultado/h" stroke={C.lucroLiq} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Combustível/h" stroke={C.combustivel} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Margem Operacional por Hora de Voo" subtitle="Resultado operacional gerado por cada hora voada">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData.opMarginPH} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="da-grad-op" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.margemOper} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.margemOper} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => `R$${v}`} width={56} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="value" name="Margem Op./h" stroke={C.margemOper} strokeWidth={2} fill="url(#da-grad-op)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="EBITDA por Hora de Voo" subtitle="EBITDA gerado por cada hora voada">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData.ebitdaPH} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="da-grad-ebitda" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.ebitda} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.ebitda} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => `R$${v}`} width={56} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="value" name="EBITDA/h" stroke={C.ebitda} strokeWidth={2} fill="url(#da-grad-ebitda)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lucro Líquido por Hora de Voo" subtitle="Lucro líquido gerado por cada hora voada">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData.netProfitPH} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="da-grad-net" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.lucroLiq} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.lucroLiq} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => `R$${v}`} width={56} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="value" name="Lucro Líq./h" stroke={C.lucroLiq} strokeWidth={2} fill="url(#da-grad-net)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Consumo de Combustível por Hora de Voo" subtitle="Litros abastecidos por hora voada — eficiência de abastecimento">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData.fuelPerHourMonthly} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="da-grad-fuelph" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.combustivel} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.combustivel} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => `${v} L`} width={52} />
              <Tooltip formatter={(v: number) => [`${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L/h`, "Consumo"]} contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="value" name="L/h" stroke={C.combustivel} strokeWidth={2} fill="url(#da-grad-fuelph)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
