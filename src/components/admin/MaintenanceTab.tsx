import { useCallback, useEffect, useState } from "react";
import { listRulesByModel, createRule, updateRule, deleteRule } from "../../lib/maintenanceRulesDb";
import { listModels } from "../../lib/aircraftModelsDb";
import type { AircraftModel, MaintenanceRule } from "../../types/admin";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const emptyForm = {
  name: "",
  max_flight_hours: "",
  max_days: "",
  estimated_downtime_days: "",
  estimated_cost: "",
};

export function MaintenanceTab() {
  const { showToast } = useToast();
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [rules, setRules] = useState<MaintenanceRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    listModels()
      .then((ms) => {
        setModels(ms);
        if (ms[0]) setSelectedModelId(ms[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadRules = useCallback(async (modelId: string) => {
    if (!modelId) return;
    setLoading(true);
    setError(null);
    try {
      const rs = await listRulesByModel(modelId);
      setRules(rs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedModelId) void loadRules(selectedModelId);
  }, [selectedModelId, loadRules]);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(rule: MaintenanceRule) {
    setForm({
      name: rule.name,
      max_flight_hours: rule.max_flight_hours != null ? String(rule.max_flight_hours) : "",
      max_days: rule.max_days != null ? String(rule.max_days) : "",
      estimated_downtime_days: rule.estimated_downtime_days != null ? String(rule.estimated_downtime_days) : "",
      estimated_cost: rule.estimated_cost != null ? String(rule.estimated_cost) : "",
    });
    setEditingId(rule.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !selectedModelId) return;
    setSaving(true);
    try {
      const payload = {
        model_id: selectedModelId,
        name: form.name.trim(),
        max_flight_hours: form.max_flight_hours ? parseFloat(form.max_flight_hours) : null,
        max_days: form.max_days ? parseInt(form.max_days) : null,
        estimated_downtime_days: form.estimated_downtime_days ? parseInt(form.estimated_downtime_days) : null,
        estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
      };
      if (editingId) {
        const updated = await updateRule(editingId, payload);
        setRules((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await createRule(payload);
        setRules((prev) => [...prev, created]);
      }
      setShowForm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteConfirm(null);
    }
  }

  const selectedModel = models.find((m) => m.id === selectedModelId);

  function formatTrigger(rule: MaintenanceRule) {
    const parts: string[] = [];
    if (rule.max_flight_hours != null) parts.push(`${rule.max_flight_hours}h de voo`);
    if (rule.max_days != null) parts.push(`${rule.max_days} dias`);
    return parts.length > 0 ? parts.join(" OU ") : "—";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Regras de Manutenção</h2>
          <p className="text-xs text-slate-500">Intervalos obrigatórios por modelo de aeronave</p>
        </div>
      </div>

      {/* Model selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="text-xs font-medium text-slate-400">Modelo:</label>
        <div className="flex flex-wrap gap-2">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { setSelectedModelId(m.id); setShowForm(false); }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                selectedModelId === m.id
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                  : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {m.name}
            </button>
          ))}
          {models.length === 0 && (
            <p className="text-xs text-slate-600">Nenhum modelo cadastrado. Crie modelos na aba Modelos.</p>
          )}
        </div>
        {selectedModelId && (
          <button
            type="button"
            onClick={openCreate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 active:scale-95 sm:ml-auto sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Nova regra
          </button>
        )}
      </div>

      {selectedModelId && (
        <>
          {/* Form */}
          {showForm && (
            <div className="rounded-xl border border-amber-700/30 bg-slate-900/60 p-5">
              <h3 className="mb-1 text-sm font-semibold text-slate-200">
                {editingId ? "Editar regra" : "Nova regra de manutenção"}
              </h3>
              <p className="mb-4 text-xs text-slate-500">
                Modelo: <span className="text-amber-400">{selectedModel?.name}</span>
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome da manutenção *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="ex: Inspeção de 50h"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Gatilho: horas de voo</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.max_flight_hours}
                      onChange={(e) => setForm((f) => ({ ...f, max_flight_hours: e.target.value }))}
                      placeholder="ex: 50"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-8 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">h</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Gatilho: dias corridos</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={form.max_days}
                      onChange={(e) => setForm((f) => ({ ...f, max_days: e.target.value }))}
                      placeholder="ex: 30"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">dias</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Downtime estimado</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={form.estimated_downtime_days}
                      onChange={(e) => setForm((f) => ({ ...f, estimated_downtime_days: e.target.value }))}
                      placeholder="ex: 1"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">dias</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Custo estimado (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-500">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.estimated_cost}
                      onChange={(e) => setForm((f) => ({ ...f, estimated_cost: e.target.value }))}
                      placeholder="ex: 1000"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pl-9 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !form.name.trim()}
                  className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50 sm:w-auto"
                >
                  {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar regra"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 sm:w-auto"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
                  <div className="flex flex-1 items-center gap-4">
                    <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Skeleton className="h-12 w-16 rounded-lg" />
                    <Skeleton className="h-12 w-20 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 py-12 text-center">
              <p className="text-sm text-slate-500">Nenhuma regra de manutenção para {selectedModel?.name}.</p>
              <button type="button" onClick={openCreate} className="mt-3 text-sm text-amber-400 hover:underline">
                Criar primeira regra →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col items-stretch justify-between gap-4 rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="flex flex-1 items-center gap-4 min-w-0">
                    {/* Wrench icon */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M12 6.75a5.25 5.25 0 016.775-5.025.75.75 0 01.313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.641l3.318-3.319a.75.75 0 011.248.313 5.25 5.25 0 01-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 112.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.308A5.28 5.28 0 0112 6.75z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-200 truncate">{rule.name}</p>
                      <p className="text-xs text-slate-500">A cada {formatTrigger(rule)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {rule.estimated_downtime_days != null && (
                      <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-center">
                        <p className="text-xs text-slate-500">Downtime</p>
                        <p className="text-sm font-semibold text-slate-200">{rule.estimated_downtime_days}d</p>
                      </div>
                    )}
                    {rule.estimated_cost != null && (
                      <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-center">
                        <p className="text-xs text-slate-500">Custo est.</p>
                        <p className="text-sm font-semibold text-slate-200">
                          {rule.estimated_cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => openEdit(rule)}
                      className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    >
                      Editar
                    </button>
                    {deleteConfirm === rule.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDelete(rule.id)}
                          className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-400 hover:bg-red-600/30"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(rule.id)}
                        className="rounded px-2 py-1 text-xs text-red-500/60 hover:bg-red-500/10 hover:text-red-400"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
