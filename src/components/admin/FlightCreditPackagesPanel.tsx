import { useCallback, useEffect, useState } from "react";
import { listModels } from "../../lib/aircraftModelsDb";
import {
  getFlightCreditSalesConfig,
  saveFlightCreditSalesConfig,
} from "../../lib/flightCreditSalesDb";
import type { AircraftModel } from "../../types/admin";
import type { FlightCreditPackage, PackageEligibility } from "../../types/flightCreditSales";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type PackageDraft = {
  hours: string;
  hourPrice: string;
  validityDays: string;
  aircraftModelId: string;
  active: boolean;
  isDefault: boolean;
  eligibilityType: "all" | "saga_id_range" | "created_date_range";
  sagaIdMin: string;
  sagaIdMax: string;
  createdFrom: string;
  createdTo: string;
};

const emptyDraft: PackageDraft = {
  hours: "",
  hourPrice: "",
  validityDays: "90",
  aircraftModelId: "",
  active: true,
  isDefault: false,
  eligibilityType: "all",
  sagaIdMin: "",
  sagaIdMax: "",
  createdFrom: "",
  createdTo: "",
};

function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function FlightCreditPackagesPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [nightHoursDifferentFromDay, setNightHoursDifferentFromDay] = useState(true);
  const [weekdayDiscountPct, setWeekdayDiscountPct] = useState("");
  const [packages, setPackages] = useState<FlightCreditPackage[]>([]);
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PackageDraft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [config, availableModels] = await Promise.all([
        getFlightCreditSalesConfig(),
        listModels(),
      ]);
      setEnabled(config.studentPurchasesEnabled);
      setNightHoursDifferentFromDay(config.nightHoursDifferentFromDay !== false);
      setWeekdayDiscountPct(
        config.weekdayDiscountPct != null && config.weekdayDiscountPct > 0
          ? String(config.weekdayDiscountPct)
          : "",
      );
      setPackages(config.packages);
      setModels(availableModels);
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setDraft({ ...emptyDraft, aircraftModelId: models[0]?.id || "" });
    setShowForm(true);
  }

  function openEdit(item: FlightCreditPackage) {
    setEditingId(item.id);
    const el = item.eligibility ?? { type: "all" as const };
    setDraft({
      hours: String(item.hours),
      hourPrice: String(item.hourPrice),
      validityDays: String(item.validityDays),
      aircraftModelId: item.aircraftModelId,
      active: item.active,
      isDefault: item.isDefault,
      eligibilityType: el.type,
      sagaIdMin: el.type === "saga_id_range" ? String(el.min ?? "") : "",
      sagaIdMax: el.type === "saga_id_range" ? String(el.max ?? "") : "",
      createdFrom: el.type === "created_date_range" ? (el.from ?? "") : "",
      createdTo: el.type === "created_date_range" ? (el.to ?? "") : "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowForm(false);
  }

  function applyDraft() {
    const hours = parseNumber(draft.hours);
    const hourPrice = parseNumber(draft.hourPrice);
    const validityDays = Math.round(parseNumber(draft.validityDays));
    const model = models.find((item) => item.id === draft.aircraftModelId);
    if (hours <= 0 || hourPrice <= 0 || validityDays <= 0 || !model) {
      showToast({ variant: "warning", message: "Preencha horas, valor, validade e modelo com valores validos." });
      return;
    }

    let eligibility: PackageEligibility;
    if (draft.eligibilityType === "saga_id_range") {
      const min = draft.sagaIdMin !== "" ? Number(draft.sagaIdMin) : null;
      const max = draft.sagaIdMax !== "" ? Number(draft.sagaIdMax) : null;
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
        showToast({ variant: "warning", message: "Informe valores numericos validos para o range de ID SAGA." });
        return;
      }
      eligibility = { type: "saga_id_range", min, max };
    } else if (draft.eligibilityType === "created_date_range") {
      eligibility = {
        type: "created_date_range",
        from: draft.createdFrom || null,
        to: draft.createdTo || null,
      };
    } else {
      eligibility = { type: "all" };
    }

    const next: FlightCreditPackage = {
      id: editingId || crypto.randomUUID(),
      hours: Number(hours.toFixed(2)),
      hourPrice: Number(hourPrice.toFixed(2)),
      validityDays,
      aircraftModelId: model.id,
      aircraftModelName: model.name,
      active: draft.isDefault ? true : draft.active,
      isDefault: draft.isDefault,
      eligibility,
    };
    setPackages((current) => {
      const normalized = next.isDefault
        ? current.map((item) => ({ ...item, isDefault: false }))
        : current;
      return editingId
        ? normalized.map((item) => item.id === editingId ? next : item)
        : [...normalized, next];
    });
    closeForm();
  }

  async function save() {
    setSaving(true);
    try {
      const config = await saveFlightCreditSalesConfig({
        studentPurchasesEnabled: enabled,
        nightHoursDifferentFromDay,
        weekdayDiscountPct: weekdayDiscountPct.trim() ? parseNumber(weekdayDiscountPct) : null,
        packages,
      });
      setEnabled(config.studentPurchasesEnabled);
      setNightHoursDifferentFromDay(config.nightHoursDifferentFromDay !== false);
      setWeekdayDiscountPct(
        config.weekdayDiscountPct != null && config.weekdayDiscountPct > 0
          ? String(config.weekdayDiscountPct)
          : "",
      );
      setPackages(config.packages);
      showToast({ variant: "success", message: "Pacotes de horas salvos." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Pacotes de horas de voo</h3>
          <p className="mt-1 text-xs text-slate-500">Configure os pacotes que poderao ser comprados diretamente pelos alunos.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={models.length === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          + Novo pacote
        </button>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
        <input
          type="checkbox"
          checked={nightHoursDifferentFromDay}
          onChange={(event) => setNightHoursDifferentFromDay(event.target.checked)}
          className="h-4 w-4 accent-sky-500"
        />
        <span>
          <span className="block text-sm font-medium text-slate-200">Hora de voo noturna tem valor diferente da diurna</span>
          <span className="block text-xs text-slate-500">
            Quando ativado, o import SAGA separa os creditos em pacotes diurnos e noturnos conforme os voos realizados.
            Quando desativado, todos os creditos sao debitados sem distinção entre dia e noite.
          </span>
        </span>
      </label>

      <label className="mt-2 block rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
        <span className="block text-sm font-medium text-slate-200">Desconto para modalidade &quot;somente seg–sex&quot;</span>
        <span className="mt-1 block text-xs text-slate-500">
          Percentual global aplicado a todos os pacotes na compra com restrição de dias de semana. Deixe vazio para desligar.
        </span>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min="0.01"
            max="99.99"
            step="0.1"
            value={weekdayDiscountPct}
            onChange={(event) => setWeekdayDiscountPct(event.target.value)}
            placeholder="Ex.: 15"
            className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
          <span className="text-sm text-slate-400">%</span>
        </div>
      </label>

      <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-4 w-4 accent-emerald-500"
        />
        <span>
          <span className="block text-sm font-medium text-slate-200">Permitir que alunos comprem horas</span>
          <span className="block text-xs text-slate-500">Quando desligado, nenhum pacote aparece na aba Creditos.</span>
        </span>
      </label>

      {showForm ? (
        <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
          <p className="mb-3 text-xs font-semibold text-slate-300">{editingId ? "Editar pacote" : "Novo pacote"}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-slate-400">Horas
              <input type="number" min="0.01" step="0.1" value={draft.hours} onChange={(e) => setDraft((value) => ({ ...value, hours: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
            </label>
            <label className="text-xs text-slate-400">Valor da hora
              <input type="number" min="0.01" step="0.01" value={draft.hourPrice} onChange={(e) => setDraft((value) => ({ ...value, hourPrice: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
            </label>
            <label className="text-xs text-slate-400">Dias para expirar
              <input type="number" min="1" step="1" value={draft.validityDays} onChange={(e) => setDraft((value) => ({ ...value, validityDays: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
            </label>
            <label className="text-xs text-slate-400">Modelo do aviao
              <select value={draft.aircraftModelId} onChange={(e) => setDraft((value) => ({ ...value, aircraftModelId: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                <option value="">Selecione</option>
                {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3">
            <label className="text-xs text-slate-400">Visivel para
              <select
                value={draft.eligibilityType}
                onChange={(e) => setDraft((value) => ({ ...value, eligibilityType: e.target.value as PackageDraft["eligibilityType"] }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">Todos os alunos</option>
                <option value="saga_id_range">Alunos com ID SAGA entre X e Y</option>
                <option value="created_date_range">Alunos cadastrados entre data X e Y</option>
              </select>
            </label>
            {draft.eligibilityType === "saga_id_range" && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">ID SAGA minimo
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Sem limite inferior"
                    value={draft.sagaIdMin}
                    onChange={(e) => setDraft((value) => ({ ...value, sagaIdMin: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs text-slate-400">ID SAGA maximo
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Sem limite superior"
                    value={draft.sagaIdMax}
                    onChange={(e) => setDraft((value) => ({ ...value, sagaIdMax: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>
            )}
            {draft.eligibilityType === "created_date_range" && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">Cadastrado a partir de
                  <input
                    type="date"
                    value={draft.createdFrom}
                    onChange={(e) => setDraft((value) => ({ ...value, createdFrom: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs text-slate-400">Cadastrado ate
                  <input
                    type="date"
                    value={draft.createdTo}
                    onChange={(e) => setDraft((value) => ({ ...value, createdTo: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>
            )}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((value) => ({ ...value, active: e.target.checked }))} className="accent-emerald-500" />
            Pacote ativo
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft((value) => ({ ...value, isDefault: e.target.checked }))} className="accent-amber-500" />
            Pacote default para propostas e links administrativos
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={applyDraft} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Aplicar</button>
            <button type="button" onClick={closeForm} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400">Cancelar</button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {packages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 px-3 py-5 text-center text-sm text-slate-500">Nenhum pacote cadastrado.</p>
        ) : packages.map((item) => {
          const discountPct = parseNumber(weekdayDiscountPct);
          const hasWeekdayDiscount = discountPct > 0 && discountPct < 100;
          const weekdayHourPrice = hasWeekdayDiscount
            ? Number((item.hourPrice * (1 - discountPct / 100)).toFixed(2))
            : null;
          return (
          <div key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 ${item.active ? "border-slate-700/60 bg-slate-800/30" : "border-slate-800 bg-slate-950/20 opacity-60"}`}>
            <div>
              <p className="text-sm font-medium text-slate-100">{item.hours}h de {item.aircraftModelName}</p>
              {item.isDefault ? <span className="mt-1 inline-flex rounded-full border border-amber-600/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300">Default</span> : null}
              <p className="text-xs text-slate-500">
                {formatBrl(item.hourPrice)}/h · {formatBrl(item.hours * item.hourPrice)} · validade de {item.validityDays} dias
              </p>
              {hasWeekdayDiscount && weekdayHourPrice != null ? (
                <p className="mt-1 text-xs text-sky-300">
                  Seg–sex: {formatBrl(weekdayHourPrice)}/h · {formatBrl(item.hours * weekdayHourPrice)} (−{discountPct}%)
                </p>
              ) : null}
              {item.eligibility && item.eligibility.type !== "all" && (
                <p className="mt-1 text-xs text-amber-400">
                  {item.eligibility.type === "saga_id_range" && (
                    <>
                      ID SAGA:{" "}
                      {item.eligibility.min !== null ? item.eligibility.min : "∞"}{" "}
                      ate{" "}
                      {item.eligibility.max !== null ? item.eligibility.max : "∞"}
                    </>
                  )}
                  {item.eligibility.type === "created_date_range" && (
                    <>
                      Cadastro:{" "}
                      {item.eligibility.from ?? "∞"}{" "}
                      ate{" "}
                      {item.eligibility.to ?? "∞"}
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openEdit(item)} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700">Editar</button>
              <button type="button" onClick={() => setPackages((current) => current.map((entry) => entry.id === item.id ? { ...entry, active: !entry.active } : entry))} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700">
                {item.active ? "Desativar" : "Ativar"}
              </button>
              <button type="button" onClick={() => setPackages((current) => current.filter((entry) => entry.id !== item.id))} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">Excluir</button>
            </div>
          </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar configuracao"}
        </button>
      </div>
    </section>
  );
}
