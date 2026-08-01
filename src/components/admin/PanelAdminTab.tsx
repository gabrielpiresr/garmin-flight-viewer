import { useCallback, useEffect, useMemo, useState } from "react";
import { usePermissions } from "../../contexts/PermissionsContext";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import { listAircrafts } from "../../lib/aircraftDb";
import {
  createAircraftPanel,
  deleteAircraftPanel,
  listAircraftPanels,
  updateAircraftPanel,
  uploadPanelMedia,
} from "../../lib/aircraftPanelsDb";
import { PANEL_SEED_TEMPLATES } from "../../lib/panelSeeds";
import type { Aircraft } from "../../types/admin";
import type { AircraftPanel, PanelInstrument, PanelSeedTemplate } from "../../types/panel";
import { InteractivePanelViewer } from "../InteractivePanelViewer";
import { PanelHotspotEditor } from "../panel/PanelHotspotEditor";
import { useToast } from "../ui/ToastProvider";

export function PanelAdminTab() {
  const { canAction } = usePermissions();
  const canEdit = canAction("content.edit");
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [panels, setPanels] = useState<AircraftPanel[]>([]);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    aircraft_id: string;
    title: string;
    panel_image_url: string;
    panel_image_file_id: string | null;
    instruments: PanelInstrument[];
    published: boolean;
  } | null>(null);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seedTemplateId, setSeedTemplateId] = useState(PANEL_SEED_TEMPLATES[0]?.id ?? "");
  const [seedAircraftId, setSeedAircraftId] = useState("");
  const [preview, setPreview] = useState(false);

  const aircraftOptions = useMemo(
    () =>
      aircrafts.map((a) => ({
        id: a.id,
        label: `${a.registration}${a.nickname ? ` — ${a.nickname}` : ""}`,
      })),
    [aircrafts],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, aircraftRows] = await Promise.all([
        listAircraftPanels(DEFAULT_SCHOOL_ID),
        listAircrafts(DEFAULT_SCHOOL_ID).catch(() => [] as Aircraft[]),
      ]);
      if (pRes.error) showToast({ variant: "error", message: pRes.error.message });
      setPanels(pRes.data ?? []);
      setAircrafts(aircraftRows.filter((a) => a.active && !a.deleted_at));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!seedAircraftId && aircrafts[0]) setSeedAircraftId(aircrafts[0].id);
  }, [aircrafts, seedAircraftId]);

  const editing = editingId ? panels.find((p) => p.id === editingId) : null;
  const selectedInstrument = draft?.instruments.find((i) => i.id === selectedInstrumentId) ?? null;

  function startCreate() {
    if (!canEdit) return;
    setEditingId(null);
    setDraft({
      aircraft_id: aircrafts[0]?.id ?? "",
      title: "Novo painel",
      panel_image_url: "",
      panel_image_file_id: null,
      instruments: [],
      published: false,
    });
    setSelectedInstrumentId(null);
    setPreview(false);
  }

  function startEdit(panel: AircraftPanel) {
    setEditingId(panel.id);
    setDraft({
      aircraft_id: panel.aircraft_id,
      title: panel.title,
      panel_image_url: panel.panel_image_url,
      panel_image_file_id: panel.panel_image_file_id,
      instruments: panel.instruments.map((i) => ({ ...i })),
      published: panel.published,
    });
    setSelectedInstrumentId(null);
    setPreview(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setSelectedInstrumentId(null);
    setPreview(false);
  }

  async function onUploadPanel(file: File) {
    if (!canEdit || !draft) return;
    const { data, error } = await uploadPanelMedia(file);
    if (error || !data) {
      showToast({ variant: "error", message: error?.message ?? "Falha no upload" });
      return;
    }
    setDraft({ ...draft, panel_image_url: data.url, panel_image_file_id: data.fileId });
    showToast({ variant: "success", message: "Imagem do painel enviada" });
  }

  async function onUploadZoom(file: File) {
    if (!canEdit || !draft || !selectedInstrumentId) return;
    const { data, error } = await uploadPanelMedia(file);
    if (error || !data) {
      showToast({ variant: "error", message: error?.message ?? "Falha no upload" });
      return;
    }
    setDraft({
      ...draft,
      instruments: draft.instruments.map((i) =>
        i.id === selectedInstrumentId ? { ...i, zoom_image_url: data.url } : i,
      ),
    });
    showToast({ variant: "success", message: "Imagem de zoom enviada" });
  }

  async function save() {
    if (!canEdit || !draft) return;
    if (!draft.aircraft_id) {
      showToast({ variant: "error", message: "Selecione a aeronave" });
      return;
    }
    if (!draft.panel_image_url.trim()) {
      showToast({ variant: "error", message: "Envie a imagem do painel" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const { data, error } = await updateAircraftPanel(editingId, {
          aircraft_id: draft.aircraft_id,
          title: draft.title.trim() || "Painel",
          panel_image_url: draft.panel_image_url,
          panel_image_file_id: draft.panel_image_file_id,
          instruments: draft.instruments,
          published: draft.published,
        });
        if (error || !data) throw error ?? new Error("Falha ao salvar");
        setPanels((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        showToast({ variant: "success", message: "Painel atualizado" });
      } else {
        const existing = panels.find((p) => p.aircraft_id === draft.aircraft_id);
        if (existing) {
          showToast({ variant: "error", message: "Esta aeronave já tem um painel. Edite o existente." });
          setSaving(false);
          return;
        }
        const { data, error } = await createAircraftPanel({
          school_id: DEFAULT_SCHOOL_ID,
          aircraft_id: draft.aircraft_id,
          title: draft.title.trim() || "Painel",
          panel_image_url: draft.panel_image_url,
          panel_image_file_id: draft.panel_image_file_id,
          instruments: draft.instruments,
          published: draft.published,
        });
        if (error || !data) throw error ?? new Error("Falha ao criar");
        setPanels((prev) => [data, ...prev]);
        setEditingId(data.id);
        showToast({ variant: "success", message: "Painel criado" });
      }
    } catch (e) {
      showToast({ variant: "error", message: e instanceof Error ? e.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  async function removePanel(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Excluir este painel?")) return;
    const { error } = await deleteAircraftPanel(id);
    if (error) {
      showToast({ variant: "error", message: error.message });
      return;
    }
    setPanels((prev) => prev.filter((p) => p.id !== id));
    if (editingId === id) cancelEdit();
    showToast({ variant: "success", message: "Painel excluído" });
  }

  async function applySeed() {
    if (!canEdit) return;
    const template = PANEL_SEED_TEMPLATES.find((t) => t.id === seedTemplateId) as PanelSeedTemplate | undefined;
    if (!template || !seedAircraftId) {
      showToast({ variant: "error", message: "Escolha o template e a aeronave" });
      return;
    }
    if (panels.some((p) => p.aircraft_id === seedAircraftId)) {
      showToast({ variant: "error", message: "Essa aeronave já possui painel" });
      return;
    }
    const ac = aircrafts.find((a) => a.id === seedAircraftId);
    setSaving(true);
    try {
      const { data, error } = await createAircraftPanel({
        school_id: DEFAULT_SCHOOL_ID,
        aircraft_id: seedAircraftId,
        title: `${template.title}${ac ? ` — ${ac.registration}` : ""}`,
        panel_image_url: template.panel_image_url,
        panel_image_file_id: null,
        instruments: template.instruments.map((i) => ({ ...i })),
        published: true,
      });
      if (error || !data) throw error ?? new Error("Falha ao aplicar seed");
      setPanels((prev) => [data, ...prev]);
      startEdit(data);
      showToast({ variant: "success", message: "Seed aplicado — ajuste os hotspots se precisar" });
    } catch (e) {
      showToast({ variant: "error", message: e instanceof Error ? e.message : "Erro no seed" });
    } finally {
      setSaving(false);
    }
  }

  function patchSelected(patch: Partial<PanelInstrument>) {
    if (!draft || !selectedInstrumentId) return;
    setDraft({
      ...draft,
      instruments: draft.instruments.map((i) => (i.id === selectedInstrumentId ? { ...i, ...patch } : i)),
    });
  }

  function removeSelected() {
    if (!draft || !selectedInstrumentId) return;
    setDraft({
      ...draft,
      instruments: draft.instruments.filter((i) => i.id !== selectedInstrumentId),
    });
    setSelectedInstrumentId(null);
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">Carregando painéis...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Painel interativo</h2>
          <p className="text-sm text-slate-400">
            Um painel por aeronave. Alunos e instrutores só visualizam; somente quem tem permissão de editar conteúdo altera.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Novo painel
          </button>
        ) : null}
      </div>

      {canEdit ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Aplicar seed (mockups EPEAC)</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs text-slate-400">
              Template
              <select
                value={seedTemplateId}
                onChange={(e) => setSeedTemplateId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                {PANEL_SEED_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-xs text-slate-400">
              Aeronave
              <select
                value={seedAircraftId}
                onChange={(e) => setSeedAircraftId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                {aircrafts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.registration}
                    {a.nickname ? ` — ${a.nickname}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={saving || !aircrafts.length}
              onClick={() => void applySeed()}
              className="rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/40 disabled:opacity-50"
            >
              Aplicar seed
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Aeronave</th>
              <th className="px-4 py-3">Instrumentos</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {panels.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Nenhum painel cadastrado. Use o seed ou crie um novo.
                </td>
              </tr>
            ) : (
              panels.map((p) => {
                const ac = aircraftOptions.find((a) => a.id === p.aircraft_id);
                return (
                  <tr key={p.id} className="border-b border-slate-800/80">
                    <td className="px-4 py-3 text-slate-200">{p.title}</td>
                    <td className="px-4 py-3 text-slate-400">{ac?.label ?? p.aircraft_id}</td>
                    <td className="px-4 py-3 text-slate-400">{p.instruments.length}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          p.published ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/50 text-slate-400"
                        }`}
                      >
                        {p.published ? "Publicado" : "Rascunho"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="mr-2 text-xs text-sky-400 hover:text-sky-300"
                      >
                        {canEdit ? "Editar" : "Ver"}
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void removePanel(p.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Excluir
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {draft ? (
        <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-100">{editing ? "Editar painel" : "Novo painel"}</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              >
                {preview ? "Editor" : "Preview"}
              </button>
              <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                Fechar
              </button>
            </div>
          </div>

          {preview ? (
            <InteractivePanelViewer
              panels={[
                {
                  id: editingId ?? "draft",
                  school_id: DEFAULT_SCHOOL_ID,
                  aircraft_id: draft.aircraft_id,
                  title: draft.title,
                  panel_image_url: draft.panel_image_url,
                  panel_image_file_id: draft.panel_image_file_id,
                  instruments: draft.instruments,
                  published: true,
                  updated_at: "",
                  created_at: "",
                },
              ]}
              aircraftOptions={aircraftOptions}
              fixedPanelId={editingId ?? "draft"}
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Título
                  <input
                    value={draft.title}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Aeronave
                  <select
                    value={draft.aircraft_id}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, aircraft_id: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">Selecione...</option>
                    {aircrafts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.registration}
                        {a.nickname ? ` — ${a.nickname}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Imagem do painel
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!canEdit}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadPanel(f);
                    }}
                    className="mt-1 block w-full text-sm text-slate-300"
                  />
                </label>
                <label className="flex items-center gap-2 pt-5 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.published}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                  />
                  Publicado (visível para alunos/instrutores)
                </label>
              </div>

              {draft.panel_image_url ? (
                <p className="truncate text-[11px] text-slate-500">{draft.panel_image_url}</p>
              ) : null}

              <PanelHotspotEditor
                panelImageUrl={draft.panel_image_url}
                instruments={draft.instruments}
                selectedId={selectedInstrumentId}
                onSelect={setSelectedInstrumentId}
                onChange={(instruments) => setDraft({ ...draft, instruments })}
                disabled={!canEdit}
              />

              {selectedInstrument ? (
                <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    Nome
                    <input
                      value={selectedInstrument.name}
                      disabled={!canEdit}
                      onChange={(e) => patchSelected({ name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Formato
                    <select
                      value={selectedInstrument.shape}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patchSelected({ shape: e.target.value as PanelInstrument["shape"] })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="rect">Retangular</option>
                      <option value="circle">Circular</option>
                    </select>
                  </label>
                  <label className="sm:col-span-2 text-xs text-slate-400">
                    Descrição
                    <textarea
                      value={selectedInstrument.description}
                      disabled={!canEdit}
                      rows={3}
                      onChange={(e) => patchSelected({ description: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Zoom (imagem)
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!canEdit}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onUploadZoom(f);
                      }}
                      className="mt-1 block w-full text-sm text-slate-300"
                    />
                    {selectedInstrument.zoom_image_url ? (
                      <span className="mt-1 block truncate text-[10px] text-slate-500">
                        {selectedInstrument.zoom_image_url}
                      </span>
                    ) : null}
                  </label>
                  {canEdit ? (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={removeSelected}
                        className="rounded-lg border border-red-800/60 px-3 py-2 text-xs text-red-300"
                      >
                        Remover instrumento
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canEdit ? (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
