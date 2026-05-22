import { useEffect, useMemo } from "react";
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

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1] ?? m} ${y}`;
}

function fmtBRL(v: number): string {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtH(v: number): string {
  return `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}
function fmtPct(v: number): string {
  return `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
function fmtK(v: number): string {
  return `R$${(v / 1000).toFixed(0)}k`;
}

const PRINT_CSS = `
@media print {
  body.dre-pres-active * { visibility: hidden !important; }
  body.dre-pres-active .dre-presentation,
  body.dre-pres-active .dre-presentation * { visibility: visible !important; }
  body.dre-pres-active .dre-presentation {
    position: fixed !important;
    top: 0 !important; left: 0 !important;
    width: 100% !important;
    background: white !important;
    z-index: 99999 !important;
    overflow: visible !important;
  }
  body.dre-pres-active .pres-slide {
    page-break-after: always;
    break-after: page;
    min-height: 100vh;
    overflow: hidden;
  }
  body.dre-pres-active .pres-no-print { display: none !important; }
  @page { margin: 0; size: A4; }
}
`;

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function SlideHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
        {number}
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function SlideFooter({ period }: { period: string }) {
  return (
    <div className="mt-auto border-t border-slate-100 pt-4 text-[10px] text-slate-400">
      <div className="flex items-center justify-between">
        <span>Escola de Aviação · Relatório de Desempenho Financeiro</span>
        <span>{period}</span>
      </div>
    </div>
  );
}

function Slide({ children, noPadTop }: { children: React.ReactNode; noPadTop?: boolean }) {
  return (
    <div className={`pres-slide flex min-h-screen flex-col bg-white ${noPadTop ? "" : "p-10"}`}>
      {children}
    </div>
  );
}

export function DrePresentation({ dre, onClose }: { dre: FinancialDreResponse; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add("dre-pres-active");
    return () => document.body.classList.remove("dre-pres-active");
  }, []);

  const data = useMemo(() => {
    const lv = (key: string): Record<string, number> => dre.lines.find((l) => l.key === key)?.values ?? {};
    const cv = (key: string): Record<string, number> => dre.cards.find((c) => c.key === key)?.values ?? {};
    const card = (key: string) => dre.cards.find((c) => c.key === key);

    const rev = lv("section_revenue");
    const deduc = lv("section_commercial_deductions");
    const varCosts = lv("section_variable_costs");
    const fixedCosts = lv("section_fixed_costs");
    const opMargin = lv("section_operational_margin");
    const ebitda = lv("section_ebitda");
    const taxes = lv("section_taxes");
    const netProfit = lv("section_net_profit");
    const fuelLine = lv("fuel_cost");
    // meta_flown_hours is a DRE line saved in closed snapshots — reliable source for hours
    const hoursLine = lv("meta_flown_hours");
    const revPH = cv("revenue_per_hour");
    const resultPH = cv("result_per_hour");

    const sum = (vals: Record<string, number>) =>
      dre.months.reduce((acc, m) => acc + (vals[m.key] ?? 0), 0);

    const totalRevenue = sum(rev);
    const totalEbitda = sum(ebitda);
    const totalNet = sum(netProfit);
    const totalHours = sum(hoursLine);
    const avgRevPH = card("revenue_per_hour")?.total ?? 0;
    const netMarginPct = totalRevenue > 0 ? (totalNet / totalRevenue) * 100 : 0;

    const monthLabel2 = (m: (typeof dre.months)[number]) => m.label;
    const h = (m: (typeof dre.months)[number]) => hoursLine[m.key] ?? 0;

    const revenueTimeline = dre.months.map((m) => ({
      name: monthLabel2(m),
      value: rev[m.key] ?? 0,
    }));

    const costsTimeline = dre.months.map((m) => ({
      name: monthLabel2(m),
      "Custos Variáveis": varCosts[m.key] ?? 0,
      "Custos Fixos": fixedCosts[m.key] ?? 0,
    }));

    const perHourTimeline = dre.months.map((m) => ({
      name: monthLabel2(m),
      "Receita/h": +(h(m) > 0 ? (rev[m.key] ?? 0) / h(m) : 0).toFixed(2),
      "EBITDA/h": +(h(m) > 0 ? (ebitda[m.key] ?? 0) / h(m) : 0).toFixed(2),
      "Lucro Líq./h": +(h(m) > 0 ? (netProfit[m.key] ?? 0) / h(m) : 0).toFixed(2),
    }));

    const level1Lines = dre.lines.filter((l) => l.level === 1 && !["section_cash_revenue", "section_asset_variation", "meta_flown_hours", "meta_fuel_liters"].includes(l.key));

    const bestRevenueMonth = dre.months.length > 0
      ? dre.months.reduce((best, m) => (rev[m.key] ?? 0) > (rev[best.key] ?? 0) ? m : best, dre.months[0])
      : null;
    const bestMarginMonth = dre.months.length > 0
      ? dre.months.reduce((best, m) => {
          const r = rev[m.key] || 1;
          const curPct = (opMargin[m.key] ?? 0) / r;
          const bestPct = (opMargin[best.key] ?? 0) / (rev[best.key] || 1);
          return curPct > bestPct ? m : best;
        }, dre.months[0])
      : null;
    const bestNetMonth = dre.months.length > 0
      ? dre.months.reduce((best, m) => (netProfit[m.key] ?? 0) > (netProfit[best.key] ?? 0) ? m : best, dre.months[0])
      : null;

    const half = Math.floor(dre.months.length / 2);
    const firstHalfAvgRev = half > 0
      ? dre.months.slice(0, half).reduce((acc, m) => acc + (rev[m.key] ?? 0), 0) / half
      : 0;
    const secondHalfAvgRev = half > 0
      ? dre.months.slice(-half).reduce((acc, m) => acc + (rev[m.key] ?? 0), 0) / half
      : 0;
    const revTrendUp = secondHalfAvgRev > firstHalfAvgRev;

    const firstHalfAvgNet = half > 0
      ? dre.months.slice(0, half).reduce((acc, m) => acc + (netProfit[m.key] ?? 0), 0) / half
      : 0;
    const secondHalfAvgNet = half > 0
      ? dre.months.slice(-half).reduce((acc, m) => acc + (netProfit[m.key] ?? 0), 0) / half
      : 0;
    const netTrendUp = secondHalfAvgNet > firstHalfAvgNet;

    // Avg per-hour for summary table (slide 7)
    const avgRevPerH = dre.months.length > 0
      ? dre.months.reduce((acc, m) => acc + (revPH[m.key] ?? 0), 0) / dre.months.length
      : 0;
    const avgEbitdaPerH = dre.months.length > 0
      ? dre.months.reduce((acc, m) => {
          const hrs = h(m);
          return acc + (hrs > 0 ? (ebitda[m.key] ?? 0) / hrs : 0);
        }, 0) / dre.months.length
      : 0;
    const avgNetPerH = dre.months.length > 0
      ? dre.months.reduce((acc, m) => acc + (resultPH[m.key] ?? 0), 0) / dre.months.length
      : 0;
    // avgFuelPerH from DRE lines (fuel_cost / total_hours) — works for closed months too
    const totalFuelCost = sum(fuelLine);
    const avgFuelPerH = totalHours > 0 ? totalFuelCost / totalHours : 0;

    const period = `${monthLabel(dre.fromMonth)} – ${monthLabel(dre.toMonth)}`;

    return {
      totalRevenue, totalEbitda, totalNet, totalHours, avgRevPH, netMarginPct,
      revenueTimeline, costsTimeline, perHourTimeline, level1Lines,
      bestRevenueMonth, bestMarginMonth, bestNetMonth,
      revTrendUp, netTrendUp, secondHalfAvgRev, firstHalfAvgRev,
      secondHalfAvgNet, firstHalfAvgNet,
      avgRevPerH, avgEbitdaPerH, avgNetPerH, avgFuelPerH,
      period, rev, opMargin, netProfit,
      deduc, varCosts, fixedCosts, ebitda, taxes,
      level2Lines: dre.lines.filter((l) => l.level === 2),
    };
  }, [dre]);

  const LIGHT_GRID = { stroke: "#e2e8f0", strokeDasharray: "3 3" };
  const LIGHT_AXIS = { fill: "#64748b", fontSize: 11 };
  const LIGHT_TOOLTIP = { backgroundColor: "#fff", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 12, borderRadius: 6 };

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* Modal backdrop */}
      <div className="dre-presentation fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950">
        {/* Toolbar */}
        <div className="pres-no-print flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Apresentação para Investidores</p>
            <p className="text-xs text-slate-500">{data.period} · {dre.months.length} {dre.months.length === 1 ? "mês" : "meses"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
              Imprimir / Salvar PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Slides scrollable area */}
        <div className="flex-1 overflow-y-auto bg-slate-200 p-6">
          <div className="mx-auto max-w-4xl space-y-6">

            {/* ─── SLIDE 1: CAPA ─── */}
            <Slide noPadTop>
              <div className="relative flex min-h-screen flex-col overflow-hidden">
                {/* Header bar */}
                <div className="bg-emerald-600 px-12 py-8">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-white">
                        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-100 uppercase tracking-widest">Escola de Aviação</p>
                      <p className="text-[11px] text-emerald-200">Gestão & Desempenho Financeiro</p>
                    </div>
                  </div>
                </div>

                {/* Main content */}
                <div className="flex flex-1 flex-col items-start justify-center px-12 py-16 bg-gradient-to-br from-white to-slate-50">
                  <div className="max-w-xl">
                    <div className="mb-6 inline-flex rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      CONFIDENCIAL · USO INTERNO
                    </div>
                    <h1 className="text-4xl font-extrabold leading-tight text-slate-800">
                      Relatório de Desempenho Financeiro
                    </h1>
                    <p className="mt-4 text-xl font-medium text-slate-500">{data.period}</p>

                    <div className="mt-10 grid grid-cols-3 gap-4">
                      <div className="rounded-lg bg-emerald-50 p-4 text-center ring-1 ring-emerald-100">
                        <p className="text-2xl font-bold text-emerald-700">{fmtH(data.totalHours)}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Horas Voadas</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-4 text-center ring-1 ring-blue-100">
                        <p className="text-2xl font-bold text-blue-700">{dre.months.length}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Meses Analisados</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-4 text-center ring-1 ring-slate-200">
                        <p className="text-2xl font-bold text-slate-700">{fmtPct(data.netMarginPct)}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Margem Líquida</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 bg-white px-12 py-4">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Gerado em {new Date(dre.generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
                    <span>Este documento contém informações confidenciais. Não distribua sem autorização.</span>
                  </div>
                </div>
              </div>
            </Slide>

            {/* ─── SLIDE 2: SUMÁRIO EXECUTIVO ─── */}
            <Slide>
              <SlideHeader number="02" title="Sumário Executivo" subtitle={`Principais indicadores do período ${data.period}`} />

              <div className="grid grid-cols-3 gap-4">
                <Kpi label="Receita Total" value={fmtBRL(data.totalRevenue)} sub={`${dre.months.length > 0 ? fmtBRL(data.totalRevenue / dre.months.length) : "–"} / mês`} />
                <Kpi label="EBITDA" value={fmtBRL(data.totalEbitda)} sub={data.totalRevenue > 0 ? `${fmtPct((data.totalEbitda / data.totalRevenue) * 100)} da receita` : undefined} />
                <Kpi label="Lucro Líquido" value={fmtBRL(data.totalNet)} sub={`Margem: ${fmtPct(data.netMarginPct)}`} />
                <Kpi label="Horas Voadas" value={fmtH(data.totalHours)} sub={`${dre.months.length > 0 ? fmtH(data.totalHours / dre.months.length) : "–"} / mês`} />
                <Kpi label="Receita por Hora" value={fmtBRL(data.avgRevPH)} sub="Média do período" />
                <Kpi label="Margem Líquida" value={fmtPct(data.netMarginPct)} sub="% sobre a receita bruta" />
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-700">Destaques do Período</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {data.bestRevenueMonth && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-emerald-500">✓</span>
                      <span>Melhor mês em receita: <strong>{data.bestRevenueMonth.label}</strong> com {fmtBRL(data.rev[data.bestRevenueMonth.key] ?? 0)}</span>
                    </li>
                  )}
                  {data.bestMarginMonth && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-emerald-500">✓</span>
                      <span>Melhor margem operacional: <strong>{data.bestMarginMonth.label}</strong> ({fmtPct(((data.opMargin[data.bestMarginMonth.key] ?? 0) / (data.rev[data.bestMarginMonth.key] || 1)) * 100)})</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className={`mt-0.5 ${data.revTrendUp ? "text-emerald-500" : "text-red-500"}`}>{data.revTrendUp ? "▲" : "▼"}</span>
                    <span>
                      Tendência de receita: {data.revTrendUp ? "crescente" : "decrescente"} —{" "}
                      média da 2ª metade do período ({fmtBRL(data.secondHalfAvgRev)}) vs 1ª metade ({fmtBRL(data.firstHalfAvgRev)})
                    </span>
                  </li>
                </ul>
              </div>

              <SlideFooter period={data.period} />
            </Slide>

            {/* ─── SLIDE 3: DRE COMPLETA ─── */}
            <Slide>
              <SlideHeader number="03" title="Demonstração do Resultado do Exercício" subtitle="Visão consolidada por seção e período" />

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-48">Seção</th>
                      {dre.months.map((m) => (
                        <th key={m.key} className="px-4 py-3 text-right text-xs font-semibold text-slate-700 min-w-32">{m.label}</th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 min-w-32 bg-emerald-50">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.level1Lines.map((line) => {
                      const total = dre.months.reduce((acc, m) => acc + (line.values[m.key] ?? 0), 0);
                      const isPositive = total >= 0;
                      const isCostSection = ["section_commercial_deductions", "section_variable_costs", "section_fixed_costs", "section_taxes"].includes(line.key);
                      const isHighlight = ["section_operational_margin", "section_ebitda", "section_net_profit"].includes(line.key);
                      return (
                        <tr key={line.key} className={`border-b border-slate-100 ${isHighlight ? "bg-emerald-50/50 font-semibold" : ""}`}>
                          <td className="px-4 py-2.5 text-sm text-slate-700">{line.label}</td>
                          {dre.months.map((m) => {
                            const v = line.values[m.key] ?? 0;
                            return (
                              <td key={m.key} className={`px-4 py-2.5 text-right text-sm ${
                                v >= 0 && !isCostSection ? "text-slate-800" : v < 0 || isCostSection && v > 0 ? "text-slate-700" : "text-slate-800"
                              }`}>
                                {fmtBRL(v)}
                              </td>
                            );
                          })}
                          <td className={`px-4 py-2.5 text-right text-sm font-semibold bg-emerald-50 ${isPositive && !isCostSection ? "text-emerald-700" : "text-slate-700"}`}>
                            {fmtBRL(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                <strong>Nota:</strong> A DRE é calculada pelo regime de competência. Margem Operacional = Receita − Deduções − Custos Variáveis. EBITDA = Margem Operacional − Custos Fixos. Lucro Líquido = EBITDA − Impostos.
              </div>

              <SlideFooter period={data.period} />
            </Slide>

            {/* ─── SLIDE 4: DRE DETALHADA ─── */}
            <Slide>
              <SlideHeader number="04" title="DRE Detalhada — Receita e Custos Variáveis" subtitle="Breakdown por subcategoria das principais linhas" />

              {["section_revenue", "section_variable_costs"].map((parentKey) => {
                const parent = data.level1Lines.find((l) => l.key === parentKey);
                if (!parent) return null;
                const children = data.level2Lines.filter((l) => l.parentKey === parentKey);
                return (
                  <div key={parentKey} className="mb-6">
                    <div className="rounded-t-xl bg-emerald-600 px-4 py-2.5">
                      <p className="text-sm font-bold text-white">{parent.label}</p>
                    </div>
                    <div className="overflow-x-auto rounded-b-xl border border-t-0 border-slate-200">
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 min-w-48">Linha</th>
                            {dre.months.map((m) => (
                              <th key={m.key} className="px-4 py-2 text-right text-xs font-semibold text-slate-600 min-w-28">{m.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {children.map((line) => (
                            <tr key={line.key} className="border-b border-slate-100">
                              <td className="px-4 py-2 text-xs text-slate-600 pl-6">{line.label}</td>
                              {dre.months.map((m) => (
                                <td key={m.key} className="px-4 py-2 text-right text-xs text-slate-700">
                                  {fmtBRL(line.values[m.key] ?? 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr className="border-b border-slate-200 bg-emerald-50">
                            <td className="px-4 py-2 text-xs font-bold text-emerald-800">Total {parent.label}</td>
                            {dre.months.map((m) => (
                              <td key={m.key} className="px-4 py-2 text-right text-xs font-bold text-emerald-800">
                                {fmtBRL(parent.values[m.key] ?? 0)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <SlideFooter period={data.period} />
            </Slide>

            {/* ─── SLIDE 5: EVOLUÇÃO DE RECEITA ─── */}
            <Slide>
              <SlideHeader number="05" title="Evolução de Receita" subtitle="Desempenho mensal de receita ao longo do período" />

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.revenueTimeline} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <defs>
                      <linearGradient id="pres-grad-rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...LIGHT_GRID} />
                    <XAxis dataKey="name" tick={LIGHT_AXIS} />
                    <YAxis tick={LIGHT_AXIS} tickFormatter={fmtK} width={60} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={LIGHT_TOOLTIP} labelStyle={{ fontWeight: 600 }} />
                    <Area type="monotone" dataKey="value" name="Receita" stroke="#059669" strokeWidth={2.5} fill="url(#pres-grad-rev)" dot={{ r: 4, fill: "#059669", strokeWidth: 0 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-100">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Receita Total</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">{fmtBRL(data.totalRevenue)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center ring-1 ring-slate-200">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Média Mensal</p>
                  <p className="mt-1 text-xl font-bold text-slate-700">
                    {fmtBRL(dre.months.length > 0 ? data.totalRevenue / dre.months.length : 0)}
                  </p>
                </div>
                {data.bestRevenueMonth && (
                  <div className="rounded-xl bg-blue-50 p-4 text-center ring-1 ring-blue-100">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Melhor Mês</p>
                    <p className="mt-1 text-xl font-bold text-blue-700">{data.bestRevenueMonth.label}</p>
                    <p className="text-xs text-slate-500">{fmtBRL(data.rev[data.bestRevenueMonth.key] ?? 0)}</p>
                  </div>
                )}
              </div>

              <SlideFooter period={data.period} />
            </Slide>

            {/* ─── SLIDE 6: ANÁLISE DE CUSTOS ─── */}
            <Slide>
              <SlideHeader number="06" title="Análise de Custos" subtitle="Composição e evolução mensal dos custos operacionais" />

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.costsTimeline} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid {...LIGHT_GRID} />
                    <XAxis dataKey="name" tick={LIGHT_AXIS} />
                    <YAxis tick={LIGHT_AXIS} tickFormatter={fmtK} width={60} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={LIGHT_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#475569" }} />
                    <Bar dataKey="Custos Variáveis" stackId="a" fill="#f43f5e" isAnimationActive={false} />
                    <Bar dataKey="Custos Fixos" stackId="a" fill="#f97316" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Custos Variáveis</p>
                  <p className="mt-1 text-xl font-bold text-rose-600">
                    {fmtBRL(dre.months.reduce((acc, m) => acc + (data.varCosts[m.key] ?? 0), 0))}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {fmtPct(data.totalRevenue > 0 ? (dre.months.reduce((acc, m) => acc + (data.varCosts[m.key] ?? 0), 0) / data.totalRevenue) * 100 : 0)} da receita
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Custos Fixos</p>
                  <p className="mt-1 text-xl font-bold text-orange-600">
                    {fmtBRL(dre.months.reduce((acc, m) => acc + (data.fixedCosts[m.key] ?? 0), 0))}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {fmtPct(data.totalRevenue > 0 ? (dre.months.reduce((acc, m) => acc + (data.fixedCosts[m.key] ?? 0), 0) / data.totalRevenue) * 100 : 0)} da receita
                  </p>
                </div>
              </div>

              <SlideFooter period={data.period} />
            </Slide>

            {/* ─── SLIDE 7: RENTABILIDADE POR HORA ─── */}
            <Slide>
              <SlideHeader number="07" title="Rentabilidade por Hora de Voo" subtitle="Indicadores de eficiência operacional por hora voada" />

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.perHourTimeline} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid {...LIGHT_GRID} />
                    <XAxis dataKey="name" tick={LIGHT_AXIS} />
                    <YAxis tick={LIGHT_AXIS} tickFormatter={(v) => `R$${v}`} width={64} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={LIGHT_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#475569" }} />
                    <Line type="monotone" dataKey="Receita/h" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="EBITDA/h" stroke="#7c3aed" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="Lucro Líq./h" stroke="#0284c7" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Métrica</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">Média do Período</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">Interpretação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700">Receita por Hora</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-700">{fmtBRL(data.avgRevPerH)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">Faturamento gerado por hora de voo</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700">EBITDA por Hora</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-violet-700">{fmtBRL(data.avgEbitdaPerH)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">Resultado operacional antes de impostos</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700">Lucro Líquido por Hora</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-sky-700">{fmtBRL(data.avgNetPerH)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">Ganho líquido após impostos</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700">Combustível por Hora</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-amber-700">{fmtBRL(data.avgFuelPerH)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">Custo médio de combustível / hora</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <SlideFooter period={data.period} />
            </Slide>

            {/* ─── SLIDE 8: CONCLUSÃO E DESTAQUES ─── */}
            <Slide>
              <SlideHeader number="08" title="Conclusão e Destaques" subtitle="Análise de tendências e pontos de atenção" />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Melhores Resultados</h3>
                  {data.bestRevenueMonth && (
                    <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-lg">📈</div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">Maior Receita</p>
                        <p className="text-sm font-bold text-emerald-700">{data.bestRevenueMonth.label}</p>
                        <p className="text-xs text-slate-500">{fmtBRL(data.rev[data.bestRevenueMonth.key] ?? 0)}</p>
                      </div>
                    </div>
                  )}
                  {data.bestMarginMonth && (
                    <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-lg">🎯</div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">Maior Margem Op.</p>
                        <p className="text-sm font-bold text-blue-700">{data.bestMarginMonth.label}</p>
                        <p className="text-xs text-slate-500">{fmtPct(((data.opMargin[data.bestMarginMonth.key] ?? 0) / (data.rev[data.bestMarginMonth.key] || 1)) * 100)}</p>
                      </div>
                    </div>
                  )}
                  {data.bestNetMonth && (
                    <div className="flex items-center gap-3 rounded-xl bg-violet-50 p-4 ring-1 ring-violet-100">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-lg">💰</div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">Maior Lucro Líquido</p>
                        <p className="text-sm font-bold text-violet-700">{data.bestNetMonth.label}</p>
                        <p className="text-xs text-slate-500">{fmtBRL(data.netProfit[data.bestNetMonth.key] ?? 0)}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Análise de Tendências</h3>
                  <div className={`rounded-xl p-4 ring-1 ${data.revTrendUp ? "bg-emerald-50 ring-emerald-100" : "bg-red-50 ring-red-100"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xl ${data.revTrendUp ? "text-emerald-500" : "text-red-500"}`}>{data.revTrendUp ? "▲" : "▼"}</span>
                      <p className={`text-sm font-semibold ${data.revTrendUp ? "text-emerald-700" : "text-red-700"}`}>
                        Receita {data.revTrendUp ? "em crescimento" : "em queda"}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      2ª metade: {fmtBRL(data.secondHalfAvgRev)}/mês · 1ª metade: {fmtBRL(data.firstHalfAvgRev)}/mês
                    </p>
                  </div>
                  <div className={`rounded-xl p-4 ring-1 ${data.netTrendUp ? "bg-emerald-50 ring-emerald-100" : "bg-amber-50 ring-amber-100"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xl ${data.netTrendUp ? "text-emerald-500" : "text-amber-500"}`}>{data.netTrendUp ? "▲" : "▼"}</span>
                      <p className={`text-sm font-semibold ${data.netTrendUp ? "text-emerald-700" : "text-amber-700"}`}>
                        Lucro líquido {data.netTrendUp ? "em crescimento" : "requer atenção"}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      2ª metade: {fmtBRL(data.secondHalfAvgNet)}/mês · 1ª metade: {fmtBRL(data.firstHalfAvgNet)}/mês
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <p className="text-xs font-semibold text-slate-600">Resumo do Período</p>
                    <p className="mt-1 text-xs text-slate-500">
                      A escola gerou <strong className="text-slate-700">{fmtBRL(data.totalRevenue)}</strong> em receita,
                      com EBITDA de <strong className="text-slate-700">{fmtBRL(data.totalEbitda)}</strong> e lucro líquido de{" "}
                      <strong className="text-slate-700">{fmtBRL(data.totalNet)}</strong>,
                      totalizando <strong className="text-slate-700">{fmtH(data.totalHours)}</strong> de voo no período.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-auto border-t border-slate-200 pt-4">
                <p className="text-center text-[10px] text-slate-400">
                  Este relatório é <strong>confidencial</strong> e destinado exclusivamente aos investidores e gestores da Escola de Aviação.
                  Proibida a reprodução ou distribuição sem autorização expressa. · Gerado em{" "}
                  {new Date(dre.generatedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </Slide>

          </div>
        </div>
      </div>
    </>
  );
}
