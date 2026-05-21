import { useCallback, useEffect, useState } from "react";
import { getInstructorCosts, saveInstructorCosts } from "../../lib/instructorCostsDb";
import { listModels } from "../../lib/aircraftModelsDb";
import type { AircraftModel } from "../../types/admin";
import type { InstructorModelCost } from "../../types/costs";
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
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function CurrencyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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

type ModelCostDraft = {
  modelId: string;
  modelName: string;
  hourlyDayRate: string;
  hourlyNightRate: string;
  fixedDayRate: string;
  fixedNightRate: string;
};

function modelCostToInstructorModelCost(draft: ModelCostDraft): InstructorModelCost {
  return {
    modelId: draft.modelId,
    modelName: draft.modelName,
    hourlyDayRate: parseCurrency(draft.hourlyDayRate),
    hourlyNightRate: parseCurrency(draft.hourlyNightRate),
    fixedDayRate: parseCurrency(draft.fixedDayRate),
    fixedNightRate: parseCurrency(draft.fixedNightRate),
  };
}

export function InstructorCostsSection({ instructorUserId }: { instructorUserId: string }) {
  const { user: authUser } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [monthlyFixedCost, setMonthlyFixedCost] = useState("0");
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [modelDrafts, setModelDrafts] = useState<ModelCostDraft[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [costs, allModels] = await Promise.all([
        getInstructorCosts(instructorUserId),
        listModels(),
      ]);
      setModels(allModels);
      setUpdatedAt(costs?.updatedAt ?? null);
      setMonthlyFixedCost(String(costs?.monthlyFixedCost ?? 0));

      const drafts: ModelCostDraft[] = allModels.map((model) => {
        const existing = costs?.modelCosts.find((mc) => mc.modelId === model.id);
        return {
          modelId: model.id,
          modelName: model.name,
          hourlyDayRate: String(existing?.hourlyDayRate ?? 0),
          hourlyNightRate: String(existing?.hourlyNightRate ?? 0),
          fixedDayRate: String(existing?.fixedDayRate ?? 0),
          fixedNightRate: String(existing?.fixedNightRate ?? 0),
        };
      });
      setModelDrafts(drafts);
    } catch {
      showToast({ message: "Erro ao carregar custos do instrutor.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [instructorUserId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateModelDraft(modelId: string, field: keyof Omit<ModelCostDraft, "modelId" | "modelName">, value: string) {
    setModelDrafts((prev) => prev.map((d) => (d.modelId === modelId ? { ...d, [field]: value } : d)));
  }

  async function handleSave() {
    if (!authUser) return;
    setSaving(true);
    try {
      const saved = await saveInstructorCosts(
        instructorUserId,
        {
          monthlyFixedCost: parseCurrency(monthlyFixedCost),
          modelCosts: modelDrafts.map(modelCostToInstructorModelCost),
        },
        authUser.id,
      );
      setUpdatedAt(saved.updatedAt);
      showToast({ message: "Custos salvos.", variant: "success" });
    } catch {
      showToast({ message: "Erro ao salvar custos.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Custos do Instrutor</p>
          <p className="mt-0.5 text-xs text-slate-600">Apenas admin visualiza. Impacta apenas voos futuros.</p>
        </div>
        <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          Atualizado: {formatUpdatedAt(updatedAt)}
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-400">
        Alterações de custo impactam apenas voos futuros. Voos passados já assinados não serão alterados.
      </div>

      <div className="mb-4 max-w-xs">
        <CurrencyInput label="Custo fixo mensal" value={monthlyFixedCost} onChange={setMonthlyFixedCost} />
      </div>

      {models.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-400">Repasses por modelo de aeronave</p>
          {modelDrafts.map((draft) => (
            <div key={draft.modelId} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
              <p className="mb-3 text-xs font-semibold text-slate-300">{draft.modelName}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <CurrencyInput
                  label="Repasse por hora diurna"
                  value={draft.hourlyDayRate}
                  onChange={(v) => updateModelDraft(draft.modelId, "hourlyDayRate", v)}
                />
                <CurrencyInput
                  label="Repasse por hora noturna"
                  value={draft.hourlyNightRate}
                  onChange={(v) => updateModelDraft(draft.modelId, "hourlyNightRate", v)}
                />
                <CurrencyInput
                  label="Repasse fixo por voo diurno"
                  value={draft.fixedDayRate}
                  onChange={(v) => updateModelDraft(draft.modelId, "fixedDayRate", v)}
                />
                <CurrencyInput
                  label="Repasse fixo por voo noturno"
                  value={draft.fixedNightRate}
                  onChange={(v) => updateModelDraft(draft.modelId, "fixedNightRate", v)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar custos"}
        </button>
      </div>
    </section>
  );
}
