import { useCallback, useEffect, useRef, useState } from "react";
import {
  createInstructorAdmissionComment,
  deleteInstructorAdmissionComment,
  instructorAdmissionFileUrl,
  linkCandidateToInstructorUser,
  listInstructorAdmissionComments,
} from "../../../lib/instructorAdmissionDb";
import { searchFlightPickerUsers } from "../../../lib/adminUsersDb";
import type {
  InstructorAdmissionCandidate,
  InstructorAdmissionComment,
  InstructorAdmissionFieldValue,
  InstructorAdmissionFileValue,
  InstructorAdmissionForm,
  InstructorAdmissionStage,
} from "../../../types/instructorAdmission";
import { candidateDisplayName, stagePillStyle } from "../../../types/instructorAdmission";
import type { InstructorHoursMap } from "../../../lib/instructorAdmissionMetrics";
import { formatHoursLabel } from "../../../lib/instructorAdmissionMetrics";
import { InstructorDetailSection } from "./InstructorDetailSection";
import { useToast } from "../../ui/ToastProvider";

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function isFileValue(value: InstructorAdmissionFieldValue): value is InstructorAdmissionFileValue {
  return Boolean(value && typeof value === "object" && "fileId" in value);
}

function ResponseValue({
  fieldId,
  value,
  form,
}: {
  fieldId: string;
  value: InstructorAdmissionFieldValue;
  form: InstructorAdmissionForm | null;
}) {
  const field = form?.fields.find((f) => f.id === fieldId);
  const label = field?.label || fieldId;

  if (typeof value === "boolean") {
    return (
      <div className="text-sm text-slate-300">
        <span className="text-slate-500">{label}: </span>
        {value ? "Sim" : "Não"}
      </div>
    );
  }

  if (isFileValue(value)) {
    return (
      <div className="text-sm text-slate-300">
        <span className="text-slate-500">{label}: </span>
        <a
          href={instructorAdmissionFileUrl(value)}
          target="_blank"
          rel="noreferrer"
          className="text-sky-400 hover:underline"
        >
          {value.fileName}
        </a>
      </div>
    );
  }

  return (
    <div className="text-sm text-slate-300">
      <span className="text-slate-500">{label}: </span>
      {String(value)}
    </div>
  );
}

export function CandidateDetailDrawer({
  candidate,
  stages,
  form,
  hoursMap,
  authorName,
  onClose,
  onSave,
  onMoveStage,
  onLinked,
  onSendRegistrationLink,
}: {
  candidate: InstructorAdmissionCandidate;
  stages: InstructorAdmissionStage[];
  form: InstructorAdmissionForm | null;
  hoursMap?: InstructorHoursMap;
  authorName: string;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    email: string;
    phone?: string;
    notes?: string;
    stageId: string;
  }) => Promise<void>;
  onMoveStage: (stageId: string) => Promise<void>;
  onLinked: (candidate: InstructorAdmissionCandidate) => void;
  onSendRegistrationLink: (candidate: InstructorAdmissionCandidate) => void;
}) {
  const AUTOSAVE_DELAY_MS = 600;
  type SaveStatus = "idle" | "saving" | "saved" | "error";

  const { showToast } = useToast();
  const [name, setName] = useState(candidate.name);
  const [email, setEmail] = useState(candidate.email);
  const [phone, setPhone] = useState(candidate.phone || "");
  const [notes, setNotes] = useState(candidate.notes || "");
  const [stageId, setStageId] = useState(candidate.stageId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [comments, setComments] = useState<InstructorAdmissionComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkOptions, setLinkOptions] = useState<Array<{ userId: string; label: string; email: string }>>([]);
  const [linking, setLinking] = useState(false);
  const snapshotRef = useRef("");
  const hydratedRef = useRef(false);
  const stageIdRef = useRef(candidate.stageId);

  const stage = stages.find((s) => s.id === stageId);
  const hours = candidate.userId ? hoursMap?.[candidate.userId] : undefined;

  useEffect(() => {
    setName(candidate.name);
    setEmail(candidate.email);
    setPhone(candidate.phone || "");
    setNotes(candidate.notes || "");
    setStageId(candidate.stageId);
    stageIdRef.current = candidate.stageId;
    snapshotRef.current = JSON.stringify({
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone || "",
      notes: candidate.notes || "",
      stageId: candidate.stageId,
    });
    hydratedRef.current = true;
  }, [candidate]);

  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);
    void listInstructorAdmissionComments(candidate.id)
      .then((items) => {
        if (!cancelled) setComments(items);
      })
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [candidate.id]);

  useEffect(() => {
    if (!linkQuery.trim() || linkQuery.trim().length < 2) {
      setLinkOptions([]);
      return;
    }
    let cancelled = false;
    void searchFlightPickerUsers({ role: "instrutor", search: linkQuery.trim(), limit: 8 })
      .then((users) => {
        if (cancelled) return;
        setLinkOptions(
          users.map((user) => ({
            userId: user.userId,
            label: user.profile.nickname?.trim() || user.profile.fullName || user.email,
            email: user.email,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [linkQuery]);

  async function linkToUser(userId: string) {
    setLinking(true);
    try {
      const updated = await linkCandidateToInstructorUser(candidate.id, userId);
      onLinked(updated);
      showToast({ variant: "success", message: "Candidato vinculado ao usuário instrutor." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao vincular usuário.",
      });
    } finally {
      setLinking(false);
    }
  }

  const persistCandidate = useCallback(async () => {
    if (!name.trim() || !email.trim()) return;

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      stageId,
    };
    const serialized = JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone || "",
      notes: payload.notes || "",
      stageId: payload.stageId,
    });
    if (serialized === snapshotRef.current) return;

    setSaveStatus("saving");
    try {
      if (stageId !== stageIdRef.current) {
        await onMoveStage(stageId);
        stageIdRef.current = stageId;
      }
      await onSave(payload);
      snapshotRef.current = serialized;
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar alterações.",
      });
    }
  }, [email, name, notes, onMoveStage, onSave, phone, showToast, stageId]);

  useEffect(() => {
    if (!hydratedRef.current || !name.trim() || !email.trim()) return;

    const serialized = JSON.stringify({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || "",
      notes: notes.trim() || "",
      stageId,
    });
    if (serialized === snapshotRef.current) return;

    setSaveStatus("idle");
    const timer = window.setTimeout(() => {
      void persistCandidate();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [name, email, phone, notes, stageId, persistCandidate]);

  function handleClose() {
    void persistCandidate();
    onClose();
  }

  async function addComment() {
    if (!commentText.trim()) return;
    const created = await createInstructorAdmissionComment(candidate.id, authorName, commentText);
    setComments((current) => [...current, created]);
    setCommentText("");
  }

  async function removeComment(id: string) {
    await deleteInstructorAdmissionComment(id);
    setComments((current) => current.filter((c) => c.id !== id));
  }

  function copyFormLinkWithEmail() {
    const url = `${window.location.origin}/admissao-instrutor?email=${encodeURIComponent(email.trim())}`;
    void navigator.clipboard.writeText(url).then(() => {
      showToast({ variant: "success", message: "Link do formulário copiado!" });
    });
  }

  const responseEntries = Object.entries(candidate.responses);

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-[var(--panel)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{candidateDisplayName(candidate)}</h2>
              {saveStatus === "saving" && <span className="text-xs text-slate-500">Salvando...</span>}
              {saveStatus === "saved" && <span className="text-xs text-emerald-400">Salvo</span>}
              {saveStatus === "error" && <span className="text-xs text-red-400">Erro</span>}
            </div>
            {candidate.nickname && (
              <p className="mt-0.5 text-xs text-slate-600">{candidate.name}</p>
            )}
            <p className="mt-0.5 text-sm text-slate-500">{candidate.email}</p>
            {stage && (
              <span
                className="mt-2 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: stagePillStyle(stage.color).bg,
                  color: stage.color,
                }}
              >
                {stage.name}
              </span>
            )}
          </div>
          <button type="button" onClick={handleClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {hours && (
            <section className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-400">Horas de instrução</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase text-slate-500">Total na escola</p>
                  <p className="text-lg font-semibold text-white">{formatHoursLabel(hours.totalHours)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-500">Este mês</p>
                  <p className="text-lg font-semibold text-white">{formatHoursLabel(hours.monthHours)}</p>
                </div>
              </div>
            </section>
          )}

          {candidate.userId ? (
            <InstructorDetailSection userId={candidate.userId} />
          ) : (
            <section className="rounded-xl border border-dashed border-amber-800/50 bg-amber-950/10 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                Vincular a um usuário instrutor
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Quando o candidato virar instrutor no sistema, vincule pelo e-mail ou nome. A sincronização automática também tenta pelo e-mail.
              </p>
              <input
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Buscar instrutor por nome ou e-mail..."
                className="mt-3 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
              {linkOptions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {linkOptions.map((option) => (
                    <button
                      key={option.userId}
                      type="button"
                      disabled={linking}
                      onClick={() => void linkToUser(option.userId)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-left hover:bg-slate-800 disabled:opacity-50"
                    >
                      <span className="text-sm text-slate-200">{option.label}</span>
                      <span className="text-xs text-slate-500">{option.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dados do candidato</h3>
            <div className="mt-3 grid gap-3">
              <label className="text-xs text-slate-400">
                Nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                E-mail
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                Telefone
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                Etapa
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Observações internas
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </section>

          {responseEntries.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Respostas do formulário
              </h3>
              <div className="mt-3 space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                {responseEntries.map(([fieldId, value]) => (
                  <ResponseValue key={fieldId} fieldId={fieldId} value={value} form={form} />
                ))}
              </div>
            </section>
          )}

          {form && form.fields.length > 0 && responseEntries.length === 0 && candidate.source === "manual" && (
            <section className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              Candidato cadastrado manualmente — sem respostas de formulário.
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico</h3>
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              <p>Criado em {formatDate(candidate.createdAt)}</p>
              <p>Na etapa desde {formatDate(candidate.statusEnteredAt)}</p>
              <p>Origem: {candidate.source === "form" ? "Formulário público" : candidate.source === "instructor" ? "Instrutor ativo" : "Cadastro manual"}</p>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comentários</h3>
            <div className="mt-3 space-y-3">
              {loadingComments ? (
                <p className="text-sm text-slate-500">Carregando...</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum comentário ainda.</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-300">{comment.authorName}</span>
                      <button
                        type="button"
                        onClick={() => void removeComment(comment.id)}
                        className="text-[10px] text-red-400 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-slate-300 whitespace-pre-wrap">{comment.text}</p>
                    <p className="mt-1 text-[10px] text-slate-600">{formatDate(comment.createdAt)}</p>
                  </div>
                ))
              )}
              <div className="flex gap-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={2}
                  placeholder="Adicionar comentário..."
                  className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => void addComment()}
                  disabled={!commentText.trim()}
                  className="self-end rounded bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  Enviar
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={copyFormLinkWithEmail}
            className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
          >
            Link formulário
          </button>
          <button
            type="button"
            onClick={() => onSendRegistrationLink(candidate)}
            className="rounded border border-sky-700/50 bg-sky-600/10 px-3 py-2 text-xs text-sky-400 hover:bg-sky-600/20"
          >
            Link registro
          </button>
          <button type="button" onClick={handleClose} className="rounded px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
