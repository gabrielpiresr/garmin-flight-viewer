import { useEffect, useRef, useState } from "react";
import { createStudentObservation, deleteStudentObservation, listStudentObservations } from "../../lib/observationsDb";
import type { StudentObservation } from "../../types/studentObservation";
import { useToast } from "../ui/ToastProvider";

type CurrentUser = {
  id: string;
  name: string;
  role: "admin" | "instrutor";
};

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 30) return `há ${diffDays} dias`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

const ROLE_BADGE: Record<"admin" | "instrutor", string> = {
  admin: "Admin",
  instrutor: "Instrutor",
};

const ROLE_BADGE_CLASS: Record<"admin" | "instrutor", string> = {
  admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  instrutor: "bg-sky-500/20 text-sky-300 border-sky-500/30",
};

export function StudentObservationsSection({
  studentUserId,
  currentUser,
}: {
  studentUserId: string;
  currentUser: CurrentUser;
}) {
  const { showToast } = useToast();
  const [observations, setObservations] = useState<StudentObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoading(true);
    listStudentObservations(studentUserId)
      .then(setObservations)
      .catch((e) => showToast({ variant: "error", message: (e as Error).message }))
      .finally(() => setLoading(false));
  }, [studentUserId, showToast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const content = newContent.trim();
    if (!content) return;
    setSubmitting(true);
    try {
      const obs = await createStudentObservation({
        studentUserId,
        authorUserId: currentUser.id,
        authorName: currentUser.name,
        authorRole: currentUser.role,
        content,
      });
      setObservations((prev) => [obs, ...prev]);
      setNewContent("");
      textareaRef.current?.focus();
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteStudentObservation(id);
      setObservations((prev) => prev.filter((o) => o.$id !== id));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setDeletingId(null);
    }
  }

  function canDelete(_obs: StudentObservation): boolean {
    return currentUser.role === "admin";
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Observações internas</p>
          <p className="text-xs text-slate-600">Visível apenas para admin e instrutores.</p>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500">
          {observations.length}
        </span>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mb-4">
        <textarea
          ref={textareaRef}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Adicionar observação interna..."
          maxLength={2048}
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-cyan-500/60 focus:bg-slate-800"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-600">{newContent.length}/2048</span>
          <button
            type="submit"
            disabled={submitting || !newContent.trim()}
            className="rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
          >
            {submitting ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-800/40" />
          ))}
        </div>
      ) : observations.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-500">
          Nenhuma observação registrada.
        </p>
      ) : (
        <div className="space-y-2">
          {observations.map((obs) => (
            <div
              key={obs.$id}
              className="rounded-lg border border-slate-700/50 bg-slate-950/30 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASS[obs.author_role]}`}
                  >
                    {ROLE_BADGE[obs.author_role]}
                  </span>
                  <span className="text-xs font-medium text-slate-300">{obs.author_name}</span>
                  <span className="text-[10px] text-slate-600">{formatRelativeDate(obs.$createdAt)}</span>
                </div>
                {canDelete(obs) ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete(obs.$id)}
                    disabled={deletingId === obs.$id}
                    className="shrink-0 rounded border border-red-900/40 px-2 py-0.5 text-[10px] text-red-400 transition hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {deletingId === obs.$id ? "..." : "Excluir"}
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-200">{obs.content}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
