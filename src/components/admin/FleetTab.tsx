import { useCallback, useEffect, useState } from "react";
import { listAircrafts, createAircraft, updateAircraft, toggleAircraftActive, uploadAircraftPhoto } from "../../lib/aircraftDb";
import { listModels } from "../../lib/aircraftModelsDb";
import type { Aircraft, AircraftModel } from "../../types/admin";
import { SCHOOL_ID } from "../../lib/appwrite";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const schoolId = SCHOOL_ID ?? "escola_principal";

const emptyForm = {
  model_id: "",
  registration: "",
  nickname: "",
  image_url: "",
  active: true,
};

type FilterState = "all" | "active" | "inactive";

export function FleetTab() {
  const { showToast } = useToast();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [loadingAircrafts, setLoadingAircrafts] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>("all");

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadingAircrafts(true);
    setLoadingModels(true);
    setError(null);
    listAircrafts(schoolId)
      .then(setAircrafts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingAircrafts(false));
    listModels()
      .then(setModels)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, model_id: models[0]?.id ?? "" });
    setPhotoFile(null);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(ac: Aircraft) {
    setForm({
      model_id: ac.model_id,
      registration: ac.registration,
      nickname: ac.nickname ?? "",
      image_url: ac.image_url ?? "",
      active: ac.active,
    });
    setPhotoFile(null);
    setEditingId(ac.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.registration.trim() || !form.model_id) return;
    setSaving(true);
    try {
      const imageUrl = photoFile ? await uploadAircraftPhoto(photoFile) : form.image_url.trim() || null;
      if (editingId) {
        const updated = await updateAircraft(editingId, {
          model_id: form.model_id,
          registration: form.registration.trim(),
          nickname: form.nickname.trim() || null,
          image_url: imageUrl,
          active: form.active,
        });
        setAircrafts((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      } else {
        const created = await createAircraft({
          school_id: schoolId,
          model_id: form.model_id,
          registration: form.registration.trim(),
          nickname: form.nickname.trim() || undefined,
          image_url: imageUrl ?? undefined,
          active: form.active,
        });
        setAircrafts((prev) => [...prev, created].sort((a, b) => a.registration.localeCompare(b.registration)));
      }
      setPhotoFile(null);
      setShowForm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(ac: Aircraft) {
    try {
      const updated = await toggleAircraftActive(ac.id, !ac.active);
      setAircrafts((prev) => prev.map((a) => (a.id === ac.id ? updated : a)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const modelMap = Object.fromEntries(models.map((m) => [m.id, m]));

  const visible = aircrafts.filter((a) => {
    if (filter === "active") return a.active;
    if (filter === "inactive") return !a.active;
    return true;
  });

  const activeCount = aircrafts.filter((a) => a.active).length;
  const inactiveCount = aircrafts.filter((a) => !a.active).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Frota Operacional</h2>
          <p className="text-xs text-slate-500">
            {activeCount} ativa{activeCount !== 1 ? "s" : ""} · {inactiveCount} inativa{inactiveCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {/* Filter pills */}
          {(["all", "active", "inactive"] as FilterState[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === f
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                  : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              {f === "all" ? "Todas" : f === "active" ? "Ativas" : "Inativas"}
            </button>
          ))}
          <button
            type="button"
            onClick={openCreate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 active:scale-95 sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Nova aeronave
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">
            {editingId ? "Editar aeronave" : "Nova aeronave"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Matrícula *</label>
              <input
                type="text"
                value={form.registration}
                onChange={(e) => setForm((f) => ({ ...f, registration: e.target.value.toUpperCase() }))}
                placeholder="ex: PT-XYZ"
                maxLength={8}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Apelido</label>
              <input
                type="text"
                value={form.nickname}
                onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                placeholder="ex: Cessna Branco"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Modelo *</label>
              <select
                value={form.model_id}
                onChange={(e) => setForm((f) => ({ ...f, model_id: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              >
                <option value="">Selecionar modelo</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Foto do avião</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-500"
              />
              <input
                type="url"
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                placeholder="Ou cole uma URL https://..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500"
              />
              {photoFile ? <p className="mt-1 text-[11px] text-emerald-300">Arquivo selecionado: {photoFile.name}</p> : null}
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400">Ativa</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.active}
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${form.active ? "bg-emerald-600" : "bg-slate-700"}`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${form.active ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !form.registration.trim() || !form.model_id}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Cadastrar aeronave"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhotoFile(null);
                setShowForm(false);
              }}
              className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 sm:w-auto"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Cards grid */}
      {loadingAircrafts ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/50">
              <Skeleton className="h-28 w-full rounded-none" />
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-7 flex-1 rounded-lg" />
                  <Skeleton className="h-7 flex-1 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 py-16 text-center">
          <p className="text-sm text-slate-500">
            {aircrafts.length === 0 ? "Nenhuma aeronave cadastrada." : "Nenhuma aeronave com esse filtro."}
          </p>
          {aircrafts.length === 0 && (
            <button type="button" onClick={openCreate} className="mt-3 text-sm text-emerald-400 hover:underline">
              Cadastrar primeira aeronave →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((ac) => {
            const model = modelMap[ac.model_id];
            const img = ac.image_url ?? model?.default_image;
            return (
              <div
                key={ac.id}
                className={`group relative overflow-hidden rounded-xl border transition ${
                  ac.active
                    ? "border-slate-700/60 bg-slate-900/50 hover:border-slate-600"
                    : "border-slate-800/40 bg-slate-900/20 opacity-60 hover:opacity-80"
                }`}
              >
                {/* Image */}
                <div className="relative h-28 overflow-hidden bg-slate-800">
                  {img ? (
                    <img src={img} alt={ac.registration} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-700">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-12 w-12">
                        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                      </svg>
                    </div>
                  )}
                  {/* Status badge */}
                  <div className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    ac.active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700/80 text-slate-400"
                  }`}>
                    {ac.active ? "Ativa" : "Inativa"}
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-100">{ac.registration}</p>
                      {ac.nickname && <p className="text-xs text-slate-400">{ac.nickname}</p>}
                    </div>
                    {loadingModels && !model ? (
                      <Skeleton className="h-5 w-16 rounded-full" />
                    ) : model ? (
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 whitespace-nowrap">
                        {model.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(ac)}
                      className="flex-1 rounded-lg border border-slate-700 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(ac)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs transition ${
                        ac.active
                          ? "border-amber-700/50 text-amber-500 hover:bg-amber-500/10"
                          : "border-emerald-700/50 text-emerald-500 hover:bg-emerald-500/10"
                      }`}
                    >
                      {ac.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
