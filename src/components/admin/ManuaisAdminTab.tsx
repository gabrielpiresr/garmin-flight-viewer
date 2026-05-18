import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  createManual,
  deleteManual,
  getManualDownloadUrl,
  listManuals,
  updateManualMeta,
  type Manual,
} from "../../lib/manuaisDb";
import { useToast } from "../ui/ToastProvider";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(mime: string | null): React.ReactNode {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-xs font-bold text-red-400">
        PDF
      </span>
    );
  if (m.includes("word") || m.includes("document"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-400">
        DOC
      </span>
    );
  if (m.includes("sheet") || m.includes("excel"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-400">
        XLS
      </span>
    );
  if (m.includes("presentation") || m.includes("powerpoint"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-xs font-bold text-orange-400">
        PPT
      </span>
    );
  if (m.includes("image"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-xs font-bold text-purple-400">
        IMG
      </span>
    );
  if (m.includes("zip") || m.includes("rar"))
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/15 text-xs font-bold text-yellow-400">
        ZIP
      </span>
    );
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700/60 text-xs font-bold text-slate-400">
      ARQ
    </span>
  );
}

function groupByCategory(manuals: Manual[]): Map<string, Manual[]> {
  const map = new Map<string, Manual[]>();
  for (const m of manuals) {
    const list = map.get(m.category) ?? [];
    list.push(m);
    map.set(m.category, list);
  }
  return map;
}

// ─── upload modal ────────────────────────────────────────────────────────────

type UploadModalProps = {
  existingCategories: string[];
  onClose: () => void;
  onUploaded: (manual: Manual) => void;
};

function UploadModal({ existingCategories, onClose, onUploaded }: UploadModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState(existingCategories[0] ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [useNewCategory, setUseNewCategory] = useState(existingCategories.length === 0);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const finalCategory = useNewCategory ? newCategory.trim() : category;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    if (picked && !name) {
      setName(picked.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim() || !finalCategory) return;
    setSaving(true);
    const { data, error } = await createManual({
      name: name.trim(),
      category: finalCategory,
      file,
      actorUserId: user?.id,
    });
    setSaving(false);
    if (error || !data) {
      showToast({ message: error?.message ?? "Erro ao enviar arquivo", variant: "error" });
      return;
    }
    showToast({ message: "Arquivo enviado com sucesso", variant: "success" });
    onUploaded(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Enviar arquivo</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
          {/* File picker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Arquivo</label>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-600 px-4 py-3 text-left transition hover:border-slate-500 hover:bg-slate-800/40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0 text-slate-400">
                <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5zM3 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
              </svg>
              <span className="truncate text-sm text-slate-300">
                {file ? file.name : "Selecionar arquivo…"}
              </span>
              {file && (
                <span className="ml-auto shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span>
              )}
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome de exibição</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Manual de Procedimentos de Solo"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Categoria</label>
            {!useNewCategory && existingCategories.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                >
                  {existingCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseNewCategory(true)}
                  className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                >
                  Nova
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Nome da categoria"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                  required
                  autoFocus
                />
                {existingCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseNewCategory(false)}
                    className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                  >
                    Voltar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !file || !name.trim() || !finalCategory}
              className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              {saving && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {saving ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── edit modal ──────────────────────────────────────────────────────────────

type EditModalProps = {
  manual: Manual;
  existingCategories: string[];
  onClose: () => void;
  onSaved: (updated: Manual) => void;
};

function EditModal({ manual, existingCategories, onClose, onSaved }: EditModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(manual.name);
  const [category, setCategory] = useState(manual.category);
  const [useNewCategory, setUseNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const finalCategory = useNewCategory ? newCategory.trim() : category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !finalCategory) return;
    setSaving(true);
    const { data, error } = await updateManualMeta(manual.id, {
      name: name.trim(),
      category: finalCategory,
    });
    setSaving(false);
    if (error || !data) {
      showToast({ message: error?.message ?? "Erro ao salvar", variant: "error" });
      return;
    }
    showToast({ message: "Salvo com sucesso", variant: "success" });
    onSaved(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Editar arquivo</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome de exibição</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Categoria</label>
            {!useNewCategory ? (
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                >
                  {existingCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseNewCategory(true)}
                  className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                >
                  Nova
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Nova categoria"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setUseNewCategory(false)}
                  className="shrink-0 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                >
                  Voltar
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !finalCategory}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function ManuaisAdminTab() {
  const { showToast } = useToast();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editTarget, setEditTarget] = useState<Manual | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const categories = [...new Set(manuals.map((m) => m.category))].sort();
  const grouped = groupByCategory(manuals);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listManuals();
    setLoading(false);
    if (error) {
      showToast({ message: "Erro ao carregar manuais", variant: "error" });
      return;
    }
    setManuals(data ?? []);
    setExpandedCategories(new Set([...new Set((data ?? []).map((m) => m.category))]));
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function handleUploaded(manual: Manual) {
    setManuals((prev) => [...prev, manual].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
    setExpandedCategories((prev) => new Set([...prev, manual.category]));
    setShowUpload(false);
  }

  function handleSaved(updated: Manual) {
    setManuals((prev) =>
      prev
        .map((m) => (m.id === updated.id ? updated : m))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    );
    setExpandedCategories((prev) => new Set([...prev, updated.category]));
    setEditTarget(null);
  }

  async function handleDelete(manual: Manual) {
    if (!confirm(`Excluir "${manual.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(manual.id);
    const { error } = await deleteManual(manual.id);
    setDeletingId(null);
    if (error) {
      showToast({ message: error.message, variant: "error" });
      return;
    }
    showToast({ message: "Arquivo excluido", variant: "success" });
    setManuals((prev) => prev.filter((m) => m.id !== manual.id));
  }

  return (
    <>
      {showUpload && (
        <UploadModal
          existingCategories={categories}
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
      {editTarget && (
        <EditModal
          manual={editTarget}
          existingCategories={categories}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Manuais e materiais</h2>
            <p className="text-xs text-slate-500">
              {manuals.length} {manuals.length === 1 ? "arquivo" : "arquivos"} em {categories.length}{" "}
              {categories.length === 1 ? "categoria" : "categorias"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Enviar arquivo
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-800/60" />
            ))}
          </div>
        ) : manuals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-12 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-10 w-10 text-slate-700">
              <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
            </svg>
            <p className="text-sm font-medium text-slate-400">Nenhum arquivo ainda</p>
            <p className="mt-1 text-xs text-slate-600">Clique em "Enviar arquivo" para adicionar o primeiro manual.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const items = grouped.get(cat) ?? [];
              const isOpen = expandedCategories.has(cat);
              return (
                <div key={cat} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
                  {/* Category header */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-800/40"
                  >
                    <div className="flex items-center gap-3">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-400">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      <span className="text-sm font-medium text-slate-200">{cat}</span>
                      <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        {items.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Files list */}
                  {isOpen && (
                    <div className="divide-y divide-slate-800/60 border-t border-slate-800/60">
                      {items.map((m) => {
                        const downloadUrl = getManualDownloadUrl(m.fileId);
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-800/30"
                          >
                            {fileTypeIcon(m.mimeType)}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-200">{m.name}</p>
                              <p className="text-xs text-slate-500">
                                {m.originalName}
                                {m.fileSize ? ` · ${formatBytes(m.fileSize)}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {downloadUrl && (
                                <a
                                  href={downloadUrl}
                                  download={m.originalName}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                                  title="Baixar"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                                  </svg>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditTarget(m)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                                title="Editar"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                  <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                  <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(m)}
                                disabled={deletingId === m.id}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                                title="Excluir"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

