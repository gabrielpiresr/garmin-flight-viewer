import { useCallback, useEffect, useState } from "react";
import { listModels, createModel, updateModel, deleteModel } from "../../lib/aircraftModelsDb";
import { listAircrafts } from "../../lib/aircraftDb";
import {
  createProgramItem,
  listProgramItemsByModel,
  softDeleteProgramItem,
  updateProgramItem,
  type ProgramItemPayload,
} from "../../lib/maintenanceDb";
import type { AircraftModel, AircraftCategory, MaintenanceProgramItem, MaintenanceProgramTask, TemperatureUnit } from "../../types/admin";
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
  op_oil_temp_unit: TemperatureUnit;
  op_oil_temp_attention: string;
  op_oil_temp_danger: string;
  op_oil_pressure_attention_psi: string;
  op_oil_pressure_danger_psi: string;
  op_rpm_attention: string;
  op_rpm_danger: string;
  op_fuel_pressure_attention_psi: string;
  op_fuel_pressure_danger_psi: string;
  op_gload_attention: string;
  op_gload_danger: string;
  op_touchdown_ias_attention_kt: string;
  op_touchdown_ias_danger_kt: string;
  op_best_climb_after_takeoff_kt: string;
  fuel_consumption_lph: string;
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
  op_oil_temp_unit: "F",
  op_oil_temp_attention: "",
  op_oil_temp_danger: "",
  op_oil_pressure_attention_psi: "",
  op_oil_pressure_danger_psi: "",
  op_rpm_attention: "",
  op_rpm_danger: "",
  op_fuel_pressure_attention_psi: "",
  op_fuel_pressure_danger_psi: "",
  op_gload_attention: "",
  op_gload_danger: "",
  op_touchdown_ias_attention_kt: "",
  op_touchdown_ias_danger_kt: "",
  op_best_climb_after_takeoff_kt: "",
  fuel_consumption_lph: "",
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
  { key: "fuel_consumption_lph", label: "Consumo de combustível", unit: "l/h" },
];

const LIMIT_SECTIONS: ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<{ key: keyof ModelForm; label: string; unit: string }>;
}> = [
  {
    title: "Óleo",
    fields: [
      { key: "op_oil_temp_attention", label: "Temperatura max de atenção", unit: "temp" },
      { key: "op_oil_temp_danger", label: "Temperatura max de perigo", unit: "temp" },
      { key: "op_oil_pressure_attention_psi", label: "Pressão max de atenção", unit: "psi" },
      { key: "op_oil_pressure_danger_psi", label: "Pressão max de perigo", unit: "psi" },
    ],
  },
  {
    title: "Motor",
    fields: [
      { key: "op_rpm_attention", label: "RPM max de atenção", unit: "rpm" },
      { key: "op_rpm_danger", label: "RPM max de perigo", unit: "rpm" },
      { key: "op_fuel_pressure_attention_psi", label: "Fuel pressure max de atenção", unit: "psi" },
      { key: "op_fuel_pressure_danger_psi", label: "Fuel pressure max de perigo", unit: "psi" },
    ],
  },
  {
    title: "Voo",
    fields: [
      { key: "op_gload_attention", label: "G-load max de atencao", unit: "G" },
      { key: "op_gload_danger", label: "G-load max de perigo", unit: "G" },
      { key: "op_touchdown_ias_attention_kt", label: "IAS de toque max de atencao", unit: "kt" },
      { key: "op_touchdown_ias_danger_kt", label: "IAS de toque max de perigo", unit: "kt" },
      { key: "op_best_climb_after_takeoff_kt", label: "Velocidade ideal de subida apos decolagem", unit: "kt" },
    ],
  },
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

function operationalLimitPayload(form: ModelForm) {
  return {
    op_oil_temp_unit: form.op_oil_temp_unit,
    op_oil_temp_attention: n(form.op_oil_temp_attention),
    op_oil_temp_danger: n(form.op_oil_temp_danger),
    op_oil_pressure_attention_psi: n(form.op_oil_pressure_attention_psi),
    op_oil_pressure_danger_psi: n(form.op_oil_pressure_danger_psi),
    op_rpm_attention: n(form.op_rpm_attention),
    op_rpm_danger: n(form.op_rpm_danger),
    op_fuel_pressure_attention_psi: n(form.op_fuel_pressure_attention_psi),
    op_fuel_pressure_danger_psi: n(form.op_fuel_pressure_danger_psi),
    op_gload_attention: n(form.op_gload_attention),
    op_gload_danger: n(form.op_gload_danger),
    op_touchdown_ias_attention_kt: n(form.op_touchdown_ias_attention_kt),
    op_touchdown_ias_danger_kt: n(form.op_touchdown_ias_danger_kt),
    op_best_climb_after_takeoff_kt: n(form.op_best_climb_after_takeoff_kt),
  };
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
      op_oil_temp_unit: model.op_oil_temp_unit,
      op_oil_temp_attention: s(model.op_oil_temp_attention),
      op_oil_temp_danger: s(model.op_oil_temp_danger),
      op_oil_pressure_attention_psi: s(model.op_oil_pressure_attention_psi),
      op_oil_pressure_danger_psi: s(model.op_oil_pressure_danger_psi),
      op_rpm_attention: s(model.op_rpm_attention),
      op_rpm_danger: s(model.op_rpm_danger),
      op_fuel_pressure_attention_psi: s(model.op_fuel_pressure_attention_psi),
      op_fuel_pressure_danger_psi: s(model.op_fuel_pressure_danger_psi),
      op_gload_attention: s(model.op_gload_attention),
      op_gload_danger: s(model.op_gload_danger),
      op_touchdown_ias_attention_kt: s(model.op_touchdown_ias_attention_kt),
      op_touchdown_ias_danger_kt: s(model.op_touchdown_ias_danger_kt),
      op_best_climb_after_takeoff_kt: s(model.op_best_climb_after_takeoff_kt),
      fuel_consumption_lph: s(model.fuel_consumption_lph),
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
          fuel_consumption_lph: n(form.fuel_consumption_lph),
          ...operationalLimitPayload(form),
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
          fuel_consumption_lph: n(form.fuel_consumption_lph),
          ...operationalLimitPayload(form),
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
    <div className="w-full space-y-4">
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
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Limites operacionais
              </p>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Temperatura do oleo
                <select
                  value={form.op_oil_temp_unit}
                  onChange={(e) => setForm((f) => ({ ...f, op_oil_temp_unit: e.target.value as TemperatureUnit }))}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500"
                >
                  <option value="F">F</option>
                  <option value="C">C</option>
                </select>
              </label>
            </div>
            <div className="space-y-4">
              {LIMIT_SECTIONS.map((section) => (
                <section key={section.title} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                  <p className="mb-3 text-xs font-semibold text-slate-300">{section.title}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {section.fields.map((field) => {
                      const unit = field.unit === "temp" ? form.op_oil_temp_unit : field.unit;
                      return (
                        <div key={field.key}>
                          <label className="mb-1.5 block text-xs font-medium text-slate-400">{field.label}</label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={form[field.key]}
                              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                              placeholder="--"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-12 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
                            />
                            <span className="pointer-events-none absolute right-3 top-2 text-xs text-slate-500">
                              {unit}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
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
                      <p>Limites: G {model.op_gload_attention ?? "—"}/{model.op_gload_danger ?? "—"} · RPM {model.op_rpm_attention ?? "—"}/{model.op_rpm_danger ?? "—"}</p>
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

const PROGRAM_ITEM_TYPES = ["inspection", "AD", "SB", "overhaul", "component", "preventive", "corrective"] as const;
const PROGRAM_CATEGORIES = ["routine", "mandatory", "recommended"] as const;
const PROGRAM_AREAS = ["engine", "airframe", "avionics", "propeller", "electrical", "landing_gear"] as const;
const PROGRAM_PRIORITIES = ["normal", "warning", "grounding"] as const;
const PROGRAM_REFERENCES = ["MM", "AMM", "IPC", "SB", "AD", "ICA", "OEM"] as const;
const BASELINE_SOURCES = ["manual", "migration", "imported", "calculated"] as const;

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  inspection: "Inspeção",
  AD: "Diretriz de Aeronavegabilidade (AD)",
  SB: "Boletim de Serviço (SB)",
  overhaul: "Overhaul",
  component: "Componente",
  preventive: "Preventiva",
  corrective: "Corretiva",
};
const PROGRAM_CATEGORY_LABELS: Record<string, string> = {
  routine: "Rotineira",
  mandatory: "Obrigatória",
  recommended: "Recomendada",
};
const PROGRAM_AREA_LABELS: Record<string, string> = {
  engine: "Motor",
  airframe: "Célula",
  avionics: "Aviônicos",
  propeller: "Hélice",
  electrical: "Elétrica",
  landing_gear: "Trem de pouso",
};
const PROGRAM_PRIORITY_LABELS: Record<string, string> = {
  normal: "Normal",
  warning: "Atenção",
  grounding: "Grounding",
};
const REFERENCE_LABELS: Record<string, string> = {
  MM: "Manual de Manutenção (MM)",
  AMM: "Aircraft Maintenance Manual (AMM)",
  IPC: "Catálogo Ilustrado de Peças (IPC)",
  SB: "Boletim de Serviço (SB)",
  AD: "Diretriz de Aeronavegabilidade (AD)",
  ICA: "Instruções de Aeronavegabilidade Continuada (ICA)",
  OEM: "Fabricante original (OEM)",
};
const BASELINE_SOURCE_LABELS: Record<string, string> = {
  "": "Não informado",
  manual: "Manual",
  migration: "Migração",
  imported: "Importado",
  calculated: "Calculado",
};

type ProgramForm = {
  code: string;
  title: string;
  item_type: MaintenanceProgramItem["item_type"];
  category: MaintenanceProgramItem["category"];
  maintenance_area: MaintenanceProgramItem["maintenance_area"];
  priority: MaintenanceProgramItem["priority"];
  description: string;
  reference_type: MaintenanceProgramItem["reference_type"];
  reference_document: string;
  reference_revision: string;
  reference_section: string;
  recurrence_hours: string;
  recurrence_days: string;
  tolerance_hours: string;
  tolerance_days: string;
  manufacturer: string;
  model: string;
  serial_from: string;
  serial_to: string;
  engine_model: string;
  baseline_source: "" | NonNullable<MaintenanceProgramItem["baseline_source"]>;
  baseline_notes: string;
  grounding_if_overdue: boolean;
  block_dispatch: boolean;
  requires_release: boolean;
  checklist_tasks: MaintenanceProgramTask[];
};

const emptyProgramForm: ProgramForm = {
  code: "",
  title: "",
  item_type: "inspection",
  category: "routine",
  maintenance_area: "airframe",
  priority: "normal",
  description: "",
  reference_type: "MM",
  reference_document: "",
  reference_revision: "",
  reference_section: "",
  recurrence_hours: "50",
  recurrence_days: "",
  tolerance_hours: "",
  tolerance_days: "",
  manufacturer: "",
  model: "",
  serial_from: "",
  serial_to: "",
  engine_model: "",
  baseline_source: "",
  baseline_notes: "",
  grounding_if_overdue: false,
  block_dispatch: false,
  requires_release: true,
  checklist_tasks: [],
};

function positiveNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function rulesJson(hours: string, days: string, required: boolean): string | null {
  const rules: Array<Record<string, number | string>> = [];
  const hoursValue = positiveNumber(hours);
  const daysValue = positiveNumber(days);
  if (hoursValue != null) rules.push({ type: "hours", value: hoursValue });
  if (daysValue != null) rules.push({ type: "calendar", value: daysValue, unit: "days" });
  if (required && rules.length === 0) throw new Error("Informe pelo menos uma regra de recorrência.");
  return rules.length > 0 ? JSON.stringify(rules) : null;
}

function parseRules(json: string | null): { hours: string; days: string } {
  if (!json) return { hours: "", days: "" };
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return { hours: "", days: "" };
    const hours = parsed.find((rule) => rule?.type === "hours")?.value;
    const days = parsed.find((rule) => rule?.type === "calendar" && rule?.unit === "days")?.value;
    return {
      hours: typeof hours === "number" ? String(hours) : "",
      days: typeof days === "number" ? String(days) : "",
    };
  } catch {
    return { hours: "", days: "" };
  }
}

function newTaskId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTasks(tasks: MaintenanceProgramTask[]): MaintenanceProgramTask[] {
  return tasks
    .map((task, index) => ({
      ...task,
      title: task.title.trim(),
      description: task.description.trim(),
      order: index + 1,
    }))
    .filter((task) => task.title.length > 0);
}

function programPayload(modelId: string, form: ProgramForm): ProgramItemPayload {
  return {
    aircraft_model_id: modelId,
    code: form.code.trim(),
    title: form.title.trim(),
    item_type: form.item_type,
    category: form.category,
    maintenance_area: form.maintenance_area,
    priority: form.priority,
    description: form.description.trim(),
    reference_type: form.reference_type,
    reference_document: form.reference_document.trim(),
    reference_revision: form.reference_revision.trim() || null,
    reference_section: form.reference_section.trim() || null,
    recurrence_rules: rulesJson(form.recurrence_hours, form.recurrence_days, true) ?? "[]",
    tolerance_rules: rulesJson(form.tolerance_hours, form.tolerance_days, false),
    manufacturer: form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    serial_from: form.serial_from.trim() || null,
    serial_to: form.serial_to.trim() || null,
    engine_model: form.engine_model.trim() || null,
    baseline_source: form.baseline_source || null,
    baseline_notes: form.baseline_notes.trim() || null,
    grounding_if_overdue: form.grounding_if_overdue,
    block_dispatch: form.block_dispatch,
    requires_release: form.requires_release,
    checklist_tasks: normalizeTasks(form.checklist_tasks),
  };
}

function formatRuleList(json: string | null): string {
  const rules = parseRules(json);
  const parts: string[] = [];
  if (rules.hours) parts.push(`${rules.hours} h`);
  if (rules.days) parts.push(`${rules.days} dias`);
  return parts.length > 0 ? parts.join(" ou ") : "-";
}

export function MaintenanceProgramPanel({ model, onClose }: { model: AircraftModel | null; onClose?: () => void }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<MaintenanceProgramItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ProgramForm>(emptyProgramForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    if (!model) return;
    setLoading(true);
    try {
      setItems(await listProgramItemsByModel(model.id));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [model, showToast]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  if (!model) return null;
  const currentModel = model;

  function openEditItem(item: MaintenanceProgramItem) {
    const recurrence = parseRules(item.recurrence_rules);
    const tolerance = parseRules(item.tolerance_rules);
    setForm({
      code: item.code,
      title: item.title,
      item_type: item.item_type,
      category: item.category,
      maintenance_area: item.maintenance_area,
      priority: item.priority,
      description: item.description,
      reference_type: item.reference_type,
      reference_document: item.reference_document,
      reference_revision: item.reference_revision ?? "",
      reference_section: item.reference_section ?? "",
      recurrence_hours: recurrence.hours,
      recurrence_days: recurrence.days,
      tolerance_hours: tolerance.hours,
      tolerance_days: tolerance.days,
      manufacturer: item.manufacturer ?? "",
      model: item.model ?? "",
      serial_from: item.serial_from ?? "",
      serial_to: item.serial_to ?? "",
      engine_model: item.engine_model ?? "",
      baseline_source: item.baseline_source ?? "",
      baseline_notes: item.baseline_notes ?? "",
      grounding_if_overdue: item.grounding_if_overdue,
      block_dispatch: item.block_dispatch,
      requires_release: item.requires_release,
      checklist_tasks: item.checklist_tasks,
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  async function saveItem() {
    if (!form.code.trim() || !form.title.trim() || !form.description.trim() || !form.reference_document.trim()) return;
    if (form.checklist_tasks.some((task) => !task.title.trim())) {
      showToast({ variant: "warning", message: "Toda tarefa do checklist precisa ter titulo." });
      return;
    }
    setSaving(true);
    try {
      const payload = programPayload(currentModel.id, form);
      if (editingId) {
        const updated = await updateProgramItem(editingId, payload);
        setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      } else {
        const created = await createProgramItem(payload);
        setItems((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyProgramForm);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    try {
      await softDeleteProgramItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    }
  }

  function updateTask(taskId: string, patch: Partial<MaintenanceProgramTask>) {
    setForm((current) => ({
      ...current,
      checklist_tasks: current.checklist_tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }));
  }

  function addTask() {
    setForm((current) => ({
      ...current,
      checklist_tasks: [
        ...current.checklist_tasks,
        { id: newTaskId(), title: "", description: "", order: current.checklist_tasks.length + 1 },
      ],
    }));
  }

  function removeTask(taskId: string) {
    setForm((current) => ({
      ...current,
      checklist_tasks: current.checklist_tasks.filter((task) => task.id !== taskId).map((task, index) => ({ ...task, order: index + 1 })),
    }));
  }

  function moveTask(taskId: string, direction: -1 | 1) {
    setForm((current) => {
      const tasks = [...current.checklist_tasks];
      const index = tasks.findIndex((task) => task.id === taskId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= tasks.length) return current;
      [tasks[index], tasks[nextIndex]] = [tasks[nextIndex], tasks[index]];
      return { ...current, checklist_tasks: tasks.map((task, orderIndex) => ({ ...task, order: orderIndex + 1 })) };
    });
  }

  const formMode = showForm;

  return (
    <section className="rounded-xl border border-sky-700/40 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Programa de Manutenção</h3>
          <p className="text-xs text-slate-500">{model.manufacturer} {model.name}</p>
        </div>
        <div className="flex gap-2">
          {!formMode ? (
            <button type="button" onClick={() => { setForm({ ...emptyProgramForm, code: "" }); setEditingId(null); setShowForm(true); }} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500" title="Cadastrar um item padrão do programa deste modelo.">
              Novo item
            </button>
          ) : null}
          {formMode || onClose ? (
            <button type="button" onClick={formMode ? () => setShowForm(false) : onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800">
              {formMode ? "Voltar" : "Fechar"}
            </button>
          ) : null}
        </div>
      </div>

      {formMode ? (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <TextField
              label="Código *"
              value={form.code}
              onChange={(value) => setForm((f) => ({ ...f, code: value.toUpperCase() }))}
              tooltip="Código curto definido pelo usuário para identificar o item no programa. Exemplos: 50H, 100H, ANUAL, AD-2026-01."
            />
            <TextField label="Título *" value={form.title} onChange={(value) => setForm((f) => ({ ...f, title: value }))} className="md:col-span-2" tooltip="Nome técnico curto do item de manutenção." />
            <SelectField label="Tipo" value={form.item_type} options={PROGRAM_ITEM_TYPES} labels={PROGRAM_TYPE_LABELS} onChange={(value) => setForm((f) => ({ ...f, item_type: value as ProgramForm["item_type"] }))} tooltip="Classificação operacional do item." />
            <SelectField label="Categoria" value={form.category} options={PROGRAM_CATEGORIES} labels={PROGRAM_CATEGORY_LABELS} onChange={(value) => setForm((f) => ({ ...f, category: value as ProgramForm["category"] }))} tooltip="Indica se o item é rotineiro, obrigatório ou recomendado." />
            <SelectField label="Área" value={form.maintenance_area} options={PROGRAM_AREAS} labels={PROGRAM_AREA_LABELS} onChange={(value) => setForm((f) => ({ ...f, maintenance_area: value as ProgramForm["maintenance_area"] }))} tooltip="Sistema principal afetado pelo item." />
            <SelectField label="Prioridade" value={form.priority} options={PROGRAM_PRIORITIES} labels={PROGRAM_PRIORITY_LABELS} onChange={(value) => setForm((f) => ({ ...f, priority: value as ProgramForm["priority"] }))} tooltip="Prioridade administrativa. Não calcula bloqueio nesta etapa." />
            <SelectField label="Referência" value={form.reference_type} options={PROGRAM_REFERENCES} labels={REFERENCE_LABELS} onChange={(value) => setForm((f) => ({ ...f, reference_type: value as ProgramForm["reference_type"] }))} tooltip="Tipo de documento técnico que fundamenta o item." />
            <TextField label="Documento de referência *" value={form.reference_document} onChange={(value) => setForm((f) => ({ ...f, reference_document: value }))} tooltip="Identificação do manual, boletim, diretriz ou documento aplicável." />
            <TextField label="Revisão" value={form.reference_revision} onChange={(value) => setForm((f) => ({ ...f, reference_revision: value }))} tooltip="Revisão do documento, quando existir." />
            <TextField label="Seção" value={form.reference_section} onChange={(value) => setForm((f) => ({ ...f, reference_section: value }))} tooltip="Capítulo, seção ou item do documento técnico." />
            <TextField label="Fabricante aplicável" value={form.manufacturer} onChange={(value) => setForm((f) => ({ ...f, manufacturer: value }))} tooltip="Fabricante aplicável para AD/SB/componentes, quando necessário." />
            <TextField label="Modelo aplicável" value={form.model} onChange={(value) => setForm((f) => ({ ...f, model: value }))} tooltip="Modelo aplicável específico, quando necessário." />
            <TextField label="Serial inicial" value={form.serial_from} onChange={(value) => setForm((f) => ({ ...f, serial_from: value }))} />
            <TextField label="Serial final" value={form.serial_to} onChange={(value) => setForm((f) => ({ ...f, serial_to: value }))} />
            <TextField label="Modelo do motor" value={form.engine_model} onChange={(value) => setForm((f) => ({ ...f, engine_model: value }))} />
            <SelectField label="Origem do baseline" value={form.baseline_source} options={["", ...BASELINE_SOURCES]} labels={BASELINE_SOURCE_LABELS} onChange={(value) => setForm((f) => ({ ...f, baseline_source: value as ProgramForm["baseline_source"] }))} tooltip="Origem do cadastro inicial, sem cálculo automático nesta etapa." />
            <TextArea label="Descrição técnica *" value={form.description} onChange={(value) => setForm((f) => ({ ...f, description: value }))} className="md:col-span-3" tooltip="Descrição técnica do item conforme referência adotada." />
            <NumberField label="Recorrência por horas" value={form.recurrence_hours} onChange={(value) => setForm((f) => ({ ...f, recurrence_hours: value }))} suffix="h" tooltip="Intervalo em horas. O sistema apenas salva a regra agora." />
            <NumberField label="Recorrência por calendário" value={form.recurrence_days} onChange={(value) => setForm((f) => ({ ...f, recurrence_days: value }))} suffix="dias" tooltip="Intervalo em dias corridos. O sistema apenas salva a regra agora." />
            <NumberField label="Tolerância por horas" value={form.tolerance_hours} onChange={(value) => setForm((f) => ({ ...f, tolerance_hours: value }))} suffix="h" tooltip="Tolerância em horas, apenas registrada nesta fase." />
            <NumberField label="Tolerância por calendário" value={form.tolerance_days} onChange={(value) => setForm((f) => ({ ...f, tolerance_days: value }))} suffix="dias" tooltip="Tolerância em dias, apenas registrada nesta fase." />
            <TextArea label="Notas de baseline" value={form.baseline_notes} onChange={(value) => setForm((f) => ({ ...f, baseline_notes: value }))} />
          </div>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tarefas / Checklist</h4>
                <p className="mt-1 text-xs text-slate-500">Estas tarefas aparecem na OS quando este item for selecionado.</p>
              </div>
              <button type="button" onClick={addTask} className="rounded-lg border border-sky-700 px-3 py-2 text-xs text-sky-300 hover:bg-sky-500/10">
                Adicionar tarefa
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {form.checklist_tasks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-sm text-slate-500">Nenhuma tarefa cadastrada.</p>
              ) : form.checklist_tasks.map((task, index) => (
                <div key={task.id} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3 md:grid-cols-[1fr_1.4fr_auto]">
                  <TextField label={`Titulo ${index + 1} *`} value={task.title} onChange={(value) => updateTask(task.id, { title: value })} />
                  <TextArea label="Descricao" value={task.description} onChange={(value) => updateTask(task.id, { description: value })} />
                  <div className="flex items-end gap-2">
                    <button type="button" onClick={() => moveTask(task.id, -1)} disabled={index === 0} className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 disabled:opacity-40">Subir</button>
                    <button type="button" onClick={() => moveTask(task.id, 1)} disabled={index === form.checklist_tasks.length - 1} className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-300 disabled:opacity-40">Descer</button>
                    <button type="button" onClick={() => removeTask(task.id)} className="rounded border border-red-900/70 px-2 py-2 text-xs text-red-300 hover:bg-red-500/10">Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <CheckField label="Grounding se vencido" checked={form.grounding_if_overdue} onChange={(value) => setForm((f) => ({ ...f, grounding_if_overdue: value }))} />
            <CheckField label="Bloquear despacho" checked={form.block_dispatch} onChange={(value) => setForm((f) => ({ ...f, block_dispatch: value }))} />
            <CheckField label="Requer liberacao" checked={form.requires_release} onChange={(value) => setForm((f) => ({ ...f, requires_release: value }))} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveItem()} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Salvando..." : editingId ? "Salvar item" : "Criar item"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {!formMode ? <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-[1120px] text-sm">
          <thead className="bg-slate-950/50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Título</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Categoria</th>
              <th className="px-3 py-2 text-left">Área</th>
              <th className="px-3 py-2 text-left">Prioridade</th>
              <th className="px-3 py-2 text-left">Recorrência</th>
              <th className="px-3 py-2 text-left">Documento</th>
              <th className="px-3 py-2 text-left">Tarefas</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td className="px-3 py-4 text-slate-500" colSpan={10}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-3 py-4 text-slate-500" colSpan={10}>Nenhum item cadastrado para este modelo.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 font-mono text-slate-200">{item.code}</td>
                <td className="px-3 py-2 text-slate-200">{item.title}</td>
                <td className="px-3 py-2 text-slate-400">{PROGRAM_TYPE_LABELS[item.item_type] ?? item.item_type}</td>
                <td className="px-3 py-2 text-slate-400">{PROGRAM_CATEGORY_LABELS[item.category] ?? item.category}</td>
                <td className="px-3 py-2 text-slate-400">{PROGRAM_AREA_LABELS[item.maintenance_area] ?? item.maintenance_area}</td>
                <td className="px-3 py-2 text-slate-400">{PROGRAM_PRIORITY_LABELS[item.priority] ?? item.priority}</td>
                <td className="px-3 py-2 text-slate-400">{formatRuleList(item.recurrence_rules)}</td>
                <td className="px-3 py-2 text-slate-400">{item.reference_document}</td>
                <td className="px-3 py-2 text-slate-400">{item.checklist_tasks.length}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => openEditItem(item)} className="rounded px-2 py-1 text-xs text-sky-400 hover:bg-sky-500/10">Editar</button>
                    <button type="button" onClick={() => void removeItem(item.id)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10">Remover</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : null}
    </section>
  );
}

function TextField({ label, value, onChange, className = "", tooltip }: { label: string; value: string; onChange: (value: string) => void; className?: string; tooltip?: string }) {
  return (
    <label className={className} title={tooltip ?? label}>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
    </label>
  );
}

function NumberField({ label, value, onChange, suffix, tooltip }: { label: string; value: string; onChange: (value: string) => void; suffix: string; tooltip?: string }) {
  return (
    <label title={tooltip ?? label}>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <div className="relative">
        <input type="number" min="0" step="any" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-12 text-sm text-slate-100 outline-none focus:border-sky-500" />
        <span className="pointer-events-none absolute right-3 top-2 text-xs text-slate-500">{suffix}</span>
      </div>
    </label>
  );
}

function SelectField({ label, value, options, labels = {}, onChange, tooltip }: { label: string; value: string; options: readonly string[]; labels?: Record<string, string>; onChange: (value: string) => void; tooltip?: string }) {
  return (
    <label title={tooltip ?? label}>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
        {options.map((option) => <option key={option} value={option}>{(labels[option] ?? option) || "Não informado"}</option>)}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, className = "", tooltip }: { label: string; value: string; onChange: (value: string) => void; className?: string; tooltip?: string }) {
  return (
    <label className={className} title={tooltip ?? label}>
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-800" />
      {label}
    </label>
  );
}
