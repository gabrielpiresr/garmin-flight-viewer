import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { renderMarkdownBlocks } from "../../lib/markdown";
import { dispatchNotificationEvent } from "../../lib/notificationsDb";
import { createNotice, deleteNotice, listAllNotices, updateNotice } from "../../lib/noticesDb";
import type { Notice } from "../../types/notice";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type EditorForm = {
  title: string;
  contentMd: string;
  ctaLabel: string;
  ctaUrl: string;
  publishedAtLocal: string;
  isPublished: boolean;
  sendNotification: boolean;
  bannerFile: File | null;
  removeBanner: boolean;
};

const emptyForm: EditorForm = {
  title: "",
  contentMd: "",
  ctaLabel: "",
  ctaUrl: "",
  publishedAtLocal: "",
  isPublished: true,
  sendNotification: false,
  bannerFile: null,
  removeBanner: false,
};

function formatInputDateTime(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoDate(valueLocal: string): string {
  const date = new Date(valueLocal);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function formatPublishedAt(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

export function NoticesTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await listAllNotices();
    if (listError) {
      setError(listError.message);
      setNotices([]);
    } else {
      setNotices(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  const previewBlocks = useMemo(() => renderMarkdownBlocks(form.contentMd), [form.contentMd]);

  function resetEditor() {
    setEditing(null);
    setForm({
      ...emptyForm,
      publishedAtLocal: formatInputDateTime(new Date().toISOString()),
    });
  }

  function openCreate() {
    resetEditor();
    setOpenEditor(true);
  }

  function openEdit(notice: Notice) {
    setEditing(notice);
    setForm({
      title: notice.title,
      contentMd: notice.contentMd,
      ctaLabel: notice.ctaLabel ?? "",
      ctaUrl: notice.ctaUrl ?? "",
      publishedAtLocal: formatInputDateTime(notice.publishedAt),
      isPublished: notice.isPublished,
      sendNotification: false,
      bannerFile: null,
      removeBanner: false,
    });
    setOpenEditor(true);
  }

  function insertMarkdown(before: string, after = "") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = form.contentMd.slice(start, end);
    const next = `${form.contentMd.slice(0, start)}${before}${selected}${after}${form.contentMd.slice(end)}`;
    setForm((prev) => ({ ...prev, contentMd: next }));

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + before.length + selected.length + after.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function handleSave() {
    if (!user?.id) {
      setError("Usuário admin não identificado.");
      return;
    }
    if (!form.title.trim() || !form.contentMd.trim()) {
      setError("Título e conteúdo são obrigatórios.");
      return;
    }
    if ((form.ctaLabel && !form.ctaUrl) || (!form.ctaLabel && form.ctaUrl)) {
      setError("Preencha CTA com texto e URL juntos, ou deixe ambos vazios.");
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      actorUserId: user.id,
      title: form.title.trim(),
      contentMd: form.contentMd.trim(),
      ctaLabel: form.ctaLabel.trim() || null,
      ctaUrl: form.ctaUrl.trim() || null,
      publishedAt: toIsoDate(form.publishedAtLocal),
      isPublished: form.isPublished,
      bannerFile: form.bannerFile,
      removeBanner: form.removeBanner,
    };

    const result = editing
      ? await updateNotice(editing.id, payload)
      : await createNotice({
          actorUserId: payload.actorUserId,
          title: payload.title,
          contentMd: payload.contentMd,
          ctaLabel: payload.ctaLabel,
          ctaUrl: payload.ctaUrl,
          publishedAt: payload.publishedAt,
          isPublished: payload.isPublished,
          bannerFile: payload.bannerFile,
        });

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setOpenEditor(false);
    setSaving(false);
    if (form.isPublished && form.sendNotification && result.data) {
      void dispatchNotificationEvent({
        eventType: "notice.published",
        noticeId: result.data.id,
        dedupeKey: `notice.published:${result.data.id}:${result.data.updatedAt || result.data.publishedAt}`,
        actorUserId: user.id,
        data: {
          title: result.data.title,
          contentMd: result.data.contentMd,
          ctaUrl: result.data.ctaUrl,
        },
      });
    }
    showToast({ variant: "success", message: editing ? "Aviso atualizado." : "Aviso criado." });
    await load();
  }

  async function handleDelete(notice: Notice) {
    const ok = confirm(`Apagar aviso "${notice.title}"?`);
    if (!ok) return;
    setError(null);
    const { error: deleteError } = await deleteNotice(notice.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    showToast({ variant: "success", message: "Aviso apagado." });
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Avisos da escola</h2>
          <p className="text-xs text-slate-500">Feed de comunicados com banner, artigo completo e CTA.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          Novo aviso
        </button>
      </div>

      {openEditor ? (
        <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">{editing ? "Editar aviso" : "Novo aviso"}</h3>
            <button
              type="button"
              onClick={() => setOpenEditor(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Título</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  maxLength={255}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Publicação</label>
                <input
                  type="datetime-local"
                  value={form.publishedAtLocal}
                  onChange={(e) => setForm((prev) => ({ ...prev, publishedAtLocal: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Texto do CTA</label>
                  <input
                    type="text"
                    value={form.ctaLabel}
                    onChange={(e) => setForm((prev) => ({ ...prev, ctaLabel: e.target.value }))}
                    maxLength={120}
                    placeholder="Ex: Ver cronograma"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">URL do CTA</label>
                  <input
                    type="text"
                    value={form.ctaUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, ctaUrl: e.target.value }))}
                    placeholder="https://... ou /rota-interna"
                    maxLength={2048}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Banner</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setForm((prev) => ({ ...prev, bannerFile: file, removeBanner: false }));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-200"
                />
                {editing?.bannerUrl ? (
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={form.removeBanner}
                      onChange={(e) => setForm((prev) => ({ ...prev, removeBanner: e.target.checked, bannerFile: null }))}
                    />
                    Remover banner atual
                  </label>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.checked }))}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    Publicado no feed
                    <span className="mt-0.5 block text-xs text-slate-500">Exibe o aviso para alunos e instrutores.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-slate-700/60 bg-slate-950/30 p-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.sendNotification}
                    onChange={(e) => setForm((prev) => ({ ...prev, sendNotification: e.target.checked }))}
                    disabled={!form.isPublished}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    Disparar email e push ao salvar
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Use apenas para avisos novos ou alterações importantes.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => insertMarkdown("**", "**")}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Negrito
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("*", "*")}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Itálico
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("\n- ")}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Bullet
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("\n1. ")}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Number
                </button>
              </div>

              <textarea
                ref={textareaRef}
                value={form.contentMd}
                onChange={(e) => setForm((prev) => ({ ...prev, contentMd: e.target.value }))}
                rows={12}
                placeholder="Escreva o conteúdo em markdown..."
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
              <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Preview</p>
                <div className="space-y-3 text-sm">{previewBlocks.length ? previewBlocks : <p className="text-slate-500">Sem conteúdo.</p>}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Publicar aviso"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenEditor(false);
                resetEditor();
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {!openEditor && loading ? (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40">
              <Skeleton className="h-36 w-full rounded-none" />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-16 rounded-lg" />
                  <Skeleton className="h-7 w-16 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !openEditor && notices.length === 0 ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
          Nenhum aviso cadastrado.
        </div>
      ) : !openEditor ? (
        <div className="grid grid-cols-1 gap-3">
          {notices.map((notice) => (
            <article key={notice.id} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40">
              {notice.bannerUrl ? (
                <img src={notice.bannerUrl} alt={notice.title} className="h-36 w-full object-cover" />
              ) : null}
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">{notice.title}</h3>
                    <p className="text-xs text-slate-500">{formatPublishedAt(notice.publishedAt)}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      notice.isPublished
                        ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-700 bg-slate-800 text-slate-400"
                    }`}
                  >
                    {notice.isPublished ? "Publicado" : "Rascunho"}
                  </span>
                </div>

                <div className="line-clamp-4 text-sm text-slate-300">{renderMarkdownBlocks(notice.contentMd)}</div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(notice)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(notice)}
                    className="rounded-lg border border-red-700/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
