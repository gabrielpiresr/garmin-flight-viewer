import { useCallback, useEffect, useState } from "react";
import { createEmptyRichContent } from "../../lib/maneuverContent";
import { getCachedBrandSettings } from "../../lib/notificationsDb";
import { getCachedSchoolRules } from "../../lib/schoolRulesDb";
import {
  getProposalConfig,
  getProposalImageUrl,
  saveProposalConfig,
  uploadProposalImage,
} from "../../lib/proposalSettingsDb";
import type { ProposalConfig, ProposalConfigInput, ProposalDifferential, ProposalSection } from "../../types/proposal";
import type { ManeuverRichContent, ManeuverMediaUpload } from "../../types/maneuver";
import { ManeuverRichTextEditor } from "./ManeuverRichTextEditor";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const MAX_SECTION_IMAGES = 6;

function emptyDiff(): ProposalDifferential {
  return { id: crypto.randomUUID(), title: "", description: "", imageFileId: null };
}

function emptySection(): ProposalSection {
  return { id: crypto.randomUUID(), title: "", description: "", imageIds: [] };
}

function toEmptyConfig(): ProposalConfigInput {
  const brand = getCachedBrandSettings();
  const rules = getCachedSchoolRules();
  return {
    schoolId: "escola_principal",
    differentials: [],
    sections: [],
    paymentMethodsRichJson: null,
    additionalInfoRichJson: null,
    schoolName: brand?.schoolName ?? "",
    logoUrl: brand?.logoUrl ?? "",
    coverVideoUrl: "",
    primaryColor: rules?.theme.primaryColor ?? "#10b981",
    accentColor: rules?.theme.accentColor ?? "#38bdf8",
    fontFamily: rules?.theme.fontFamily ?? "",
  };
}

function configToInput(config: ProposalConfig): ProposalConfigInput {
  return {
    schoolId: config.schoolId,
    differentials: config.differentials.map((d) => ({ ...d })),
    sections: config.sections.map((s) => ({ ...s, imageIds: [...s.imageIds] })),
    paymentMethodsRichJson: config.paymentMethodsRichJson,
    additionalInfoRichJson: config.additionalInfoRichJson,
    schoolName: config.schoolName,
    logoUrl: config.logoUrl,
    coverVideoUrl: config.coverVideoUrl,
    primaryColor: config.primaryColor,
    accentColor: config.accentColor,
    fontFamily: config.fontFamily,
  };
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none";

export function ProposalSettingsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProposalConfigInput>(toEmptyConfig);
  const [diffUploadingId, setDiffUploadingId] = useState<string | null>(null);
  const [sectionUploadingId, setSectionUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const config = await getProposalConfig();
      setForm(config ? configToInput(config) : toEmptyConfig());
    } catch {
      setForm(toEmptyConfig());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ─── brand sync ──────────────────────────────────────────────────────────────

  function syncBrand() {
    const brand = getCachedBrandSettings();
    const rules = getCachedSchoolRules();
    setForm((prev) => ({
      ...prev,
      schoolName: brand?.schoolName ?? prev.schoolName,
      logoUrl: brand?.logoUrl ?? prev.logoUrl,
      primaryColor: rules?.theme.primaryColor ?? prev.primaryColor,
      accentColor: rules?.theme.accentColor ?? prev.accentColor,
      fontFamily: rules?.theme.fontFamily ?? prev.fontFamily,
    }));
    showToast({ variant: "success", message: "Branding sincronizado das configurações de aparência." });
  }

  function syncFrc() {
    const rules = getCachedSchoolRules();
    const frc = rules?.flightReviewClub;
    if (!frc) {
      showToast({ variant: "warning", message: "Configure o Flight Review Club em Configurações → Regras primeiro." });
      return;
    }
    const benefits = frc.benefits ?? [];
    const description = benefits.length > 0
      ? "Benefícios incluídos:\n" + benefits.map((b) => `• ${b}`).join("\n")
      : "Acesso ao programa de revisões de voo da escola.";

    setForm((prev) => {
      const hasFrc = prev.sections.some((s) => s.triggerProductKeyword);
      if (hasFrc) {
        return {
          ...prev,
          sections: prev.sections.map((s) =>
            s.triggerProductKeyword ? { ...s, title: "Flight Review Club", description } : s
          ),
        };
      }
      return {
        ...prev,
        sections: [
          ...prev.sections,
          { id: crypto.randomUUID(), title: "Flight Review Club", description, imageIds: [], triggerProductKeyword: "flight review" },
        ],
      };
    });
    showToast({ variant: "success", message: "Seção do Flight Review Club adicionada/atualizada." });
  }

  // ─── save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await saveProposalConfig(form);
      if (error) throw error;
      showToast({ variant: "success", message: "Configurações de proposta salvas." });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // ─── differentials ───────────────────────────────────────────────────────────

  function addDifferential() {
    setForm((prev) => ({ ...prev, differentials: [...prev.differentials, emptyDiff()] }));
  }

  function removeDifferential(id: string) {
    setForm((prev) => ({ ...prev, differentials: prev.differentials.filter((d) => d.id !== id) }));
  }

  function updateDifferential(id: string, patch: Partial<ProposalDifferential>) {
    setForm((prev) => ({
      ...prev,
      differentials: prev.differentials.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }

  async function handleDiffImageUpload(id: string, file: File) {
    setDiffUploadingId(id);
    try {
      const result = await uploadProposalImage(file);
      if (result) updateDifferential(id, { imageFileId: result.fileId });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setDiffUploadingId(null);
    }
  }

  // ─── sections ────────────────────────────────────────────────────────────────

  function addSection() {
    setForm((prev) => ({ ...prev, sections: [...prev.sections, emptySection()] }));
  }

  function removeSection(id: string) {
    setForm((prev) => ({ ...prev, sections: prev.sections.filter((s) => s.id !== id) }));
  }

  function updateSection(id: string, patch: Partial<ProposalSection>) {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  async function handleSectionImageUpload(sectionId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const section = form.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const available = MAX_SECTION_IMAGES - section.imageIds.length;
    if (available <= 0) {
      showToast({ variant: "warning", message: `Máximo de ${MAX_SECTION_IMAGES} imagens por seção.` });
      return;
    }
    setSectionUploadingId(sectionId);
    try {
      const toUpload = Array.from(files).slice(0, available);
      const ids: string[] = [];
      for (const file of toUpload) {
        const result = await uploadProposalImage(file);
        if (result) ids.push(result.fileId);
      }
      updateSection(sectionId, { imageIds: [...section.imageIds, ...ids] });
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSectionUploadingId(null);
    }
  }

  function removeSectionImage(sectionId: string, imageId: string) {
    const section = form.sections.find((s) => s.id === sectionId);
    if (!section) return;
    updateSection(sectionId, { imageIds: section.imageIds.filter((id) => id !== imageId) });
  }

  // ─── rich media ──────────────────────────────────────────────────────────────

  async function handleRichMediaUpload(file: File): Promise<ManeuverMediaUpload | null> {
    const result = await uploadProposalImage(file);
    if (!result) return null;
    return { fileId: result.fileId, url: result.url, name: file.name, mimeType: file.type };
  }

  if (loading) {
    return (
      <section className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <Skeleton className="h-5 w-48 mb-4" />
            <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-10 rounded-lg" /><Skeleton className="h-10 rounded-lg" /></div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Identidade visual ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Identidade visual</h3>
            <p className="mt-1 text-xs text-slate-500">Logo, cores e fonte usadas na proposta. "Sincronizar" puxa os valores de Aparência.</p>
          </div>
          <button type="button" onClick={syncBrand}
            className="shrink-0 rounded-lg border border-sky-700/50 bg-sky-600/10 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-600/20 transition">
            Sincronizar da Aparência
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-400">Nome da escola</label>
            <input type="text" value={form.schoolName} onChange={(e) => setForm((p) => ({ ...p, schoolName: e.target.value }))} placeholder="Ex: Sky Academy" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400">URL da logo</label>
            <input type="url" value={form.logoUrl} onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Cor primária</label>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={form.primaryColor} onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border border-slate-700 bg-transparent" />
              <input type="text" value={form.primaryColor} onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))} className="flex-1 rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Cor de destaque</label>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={form.accentColor} onChange={(e) => setForm((p) => ({ ...p, accentColor: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border border-slate-700 bg-transparent" />
              <input type="text" value={form.accentColor} onChange={(e) => setForm((p) => ({ ...p, accentColor: e.target.value }))} className="flex-1 rounded-lg border border-slate-700 bg-[var(--bg)] px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Família de fonte (Google Fonts)</label>
            <input type="text" value={form.fontFamily} onChange={(e) => setForm((p) => ({ ...p, fontFamily: e.target.value }))} placeholder="Inter, Poppins, Montserrat..." className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-400">Vídeo de capa (YouTube)</label>
            <input type="url" value={form.coverVideoUrl} onChange={(e) => setForm((p) => ({ ...p, coverVideoUrl: e.target.value }))} placeholder="https://youtube.com/watch?v=..." className={inputCls} />
            <p className="mt-1 text-xs text-slate-600">Aparece no topo da proposta, antes dos diferenciais.</p>
          </div>
          {form.logoUrl && (
            <div className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
              <img src={form.logoUrl} alt="Logo" className="h-10 max-w-[120px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-xs text-slate-500">Preview</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Diferenciais ──────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Diferenciais da escola</h3>
            <p className="mt-1 text-xs text-slate-500">Aparecem antes da proposta, destacando os pontos fortes da escola.</p>
          </div>
          <button type="button" onClick={addDifferential}
            className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 transition">
            + Adicionar
          </button>
        </div>

        {form.differentials.length === 0 && (
          <p className="mt-4 text-xs text-slate-600">Nenhum diferencial. Clique em "Adicionar" para começar.</p>
        )}

        <div className="mt-4 space-y-4">
          {form.differentials.map((diff, idx) => (
            <div key={diff.id} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400">Diferencial #{idx + 1}</span>
                <button type="button" onClick={() => removeDifferential(diff.id)} className="text-xs text-red-400 hover:text-red-300 transition">Remover</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-400">Título</label>
                  <input type="text" value={diff.title} onChange={(e) => updateDifferential(diff.id, { title: e.target.value })} placeholder="Ex: Instrutores certificados" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Imagem (opcional)</label>
                  <div className="mt-1 flex items-center gap-2">
                    {diff.imageFileId && (
                      <img src={getProposalImageUrl(diff.imageFileId)} alt={diff.title} className="h-9 w-16 rounded object-cover border border-slate-700" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                    <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 transition">
                      {diffUploadingId === diff.id ? "Enviando..." : diff.imageFileId ? "Trocar" : "Subir foto"}
                      <input type="file" accept="image/*" className="sr-only" disabled={diffUploadingId === diff.id}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleDiffImageUpload(diff.id, f); e.target.value = ""; }} />
                    </label>
                    {diff.imageFileId && (
                      <button type="button" onClick={() => updateDifferential(diff.id, { imageFileId: null })} className="text-xs text-red-400 hover:text-red-300">Remover</button>
                    )}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400">Descrição</label>
                  <textarea value={diff.description} onChange={(e) => updateDifferential(diff.id, { description: e.target.value })} rows={2} placeholder="Breve descrição..." className={`${inputCls} resize-none`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Seções da proposta ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Seções da proposta</h3>
            <p className="mt-1 text-xs text-slate-500">
              Seções personalizadas com título, imagens e descrição. Use "Keyword" para exibir a seção somente quando um determinado item estiver na proposta.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={syncFrc}
              className="rounded-lg border border-amber-700/50 bg-amber-600/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-600/20 transition">
              + FRC
            </button>
            <button type="button" onClick={addSection}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 transition">
              + Adicionar
            </button>
          </div>
        </div>

        {form.sections.length === 0 && (
          <p className="mt-4 text-xs text-slate-600">Nenhuma seção criada. Clique em "+ Adicionar" para criar ou "+ FRC" para adicionar o Flight Review Club automaticamente.</p>
        )}

        <div className="mt-4 space-y-5">
          {form.sections.map((sec, idx) => (
            <div key={sec.id} className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Seção #{idx + 1}</span>
                  {sec.triggerProductKeyword && (
                    <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-[10px] text-amber-300 border border-amber-700/40">
                      condicional: "{sec.triggerProductKeyword}"
                    </span>
                  )}
                </div>
                <button type="button" onClick={() => removeSection(sec.id)} className="text-xs text-red-400 hover:text-red-300 transition">Remover</button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-400">Título da seção</label>
                  <input type="text" value={sec.title} onChange={(e) => updateSection(sec.id, { title: e.target.value })} placeholder="Ex: Nossa frota, Estrutura, Flight Review Club..." className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Keyword (opcional — exibe só se item der match)</label>
                  <input type="text" value={sec.triggerProductKeyword ?? ""} onChange={(e) => updateSection(sec.id, { triggerProductKeyword: e.target.value || undefined })} placeholder="Ex: flight review, seguro, simulador..." className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Vídeo da seção (YouTube)</label>
                  <input type="url" value={sec.videoUrl ?? ""} onChange={(e) => updateSection(sec.id, { videoUrl: e.target.value || undefined })} placeholder="https://youtube.com/watch?v=..." className={inputCls} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400">Descrição</label>
                  <textarea value={sec.description} onChange={(e) => updateSection(sec.id, { description: e.target.value })} rows={3} placeholder="Descreva esta seção para o aluno..." className={`${inputCls} resize-none`} />
                </div>
              </div>

              {/* Imagens da seção */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-slate-400">
                    Imagens <span className="text-slate-600">({sec.imageIds.length}/{MAX_SECTION_IMAGES})</span>
                  </label>
                  {sec.imageIds.length < MAX_SECTION_IMAGES && (
                    <label className="cursor-pointer rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 transition">
                      {sectionUploadingId === sec.id ? "Enviando..." : "+ fotos"}
                      <input type="file" accept="image/*" multiple className="sr-only" disabled={sectionUploadingId === sec.id}
                        onChange={(e) => { void handleSectionImageUpload(sec.id, e.target.files); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
                {sec.imageIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sec.imageIds.map((imgId) => (
                      <div key={imgId} className="relative group h-20 w-28 overflow-hidden rounded-lg border border-slate-700/60">
                        <img src={getProposalImageUrl(imgId)} alt="" className="h-full w-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
                        <button type="button" onClick={() => removeSectionImage(sec.id, imgId)}
                          className="desktop-group-hover-flex absolute top-1 right-1 items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-xs">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Formas de pagamento ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-300">Formas de pagamento</h3>
        <p className="mb-4 text-xs text-slate-500">Texto exibido na seção de pagamento da proposta.</p>
        <ManeuverRichTextEditor
          value={(form.paymentMethodsRichJson ?? createEmptyRichContent()) as ManeuverRichContent}
          onChange={(val) => setForm((p) => ({ ...p, paymentMethodsRichJson: val as Record<string, unknown> }))}
          onUploadMedia={handleRichMediaUpload}
          placeholder="Descreva as opções de pagamento..."
        />
      </section>

      {/* ── Informações adicionais ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-300">Informações adicionais</h3>
        <p className="mb-4 text-xs text-slate-500">Texto complementar no final da proposta.</p>
        <ManeuverRichTextEditor
          value={(form.additionalInfoRichJson ?? createEmptyRichContent()) as ManeuverRichContent}
          onChange={(val) => setForm((p) => ({ ...p, additionalInfoRichJson: val as Record<string, unknown> }))}
          onUploadMedia={handleRichMediaUpload}
          placeholder="Informações sobre matrícula, documentação necessária, etc..."
        />
      </section>

      {/* ── Salvar ────────────────────────────────────────────────────────────── */}
      <div className="flex justify-end border-t border-slate-800 pt-4">
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="rounded-lg bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition">
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}
