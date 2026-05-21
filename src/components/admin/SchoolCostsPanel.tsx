import { useCallback, useEffect, useState } from "react";
import { getSchoolCosts, saveSchoolCosts } from "../../lib/schoolCostsDb";
import {
  defaultSchoolCosts,
  defaultTaxConfig,
  STUDENT_PAYMENT_METHODS,
  type ManualDreLine,
  type ManualDreMonthlyValue,
  type PaymentMethodCost,
  type ProfitDeductions,
  type SchoolCosts,
  type TaxConfig,
} from "../../types/costs";
import { DRE_LEVEL1_SECTIONS } from "../../types/financialDre";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Nunca salvo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function parseCurrency(value: string): number {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseSignedCurrency(value: string): number {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function parsePercent(value: string): number {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function CurrencyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-800 focus-within:border-emerald-500">
        <span className="flex items-center border-r border-slate-700 px-3 text-sm text-slate-400">R$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none"
        />
      </div>
    </label>
  );
}

function SignedCurrencyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-800 focus-within:border-emerald-500">
        <span className="flex items-center border-r border-slate-700 px-3 text-sm text-slate-400">R$</span>
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none"
        />
      </div>
    </label>
  );
}

function SignedCurrencyCommitInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-800 focus-within:border-emerald-500">
        <span className="flex items-center border-r border-slate-700 px-3 text-sm text-slate-400">R$</span>
        <input
          type="number"
          step="0.01"
          defaultValue={String(value)}
          onBlur={(e) => onCommit(parseSignedCurrency(e.target.value))}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none"
        />
      </div>
    </label>
  );
}

function PercentInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-800 focus-within:border-emerald-500">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none"
        />
        <span className="flex items-center border-l border-slate-700 px-3 text-sm text-slate-400">%</span>
      </div>
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-emerald-600" : "bg-slate-700"}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </div>
      <span className="text-xs text-slate-300">{label}</span>
    </label>
  );
}

const DEDUCTION_ITEMS: { key: keyof ProfitDeductions; label: string }[] = [
  { key: "aircraftCosts", label: "Custos das aeronaves" },
  { key: "fuelCosts", label: "Custo de combustível" },
  { key: "instructorTransfer", label: "Repasse ao instrutor" },
  { key: "paymentMethodFees", label: "Taxa para recebimento" },
  { key: "workOrderCosts", label: "Custos com OS (ordens de serviço)" },
];

type MethodDraft = { fixedCost: string; percentCost: string };
type PaymentDrafts = Record<string, MethodDraft>;
type ManualLineDraft = { name: string; defaultAmount: string; sectionKey: string };

function costsToMethodDrafts(costs: SchoolCosts): PaymentDrafts {
  const drafts: PaymentDrafts = {};
  for (const method of STUDENT_PAYMENT_METHODS) {
    const entry = costs.paymentMethodCosts[method] ?? { fixedCost: 0, percentCost: 0 };
    drafts[method] = { fixedCost: String(entry.fixedCost), percentCost: String(entry.percentCost) };
  }
  return drafts;
}

function SettingsSkeleton() {
  return (
    <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <Skeleton className="h-5 w-48" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    </section>
  );
}

function emptyManualLineDraft(): ManualLineDraft {
  return { name: "", defaultAmount: "0", sectionKey: DRE_LEVEL1_SECTIONS[0]?.key ?? "section_revenue" };
}

export function SchoolCostsPanel() {
  const { user: authUser } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTax, setSavingTax] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [enrollmentCost, setEnrollmentCost] = useState("0");
  const [methodDrafts, setMethodDrafts] = useState<PaymentDrafts>(() => costsToMethodDrafts(defaultSchoolCosts()));
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(() => defaultTaxConfig());
  const [taxRates, setTaxRates] = useState({ revenue: "0", grossProfit: "0", netProfit: "0" });
  const [manualDreLines, setManualDreLines] = useState<ManualDreLine[]>([]);
  const [manualDreValues, setManualDreValues] = useState<ManualDreMonthlyValue>({});
  const [manualDraft, setManualDraft] = useState<ManualLineDraft>(() => emptyManualLineDraft());
  const [savingManual, setSavingManual] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const costs = await getSchoolCosts();
      setUpdatedAt(costs.updatedAt);
      setEnrollmentCost(String(costs.enrollmentCost));
      setMethodDrafts(costsToMethodDrafts(costs));
      setTaxConfig(costs.taxConfig);
      setManualDreLines(costs.manualDreLines);
      setManualDreValues(costs.manualDreValues);
      setTaxRates({
        revenue: String(costs.taxConfig.revenueRatePercent),
        grossProfit: String(costs.taxConfig.grossProfitRatePercent),
        netProfit: String(costs.taxConfig.netProfitRatePercent),
      });
    } catch {
      showToast({ message: "Erro ao carregar configurações de custo.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateMethodDraft(method: string, field: "fixedCost" | "percentCost", value: string) {
    setMethodDrafts((prev) => ({ ...prev, [method]: { ...prev[method]!, [field]: value } }));
  }

  function buildPaymentMethodCosts(): SchoolCosts["paymentMethodCosts"] {
    return Object.fromEntries(
      STUDENT_PAYMENT_METHODS.map((method) => {
        const draft = methodDrafts[method] ?? { fixedCost: "0", percentCost: "0" };
        return [
          method,
          {
            fixedCost: parseCurrency(draft.fixedCost),
            percentCost: parsePercent(draft.percentCost),
          } satisfies PaymentMethodCost,
        ];
      }),
    ) as SchoolCosts["paymentMethodCosts"];
  }

  function buildTaxConfig(): TaxConfig {
    return {
      revenueRatePercent: parsePercent(taxRates.revenue),
      grossProfitRatePercent: parsePercent(taxRates.grossProfit),
      netProfitRatePercent: parsePercent(taxRates.netProfit),
      grossProfitDeductions: taxConfig.grossProfitDeductions,
      netProfitDeductions: taxConfig.netProfitDeductions,
    };
  }

  function buildSchoolCostsPayload() {
    return {
      enrollmentCost: parseCurrency(enrollmentCost),
      paymentMethodCosts: buildPaymentMethodCosts(),
      taxConfig: buildTaxConfig(),
      manualDreLines,
      manualDreValues,
    };
  }

  async function handleSave() {
    if (!authUser) return;
    setSaving(true);
    try {
      const saved = await saveSchoolCosts(
        buildSchoolCostsPayload(),
        authUser.id,
      );
      setUpdatedAt(saved.updatedAt);
      showToast({ message: "Configurações de custo salvas.", variant: "success" });
    } catch {
      showToast({ message: "Erro ao salvar configurações.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTax() {
    if (!authUser) return;
    setSavingTax(true);
    try {
      const saved = await saveSchoolCosts(
        buildSchoolCostsPayload(),
        authUser.id,
      );
      setUpdatedAt(saved.updatedAt);
      showToast({ message: "Configurações de impostos salvas.", variant: "success" });
    } catch {
      showToast({ message: "Erro ao salvar impostos.", variant: "error" });
    } finally {
      setSavingTax(false);
    }
  }

  function updateGrossDeduction(key: keyof ProfitDeductions, value: boolean) {
    setTaxConfig((prev) => ({
      ...prev,
      grossProfitDeductions: { ...prev.grossProfitDeductions, [key]: value },
    }));
  }

  function updateNetDeduction(key: keyof ProfitDeductions, value: boolean) {
    setTaxConfig((prev) => ({
      ...prev,
      netProfitDeductions: { ...prev.netProfitDeductions, [key]: value },
    }));
  }

  function updateManualLine(lineId: string, updater: (line: ManualDreLine) => ManualDreLine) {
    setManualDreLines((prev) => prev.map((line) => (line.id === lineId ? updater(line) : line)));
  }

  function addManualLine() {
    const name = manualDraft.name.trim();
    if (!name) {
      showToast({ message: "Informe o nome do lancamento manual.", variant: "error" });
      return;
    }
    const now = new Date().toISOString();
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setManualDreLines((prev) => [
      ...prev,
      {
        id,
        name,
        defaultAmount: parseSignedCurrency(manualDraft.defaultAmount),
        sectionKey: manualDraft.sectionKey,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setManualDraft(emptyManualLineDraft());
  }

  async function handleSaveManual() {
    if (!authUser) return;
    setSavingManual(true);
    try {
      const saved = await saveSchoolCosts(buildSchoolCostsPayload(), authUser.id);
      setUpdatedAt(saved.updatedAt);
      setManualDreLines(saved.manualDreLines);
      setManualDreValues(saved.manualDreValues);
      showToast({ message: "Lancamentos manuais salvos.", variant: "success" });
    } catch {
      showToast({ message: "Erro ao salvar lancamentos manuais.", variant: "error" });
    } finally {
      setSavingManual(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SettingsSkeleton />
        <SettingsSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Custo de matrícula</h3>
          </div>
          <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            Atualizado: {formatUpdatedAt(updatedAt)}
          </p>
        </div>
        <div className="max-w-xs">
          <CurrencyInput label="Custo de matrícula do aluno" value={enrollmentCost} onChange={setEnrollmentCost} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Custos por forma de pagamento</h3>
          <p className="mt-1 text-xs text-slate-500">Custos internos por cada forma de pagamento. Não exibidos para alunos.</p>
        </div>
        <div className="space-y-3">
          {STUDENT_PAYMENT_METHODS.map((method) => {
            const draft = methodDrafts[method] ?? { fixedCost: "0", percentCost: "0" };
            return (
              <div key={method} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                <p className="mb-3 text-xs font-semibold text-slate-300">{method}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CurrencyInput
                    label="Custo fixo"
                    value={draft.fixedCost}
                    onChange={(v) => updateMethodDraft(method, "fixedCost", v)}
                  />
                  <PercentInput
                    label="Custo percentual"
                    value={draft.percentCost}
                    onChange={(v) => updateMethodDraft(method, "percentCost", v)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Lancamento manual</h3>
          <p className="mt-1 text-xs text-slate-500">Linhas manuais exibidas na DRE. Valores mensais podem ser ajustados na propria DRE enquanto o mes estiver aberto.</p>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-700/60 bg-slate-950/30 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(160px,0.7fr)_minmax(220px,1fr)_auto] md:items-end">
          <label className="block text-xs text-slate-400">
            Nome
            <input
              type="text"
              value={manualDraft.name}
              onChange={(e) => setManualDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Aluguel administrativo"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />
          </label>
          <SignedCurrencyInput
            label="Valor default"
            value={manualDraft.defaultAmount}
            onChange={(value) => setManualDraft((prev) => ({ ...prev, defaultAmount: value }))}
          />
          <label className="block text-xs text-slate-400">
            Secao DRE
            <select
              value={manualDraft.sectionKey}
              onChange={(e) => setManualDraft((prev) => ({ ...prev, sectionKey: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            >
              {DRE_LEVEL1_SECTIONS.map((section) => (
                <option key={section.key} value={section.key}>
                  {section.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addManualLine}
            className="rounded-lg border border-emerald-500/50 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/10"
          >
            Adicionar
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {manualDreLines.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-500">Nenhum lancamento manual configurado.</p>
          ) : (
            manualDreLines.map((line) => (
              <div key={line.id} className={`grid gap-3 rounded-xl border border-slate-700/60 bg-slate-950/30 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(160px,0.7fr)_minmax(220px,1fr)_120px] md:items-end ${line.active ? "" : "opacity-60"}`}>
                <label className="block text-xs text-slate-400">
                  Nome
                  <input
                    type="text"
                    value={line.name}
                    onChange={(e) =>
                      updateManualLine(line.id, (current) => ({ ...current, name: e.target.value, updatedAt: new Date().toISOString() }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  />
                </label>
                <SignedCurrencyCommitInput
                  label="Valor default"
                  value={line.defaultAmount}
                  onCommit={(value) =>
                    updateManualLine(line.id, (current) => ({
                      ...current,
                      defaultAmount: value,
                      updatedAt: new Date().toISOString(),
                    }))
                  }
                />
                <label className="block text-xs text-slate-400">
                  Secao DRE
                  <select
                    value={line.sectionKey}
                    onChange={(e) =>
                      updateManualLine(line.id, (current) => ({ ...current, sectionKey: e.target.value, updatedAt: new Date().toISOString() }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  >
                    {DRE_LEVEL1_SECTIONS.map((section) => (
                      <option key={section.key} value={section.key}>
                        {section.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={line.active}
                    onChange={(e) =>
                      updateManualLine(line.id, (current) => ({ ...current, active: e.target.checked, updatedAt: new Date().toISOString() }))
                    }
                    className="h-4 w-4 accent-emerald-500"
                  />
                  Ativo
                </label>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSaveManual()}
            disabled={savingManual}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {savingManual ? "Salvando..." : "Salvar lancamentos"}
          </button>
        </div>
      </section>

      {/* ─── Impostos ─── */}
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Impostos</h3>
          <p className="mt-1 text-xs text-slate-500">
            Alíquotas e composição de lucro para cálculo fiscal. Usadas apenas em relatórios internos.
          </p>
        </div>

        {/* Alíquotas */}
        <div className="grid gap-3 sm:grid-cols-3">
          <PercentInput
            label="Imposto sobre o faturamento"
            value={taxRates.revenue}
            onChange={(v) => setTaxRates((prev) => ({ ...prev, revenue: v }))}
          />
          <PercentInput
            label="Imposto sobre o lucro bruto"
            value={taxRates.grossProfit}
            onChange={(v) => setTaxRates((prev) => ({ ...prev, grossProfit: v }))}
          />
          <PercentInput
            label="Imposto sobre o lucro líquido"
            value={taxRates.netProfit}
            onChange={(v) => setTaxRates((prev) => ({ ...prev, netProfit: v }))}
          />
        </div>

        {/* Composição do lucro bruto */}
        <div className="mt-5 rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
          <p className="mb-3 text-xs font-semibold text-slate-300">
            O que descontar do faturamento para definir o lucro bruto:
          </p>
          <div className="space-y-3">
            {DEDUCTION_ITEMS.map(({ key, label }) => (
              <ToggleRow
                key={key}
                label={label}
                checked={taxConfig.grossProfitDeductions[key]}
                onChange={(v) => updateGrossDeduction(key, v)}
              />
            ))}
          </div>
        </div>

        {/* Composição do lucro líquido */}
        <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
          <p className="mb-3 text-xs font-semibold text-slate-300">
            O que descontar do faturamento para definir o lucro líquido:
          </p>
          <div className="space-y-3">
            {DEDUCTION_ITEMS.map(({ key, label }) => (
              <ToggleRow
                key={key}
                label={label}
                checked={taxConfig.netProfitDeductions[key]}
                onChange={(v) => updateNetDeduction(key, v)}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSaveTax()}
            disabled={savingTax}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {savingTax ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}
