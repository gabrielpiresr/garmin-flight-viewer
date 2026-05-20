import { useCallback, useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TipTapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/react";
import {
  createAndSendBroadcast,
  createBroadcastSegment,
  deleteBroadcastSegment,
  getResendAccountInfo,
  listBroadcastMessages,
  listBroadcastSegments,
  previewBroadcastRecipients,
} from "../../lib/broadcastDb";
import { listTrainingTracks } from "../../lib/trainingTracksDb";
import type {
  BroadcastMessage,
  BroadcastRecipientPreview,
  BroadcastSegment,
  NumericRange,
  RecipientFilter,
  RecipientFilterRole,
  ResendAccountInfo,
  StudentProgressFilter,
} from "../../types/broadcast";

// ── TipTap email editor ───────────────────────────────────────────────────────

const EMAIL_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    protocols: ["http", "https", "mailto"],
    HTMLAttributes: { rel: "noreferrer" },
  }),
  TipTapImage.configure({ HTMLAttributes: { style: "max-width:100%;height:auto;" } }),
  Placeholder.configure({ placeholder: "Escreva o conteúdo do email aqui…" }),
];

function editorToHtml(json: JSONContent): string {
  try {
    return generateHTML(json, EMAIL_EXTENSIONS);
  } catch {
    return "";
  }
}

function EmailRichEditor({
  onChange,
  disabled = false,
}: {
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const editor = useEditor({
    extensions: EMAIL_EXTENSIONS,
    immediatelyRender: false,
    editable: !disabled,
    onUpdate: ({ editor: e }) => onChange(editorToHtml(e.getJSON())),
    editorProps: {
      attributes: {
        class:
          "min-h-72 px-5 py-4 text-sm text-slate-900 leading-relaxed outline-none prose prose-sm max-w-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  function addLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function addImage() {
    if (!editor) return;
    const url = window.prompt("URL pública da imagem");
    if (!url?.trim()) return;
    editor.chain().focus().setImage({ src: url.trim() }).run();
  }

  const btn = (label: string, action: () => void, active?: boolean) => (
    <button
      key={label}
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        action();
      }}
      className={`rounded border px-2 py-1 text-xs transition ${
        active
          ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
          : "border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
      }`}
    >
      {label}
    </button>
  );

  const sep = <span className="mx-0.5 h-5 w-px self-center bg-slate-700" />;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-700 bg-slate-900/80 p-2">
        {btn("N", () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}
        {btn("I", () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}
        {btn("S̶", () => editor?.chain().focus().toggleStrike().run(), editor?.isActive("strike"))}
        {sep}
        {btn("H1", () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), editor?.isActive("heading", { level: 1 }))}
        {btn("H2", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
        {btn("H3", () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive("heading", { level: 3 }))}
        {sep}
        {btn("• Lista", () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList"))}
        {btn("1. Lista", () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))}
        {btn("Destaque", () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive("blockquote"))}
        {btn("—", () => editor?.chain().focus().setHorizontalRule().run())}
        {sep}
        {btn("Link", addLink, editor?.isActive("link"))}
        {btn("Imagem", addImage)}
        {sep}
        {btn("Limpar", () => editor?.chain().focus().clearNodes().unsetAllMarks().run())}
      </div>
      <div className="bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

const EMPTY_RANGE: NumericRange = { min: "", max: "" };

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: NumericRange;
  onChange: (v: NumericRange) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })}
          placeholder="Min"
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
        />
        <input
          type="number"
          value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })}
          placeholder="Max"
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
        />
      </div>
    </div>
  );
}

function StudentFilterPanel({
  value,
  onChange,
  trackOptions,
}: {
  value: StudentProgressFilter;
  onChange: (v: StudentProgressFilter) => void;
  trackOptions: string[];
}) {
  const get = (key: keyof StudentProgressFilter) =>
    (value[key] as NumericRange | undefined) ?? EMPTY_RANGE;
  const setRange = (key: keyof StudentProgressFilter, v: NumericRange) =>
    onChange({ ...value, [key]: v });
  const tracks = value.tracks ?? [];
  const toggleTrack = (t: string) =>
    onChange({
      ...value,
      tracks: tracks.includes(t) ? tracks.filter((x) => x !== t) : [...tracks, t],
    });

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Filtros de alunos
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RangeInput
          label="Dias sem voar"
          value={get("daysWithoutFlying")}
          onChange={(v) => setRange("daysWithoutFlying", v)}
        />
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Trilha</p>
          {trackOptions.length === 0 ? (
            <p className="text-xs text-slate-600 italic">Nenhuma trilha encontrada</p>
          ) : (
            <div className="max-h-24 overflow-y-auto rounded border border-slate-800 bg-slate-950/60 p-2">
              {trackOptions.map((t) => (
                <label key={t} className="flex items-center gap-2 py-0.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tracks.includes(t)}
                    onChange={() => toggleTrack(t)}
                    className="h-3.5 w-3.5 accent-sky-500"
                  />
                  <span className="truncate">{t}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <RangeInput label="Qtd. horas" value={get("hours")} onChange={(v) => setRange("hours", v)} />
        <RangeInput
          label="% concluído"
          value={get("progress")}
          onChange={(v) => setRange("progress", v)}
        />
        <RangeInput label="Qtd. voos" value={get("flights")} onChange={(v) => setRange("flights", v)} />
        <RangeInput
          label="Qtd. pousos"
          value={get("landings")}
          onChange={(v) => setRange("landings", v)}
        />
      </div>
      {Object.keys(value).some((k) => {
        const v = value[k as keyof StudentProgressFilter];
        if (Array.isArray(v)) return v.length > 0;
        if (v && typeof v === "object") return (v as NumericRange).min !== "" || (v as NumericRange).max !== "";
        return false;
      }) && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="mt-2 text-xs text-slate-600 hover:text-slate-400"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function parseCustomEmails(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
}

function AccountLimits({
  accountInfo,
  segmentCount,
}: {
  accountInfo: ResendAccountInfo;
  segmentCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400">
        {segmentCount}/3 segmentos
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
        100 emails/dia · 3.000/mês
      </span>
      {accountInfo?.email && (
        <span className="text-xs text-slate-500">{accountInfo.full_name || accountInfo.email}</span>
      )}
    </div>
  );
}

function SegmentCard({
  segment,
  selected,
  onSelect,
  onDelete,
}: {
  segment: BroadcastSegment;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filterLabel: Record<RecipientFilterRole, string> = {
    todos: "Todos",
    aluno: "Alunos",
    instrutor: "Instrutores",
    custom: "Emails personalizados",
  };

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(segment.id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border p-4 transition ${
        selected
          ? "border-sky-500/50 bg-sky-500/5"
          : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {onSelect && (
            <span
              className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition ${
                selected ? "border-sky-500 bg-sky-500" : "border-slate-600"
              }`}
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-100">{segment.name}</p>
            {segment.description && (
              <p className="mt-0.5 truncate text-sm text-slate-500">{segment.description}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-800 px-2 py-0.5 font-medium text-slate-300">
                {segment.memberCount} destinatário{segment.memberCount !== 1 ? "s" : ""}
              </span>
              {segment.recipientFilter?.role && (
                <span>{filterLabel[segment.recipientFilter.role]}</span>
              )}
              <span>{formatDate(segment.createdAt)}</span>
            </div>
          </div>
        </div>
        {onDelete && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={(e) => void handleDelete(e)}
              disabled={deleting}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                confirmDelete
                  ? "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-slate-700 text-slate-500 hover:border-red-500/30 hover:text-red-400"
              }`}
            >
              {deleting ? "…" : confirmDelete ? "Confirmar" : "Excluir"}
            </button>
            {confirmDelete && !deleting && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                }}
                className="text-[11px] text-slate-600 hover:text-slate-400"
              >
                Cancelar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessagesList({ messages, loading }: { messages: BroadcastMessage[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusLabel: Record<BroadcastMessage["status"], string> = {
    sent: "Enviado",
    failed: "Falhou",
    draft: "Rascunho",
  };
  const statusClass: Record<BroadcastMessage["status"], string> = {
    sent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    failed: "bg-red-500/10 text-red-400 border-red-500/30",
    draft: "bg-slate-700/50 text-slate-400 border-slate-600/30",
  };

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Histórico de disparos</h2>
      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-800/50" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 py-8 text-center text-sm text-slate-600">
          Nenhum disparo realizado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const isExpanded = expandedId === msg.id;
            return (
              <div
                key={msg.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-200">{msg.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {msg.segmentName ?? "—"} · {msg.recipientCount} destinatário
                      {msg.recipientCount !== 1 ? "s" : ""} · {formatDate(msg.sentAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass[msg.status]}`}
                    >
                      {statusLabel[msg.status]}
                    </span>
                    {msg.bodyHtml && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                        className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
                      >
                        {isExpanded ? "Fechar" : "Ver conteúdo"}
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && msg.bodyHtml && (
                  <div className="border-t border-slate-800">
                    <div
                      className="max-h-96 overflow-auto bg-white p-4 text-sm text-slate-900"
                      dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Segmento", "Conteúdo", "Revisão"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === current;
        const done = n < current;
        return (
          <div key={n} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                  active ? "bg-sky-500 text-white" : done ? "bg-sky-900/60 text-sky-400" : "bg-slate-800 text-slate-500"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span
                className={`text-sm font-medium ${active ? "text-sky-400" : done ? "text-slate-400" : "text-slate-600"}`}
              >
                {label}
              </span>
            </div>
            {i < 2 && <span className="text-slate-700">›</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── New Segment Form ──────────────────────────────────────────────────────────

function NewSegmentForm({
  onCreated,
  onCancel,
}: {
  onCreated: (seg: BroadcastSegment) => void;
  onCancel: () => void;
}) {
  const [filterRole, setFilterRole] = useState<RecipientFilterRole>("todos");
  const [customEmailsRaw, setCustomEmailsRaw] = useState("");
  const [studentFilter, setStudentFilter] = useState<StudentProgressFilter>({});
  const [trackOptions, setTrackOptions] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<BroadcastRecipientPreview[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const [segmentDescription, setSegmentDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (filterRole !== "aluno") return;
    listTrainingTracks().then(({ data }) => {
      setTrackOptions(
        data
          .map((t) => t.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "pt-BR")),
      );
    });
  }, [filterRole]);

  const filter: RecipientFilter = useMemo(() => {
    if (filterRole === "custom")
      return { role: "custom", customEmails: parseCustomEmails(customEmailsRaw) };
    if (filterRole === "aluno") return { role: "aluno", studentFilter };
    return { role: filterRole };
  }, [filterRole, customEmailsRaw, studentFilter]);

  async function handlePreview() {
    setPreviewing(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      const result = await previewBroadcastRecipients(filter);
      setPreviewData(result.recipients);
      setPreviewTotal(result.total);
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const seg = await createBroadcastSegment({
        name: segmentName.trim(),
        description: segmentDescription.trim(),
        filter,
      });
      onCreated(seg);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const canPreview = filterRole !== "custom" || customEmailsRaw.trim().length > 0;
  const canCreate = segmentName.trim().length > 0 && previewData !== null && previewTotal > 0;

  return (
    <div className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-200">Novo segmento</h3>
        <button type="button" onClick={onCancel} className="text-xs text-slate-600 hover:text-slate-400">
          Cancelar
        </button>
      </div>

      {/* Role */}
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Quem vai receber?</p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { value: "todos", label: "Todos" },
              { value: "aluno", label: "Alunos" },
              { value: "instrutor", label: "Instrutores" },
              { value: "custom", label: "Personalizado" },
            ] as const
          ).map(({ value, label }) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="newSegFilterRole"
                value={value}
                checked={filterRole === value}
                onChange={() => {
                  setFilterRole(value);
                  setPreviewData(null);
                  setStudentFilter({});
                }}
                className="accent-sky-500"
              />
              <span className="text-sm text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Student filters */}
      {filterRole === "aluno" && (
        <StudentFilterPanel
          value={studentFilter}
          onChange={(v) => {
            setStudentFilter(v);
            setPreviewData(null);
          }}
          trackOptions={trackOptions}
        />
      )}

      {/* Custom emails */}
      {filterRole === "custom" && (
        <textarea
          rows={4}
          placeholder="Um email por linha, ou separados por vírgula"
          value={customEmailsRaw}
          onChange={(e) => {
            setCustomEmailsRaw(e.target.value);
            setPreviewData(null);
          }}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 font-mono text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
        />
      )}

      {/* Preview */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={previewing || !canPreview}
            className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm text-slate-300 transition hover:border-sky-500/50 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewing ? "Carregando…" : "Pré-visualizar lista"}
          </button>
          {previewData !== null && !previewing && (
            <span className="text-sm text-slate-400">
              {previewTotal} destinatário{previewTotal !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {previewError && <p className="text-sm text-red-400">{previewError}</p>}
        {previewData !== null && previewData.length > 0 && (
          <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-2">
            {previewData.slice(0, 10).map((r) => (
              <p key={r.email} className="truncate py-0.5 font-mono text-xs text-slate-500">
                {r.name !== r.email ? `${r.name} <${r.email}>` : r.email}
              </p>
            ))}
            {previewTotal > 10 && (
              <p className="py-0.5 text-xs text-slate-600">…e mais {previewTotal - 10}</p>
            )}
          </div>
        )}
        {previewData !== null && previewTotal === 0 && (
          <p className="text-sm text-amber-400">
            Nenhum destinatário encontrado para esse filtro.
          </p>
        )}
      </div>

      {/* Segment details */}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Nome do segmento *"
          value={segmentName}
          onChange={(e) => setSegmentName(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Descrição (opcional)"
          value={segmentDescription}
          onChange={(e) => setSegmentDescription(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
        />
      </div>

      {createError && <p className="text-sm text-red-400">{createError}</p>}

      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={!canCreate || creating}
        className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {creating ? "Criando segmento…" : "Criar segmento"}
      </button>
    </div>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────────────

function NewBroadcastWizard({
  segments,
  accountInfo,
  onDone,
  onCancel,
  onDeleteSegment,
}: {
  segments: BroadcastSegment[];
  accountInfo: ResendAccountInfo;
  onDone: (segment: BroadcastSegment, message: BroadcastMessage) => void;
  onCancel: () => void;
  onDeleteSegment: (id: string) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showNewSegmentForm, setShowNewSegmentForm] = useState(segments.length === 0);
  const [activeSegment, setActiveSegment] = useState<BroadcastSegment | null>(
    segments.length > 0 ? segments[0] : null,
  );
  const [allSegments, setAllSegments] = useState<BroadcastSegment[]>(segments);

  const [bodyHtml, setBodyHtml] = useState("");
  const [subject, setSubject] = useState("");

  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const atLimit = allSegments.length >= 3;

  function handleSegmentCreated(seg: BroadcastSegment) {
    setAllSegments((prev) => [seg, ...prev]);
    setActiveSegment(seg);
    setShowNewSegmentForm(false);
    setStep(2);
  }

  async function handleDeleteSegment(id: string) {
    await onDeleteSegment(id);
    setAllSegments((prev) => prev.filter((s) => s.id !== id));
    if (activeSegment?.id === id) setActiveSegment(null);
  }

  async function handleSendTest() {
    if (!testEmail.trim() || !activeSegment) return;
    setSendingTest(true);
    try {
      await createAndSendBroadcast({
        segmentId: activeSegment.id,
        subject,
        bodyHtml,
        testEmail: testEmail.trim(),
        confirmSend: false,
      });
    } catch {
      // non-blocking
    } finally {
      setSendingTest(false);
      setTestSent(true);
    }
  }

  async function handleSend() {
    if (!activeSegment) return;
    setSending(true);
    setSendError(null);
    try {
      const msg = await createAndSendBroadcast({
        segmentId: activeSegment.id,
        subject,
        bodyHtml,
        testEmail: null,
        confirmSend: true,
      });
      if (msg) onDone(activeSegment, msg);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <StepIndicator current={step} />
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-300">
          Cancelar
        </button>
      </div>

      {/* Step 1 — Segment */}
      {step === 1 && (
        <div className="space-y-4">
          <AccountLimits accountInfo={accountInfo} segmentCount={allSegments.length} />

          {atLimit && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              Limite de 3 segmentos atingido. Exclua um antes de criar outro.
            </div>
          )}

          {/* Existing segments */}
          {allSegments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400">Segmentos existentes</p>
              {allSegments.map((seg) => (
                <SegmentCard
                  key={seg.id}
                  segment={seg}
                  selected={activeSegment?.id === seg.id}
                  onSelect={() => {
                    setActiveSegment(seg);
                    setShowNewSegmentForm(false);
                  }}
                  onDelete={handleDeleteSegment}
                />
              ))}
            </div>
          )}

          {/* New segment toggle */}
          {!showNewSegmentForm ? (
            <button
              type="button"
              onClick={() => setShowNewSegmentForm(true)}
              disabled={atLimit}
              className="flex items-center gap-2 rounded-lg border border-dashed border-slate-700 px-4 py-3 text-sm text-slate-400 transition hover:border-sky-500/50 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-40 w-full justify-center"
            >
              + Novo segmento
            </button>
          ) : (
            <NewSegmentForm
              onCreated={handleSegmentCreated}
              onCancel={() => setShowNewSegmentForm(false)}
            />
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!activeSegment}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Avançar →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Content */}
      {step === 2 && (
        <div className="space-y-4">
          {activeSegment && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-500">
              Segmento:{" "}
              <span className="font-medium text-slate-300">{activeSegment.name}</span>
              {" · "}
              {activeSegment.memberCount} destinatário{activeSegment.memberCount !== 1 ? "s" : ""}
            </div>
          )}

          <input
            type="text"
            placeholder="Assunto do email *"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
          />

          <EmailRichEditor
            onChange={setBodyHtml}
            disabled={false}
          />

          <p className="text-xs text-slate-600">
            O link de descadastro será adicionado automaticamente pelo Resend.
          </p>

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!subject.trim() || !bodyHtml.trim()}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-slate-500">Segmento</span>
              <span className="text-right text-slate-200">{activeSegment?.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-slate-500">Destinatários</span>
              <span className="text-slate-200">{activeSegment?.memberCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="shrink-0 text-slate-500">Assunto</span>
              <span className="truncate text-right text-slate-200">{subject}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800">
            <p className="border-b border-slate-800 bg-slate-900/70 px-4 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              Preview do email
            </p>
            <div
              className="max-h-80 overflow-auto bg-white p-4 text-sm text-slate-900"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-300">Enviar teste (opcional)</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="email@exemplo.com"
                value={testEmail}
                onChange={(e) => {
                  setTestEmail(e.target.value);
                  setTestSent(false);
                }}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleSendTest()}
                disabled={!testEmail.trim() || sendingTest || testSent}
                className="shrink-0 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-sky-500/50 hover:text-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingTest ? "Enviando…" : testSent ? "Enviado ✓" : "Enviar teste"}
              </button>
            </div>
          </div>

          {sendError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {sendError}
            </div>
          )}

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={sending}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending}
              className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Enviando…" : `Enviar para todos (${activeSegment?.memberCount ?? 0})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EmailMktTab() {
  type ViewMode = "list" | "wizard";
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [segments, setSegments] = useState<BroadcastSegment[]>([]);
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [accountInfo, setAccountInfo] = useState<ResendAccountInfo>(null);
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [segs, msgs, info] = await Promise.all([
        listBroadcastSegments(),
        listBroadcastMessages(),
        getResendAccountInfo(),
      ]);
      setSegments(segs);
      setMessages(msgs.messages);
      setAccountInfo(info);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSegments(false);
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleDeleteSegment(id: string) {
    await deleteBroadcastSegment(id);
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }

  if (viewMode === "wizard") {
    return (
      <NewBroadcastWizard
        segments={segments}
        accountInfo={accountInfo}
        onDone={(seg, msg) => {
          setSegments((prev) => (prev.find((s) => s.id === seg.id) ? prev : [seg, ...prev]));
          setMessages((prev) => [msg, ...prev]);
          setViewMode("list");
        }}
        onCancel={() => setViewMode("list")}
        onDeleteSegment={handleDeleteSegment}
      />
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-100">Email MKT</h2>
          <AccountLimits accountInfo={accountInfo} segmentCount={segments.length} />
        </div>
        <button
          type="button"
          onClick={() => setViewMode("wizard")}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          + Novo disparo
        </button>
      </div>

      {/* Segments */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Segmentos ({segments.length}/3)
        </h3>
        {loadingSegments ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-800/50" />
            ))}
          </div>
        ) : segments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-sm text-slate-600">
            Nenhum segmento criado. Clique em "+ Novo disparo" para começar.
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map((seg) => (
              <SegmentCard key={seg.id} segment={seg} onDelete={handleDeleteSegment} />
            ))}
          </div>
        )}
      </section>

      <MessagesList messages={messages} loading={loadingMessages} />
    </div>
  );
}
