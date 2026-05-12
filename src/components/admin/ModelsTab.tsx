import { useCallback, useEffect, useState } from "react";
import { listModels, createModel, updateModel, deleteModel } from "../../lib/aircraftModelsDb";
import { listAircrafts } from "../../lib/aircraftDb";
import type { AircraftModel, AircraftCategory } from "../../types/admin";
import { SCHOOL_ID } from "../../lib/appwrite";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const CATEGORIES: AircraftCategory[] = ["PPL", "IFR", "Multi-Engine", "Helicopter", "Outro"];

type ModelForm = {
  name: string;
  manufacturer: string;
  category: AircraftCategory;
  default_image: string;
  vx_kt: string;
  vy_kt: string;
  vs_clean_kt: string;
  vso_kt: string;
  white_arc_min_kt: string;
  white_arc_max_kt: string;
  green_arc_min_kt: string;
  green_arc_max_kt: string;
  yellow_arc_min_kt: string;
  yellow_arc_max_kt: string;
  vne_kt: string;
  va_kt: string;
  best_glide_kt: string;
  vref_flap0_kt: string;
  vref_flap1_kt: string;
  vref_flap2_kt: string;
  rpm_cruise: string;
  rpm_takeoff_max: string;
};

const emptyForm: ModelForm = {
  name: "",
  manufacturer: "",
  category: "PPL",
  default_image: "",
  vx_kt: "",
  vy_kt: "",
  vs_clean_kt: "",
  vso_kt: "",
  white_arc_min_kt: "",
  white_arc_max_kt: "",
  green_arc_min_kt: "",
  green_arc_max_kt: "",
  yellow_arc_min_kt: "",
  yellow_arc_max_kt: "",
  vne_kt: "",
  va_kt: "",
  best_glide_kt: "",
  vref_flap0_kt: "",
  vref_flap1_kt: "",
  vref_flap2_kt: "",
  rpm_cruise: "",
  rpm_takeoff_max: "",
};

const PERF_FIELDS: ReadonlyArray<{ key: keyof ModelForm; label: string; unit: string }> = [
  { key: "vx_kt", label: "Vx", unit: "kt" },
  { key: "vy_kt", label: "Vy", unit: "kt" },
  { key: "vs_clean_kt", label: "Vs (clean)", unit: "kt" },
  { key: "vso_kt", label: "Vso (landing)", unit: "kt" },
  { key: "white_arc_min_kt", label: "Arco branco mín", unit: "kt" },
  { key: "white_arc_max_kt", label: "Arco branco máx", unit: "kt" },
  { key: "green_arc_min_kt", label: "Arco verde mín", unit: "kt" },
  { key: "green_arc_max_kt", label: "Arco verde máx", unit: "kt" },
  { key: "yellow_arc_min_kt", label: "Arco amarelo mín", unit: "kt" },
  { key: "yellow_arc_max_kt", label: "Arco amarelo máx", unit: "kt" },
  { key: "vne_kt", label: "Vne", unit: "kt" },
  { key: "va_kt", label: "Va", unit: "kt" },
  { key: "best_glide_kt", label: "Vglide", unit: "kt" },
  { key: "vref_flap0_kt", label: "Vref flap 0", unit: "kt" },
  { key: "vref_flap1_kt", label: "Vref flap 1", unit: "kt" },
  { key: "vref_flap2_kt", label: "Vref flap 2", unit: "kt" },
  { key: "rpm_cruise", label: "RPM máx contínua", unit: "rpm" },
  { key: "rpm_takeoff_max", label: "RPM máx decolagem", unit: "rpm" },
];

function n(v: string): number | null {
  const trimmed = v.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function s(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "" : String(v);
}

export function ModelsTab() {
  const { showToast } = useToast();
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aircraftCountByModel, setAircraftCountByModel] = useState<Record<string, number>>({});

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ms, aircrafts] = await Promise.all([
        listModels(),
        listAircrafts(SCHOOL_ID ?? ""),
      ]);
      setModels(ms);
      const counts: Record<string, number> = {};
      for (const a of aircrafts) {
        counts[a.model_id] = (counts[a.model_id] ?? 0) + 1;
      }
      setAircraftCountByModel(counts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(model: AircraftModel) {
    setForm({
      name: model.name,
      manufacturer: model.manufacturer,
      category: model.category,
      default_image: model.default_image ?? "",
      vx_kt: s(model.vx_kt),
      vy_kt: s(model.vy_kt),
      vs_clean_kt: s(model.vs_clean_kt),
      vso_kt: s(model.vso_kt),
      white_arc_min_kt: s(model.white_arc_min_kt),
      white_arc_max_kt: s(model.white_arc_max_kt),
      green_arc_min_kt: s(model.green_arc_min_kt),
      green_arc_max_kt: s(model.green_arc_max_kt),
      yellow_arc_min_kt: s(model.yellow_arc_min_kt),
      yellow_arc_max_kt: s(model.yellow_arc_max_kt),
      vne_kt: s(model.vne_kt),
      va_kt: s(model.va_kt),
      best_glide_kt: s(model.best_glide_kt),
      vref_flap0_kt: s(model.vref_flap0_kt),
      vref_flap1_kt: s(model.vref_flap1_kt),
      vref_flap2_kt: s(model.vref_flap2_kt),
      rpm_cruise: s(model.rpm_cruise),
      rpm_takeoff_max: s(model.rpm_takeoff_max),
    });
    setEditingId(model.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.manufacturer.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateModel(editingId, {
          name: form.name.trim(),
          manufacturer: form.manufacturer.trim(),
          category: form.category,
          default_image: form.default_image.trim() || null,
          vx_kt: n(form.vx_kt),
          vy_kt: n(form.vy_kt),
          vs_clean_kt: n(form.vs_clean_kt),
          vso_kt: n(form.vso_kt),
          white_arc_min_kt: n(form.white_arc_min_kt),
          white_arc_max_kt: n(form.white_arc_max_kt),
          green_arc_min_kt: n(form.green_arc_min_kt),
          green_arc_max_kt: n(form.green_arc_max_kt),
          yellow_arc_min_kt: n(form.yellow_arc_min_kt),
          yellow_arc_max_kt: n(form.yellow_arc_max_kt),
          vne_kt: n(form.vne_kt),
          va_kt: n(form.va_kt),
          best_glide_kt: n(form.best_glide_kt),
          vref_flap0_kt: n(form.vref_flap0_kt),
          vref_flap1_kt: n(form.vref_flap1_kt),
          vref_flap2_kt: n(form.vref_flap2_kt),
          rpm_cruise: n(form.rpm_cruise),
          rpm_takeoff_max: n(form.rpm_takeoff_max),
        });
        setModels((prev) => prev.map((m) => (m.id === editingId ? updated : m)));
      } else {
        const created = await createModel({
          name: form.name.trim(),
          manufacturer: form.manufacturer.trim(),
          category: form.category,
          default_image: form.default_image.trim() || undefined,
          vx_kt: n(form.vx_kt),
          vy_kt: n(form.vy_kt),
          vs_clean_kt: n(form.vs_clean_kt),
          vso_kt: n(form.vso_kt),
          white_arc_min_kt: n(form.white_arc_min_kt),
          white_arc_max_kt: n(form.white_arc_max_kt),
          green_arc_min_kt: n(form.green_arc_min_kt),
          green_arc_max_kt: n(form.green_arc_max_kt),
          yellow_arc_min_kt: n(form.yellow_arc_min_kt),
          yellow_arc_max_kt: n(form.yellow_arc_max_kt),
          vne_kt: n(form.vne_kt),
          va_kt: n(form.va_kt),
          best_glide_kt: n(form.best_glide_kt),
          vref_flap0_kt: n(form.vref_flap0_kt),
          vref_flap1_kt: n(form.vref_flap1_kt),
          vref_flap2_kt: n(form.vref_flap2_kt),
          rpm_cruise: n(form.rpm_cruise),
          rpm_takeoff_max: n(form.rpm_takeoff_max),
        });
        setModels((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
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
      await deleteModel(id);
      setModels((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteConfirm(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Modelos de Aeronave</h2>
          <p className="text-xs text-slate-500">{models.length} modelo{models.length !== 1 ? "s" : ""} cadastrado{models.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 active:scale-95 sm:w-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Novo modelo
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">
            {editingId ? "Editar modelo" : "Novo modelo"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ex: Cessna 152"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Fabricante *</label>
              <input
                type="text"
                value={form.manufacturer}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                placeholder="ex: Cessna"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AircraftCategory }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Imagem padrão (URL)</label>
              <input
                type="url"
                value={form.default_image}
                onChange={(e) => setForm((f) => ({ ...f, default_image: e.target.value }))}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
              />
            </div>
          </div>
          <div className="mt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Velocidades operacionais
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PERF_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">{field.label}</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form[field.key]}
                      onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                      placeholder="—"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-12 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
                    />
                    <span className="pointer-events-none absolute right-3 top-2 text-xs text-slate-500">
                      {field.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !form.name.trim() || !form.manufacturer.trim()}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar modelo"}
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

      {/* List */}
      {loading ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700/60">
          <table className="min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 bg-slate-900/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Modelo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Fabricante</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Operacionais</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Frota</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-4 py-3"><div className="flex gap-2"><Skeleton className="h-6 w-12 rounded" /><Skeleton className="h-6 w-12 rounded" /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 py-16 text-center">
          <p className="text-sm text-slate-500">Nenhum modelo cadastrado.</p>
          <button type="button" onClick={openCreate} className="mt-3 text-sm text-sky-400 hover:underline">
            Criar primeiro modelo →
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/60">
          <table className="min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 bg-slate-900/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Modelo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Fabricante</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Operacionais</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Frota</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {models.map((model, i) => {
                const count = aircraftCountByModel[model.id] ?? 0;
                const canDelete = count === 0;
                return (
                  <tr
                    key={model.id}
                    className={`border-b border-slate-800/60 transition hover:bg-slate-800/30 ${i % 2 === 0 ? "" : "bg-slate-900/20"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {model.default_image ? (
                          <img src={model.default_image} alt="" className="h-8 w-8 rounded object-cover opacity-80" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-slate-600">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                            </svg>
                          </div>
                        )}
                        <span className="font-medium text-slate-200">{model.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{model.manufacturer}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                        {model.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      <p>Vx/Vy: {model.vx_kt ?? "—"} / {model.vy_kt ?? "—"} kt</p>
                      <p>Vs/Vso: {model.vs_clean_kt ?? "—"} / {model.vso_kt ?? "—"} kt</p>
                      <p>Va/Vne: {model.va_kt ?? "—"} / {model.vne_kt ?? "—"} kt</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${count > 0 ? "text-slate-200" : "text-slate-600"}`}>
                        {count} aeronave{count !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(model)}
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                        >
                          Editar
                        </button>
                        {deleteConfirm === model.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDelete(model.id)}
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
                            onClick={() => canDelete && setDeleteConfirm(model.id)}
                            disabled={!canDelete}
                            title={!canDelete ? `Modelo em uso por ${count} aeronave(s)` : undefined}
                            className="rounded px-2 py-1 text-xs text-red-500/60 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
