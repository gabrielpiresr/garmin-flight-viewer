import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getProvaAttempt, listMyProvas, saveProvaProgress, startProvaAttempt, submitProvaAttempt } from "../../lib/provasStudentDb";
import type { ProvaAssignment, ProvaAttempt, ProvaStudentAnswer } from "../../types/provas";
import { StudentPageHeader } from "./StudentExperience";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { ProvaQuestionPlay } from "../provas/ProvaQuestionPlay";
import { ProvaResultView } from "../provas/ProvaResultView";

function hoursLabel(hours: number) {
  const safe = Math.max(1, Math.round(hours) || 1);
  return safe === 1 ? "1 hora" : `${safe} horas`;
}

function countdownParts(iso: string, now: number) {
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) {
    return { ms: 0, label: "00:00:00", expired: true };
  }
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return { ms, label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, expired: false };
}

export function ProvasTab() {
  const { showToast } = useToast();
  const [assignments, setAssignments] = useState<ProvaAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "take" | "result">("list");
  const [attempt, setAttempt] = useState<ProvaAttempt | null>(null);
  const [passingPercent, setPassingPercent] = useState(70);
  const [timeLimitHours, setTimeLimitHours] = useState(24);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAssignments(await listMyProvas());
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar provas." });
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = assignments.filter((a) => a.status === "pending" || a.status === "in_progress");
  const done = assignments.filter((a) => a.status === "submitted" || a.status === "expired");

  async function start(row: ProvaAssignment) {
    if (row.status !== "in_progress") {
      const ok = window.confirm(
        `Ao iniciar, você terá ${hoursLabel(row.timeLimitHours)} para concluir a prova. A contagem começa agora. Deseja iniciar?`,
      );
      if (!ok) return;
    }
    try {
      const next = await startProvaAttempt(row.id);
      setAttempt(next);
      setPassingPercent(row.passingPercent);
      setTimeLimitHours(row.timeLimitHours);
      setMode(next.status === "submitted" || next.status === "expired" ? "result" : "take");
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Não foi possível iniciar." });
    }
  }

  async function openResult(row: ProvaAssignment) {
    if (!row.attemptId) return;
    try {
      const next = await getProvaAttempt(row.attemptId);
      setAttempt(next);
      setPassingPercent(row.passingPercent);
      setMode("result");
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Não foi possível abrir o resultado." });
    }
  }

  if (mode === "take" && attempt) {
    return (
      <ProvaTakeView
        attempt={attempt}
        passingPercent={passingPercent}
        timeLimitHours={timeLimitHours}
        onExit={() => {
          setMode("list");
          setAttempt(null);
          void load();
        }}
        onSubmitted={(next) => {
          setAttempt(next);
          setMode("result");
          void load();
        }}
      />
    );
  }

  if (mode === "result" && attempt) {
    return (
      <ProvaResultView
        attempt={attempt}
        passingPercent={passingPercent}
        onBack={() => {
          setMode("list");
          setAttempt(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <StudentPageHeader
        eyebrow="Teoria"
        title="Provas"
        description="Veja as provas liberadas para você e o histórico das que já fez."
      />
      {loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Liberadas</h3>
            {open.length ? (
              open.map((row) => (
                <article key={row.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-white">{row.provaTitle}</h4>
                      {row.status === "in_progress" ? (
                        <AssignmentCountdown expiresAt={row.expiresAt} />
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">
                          Você terá {hoursLabel(row.timeLimitHours)} para fazer depois de iniciar.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={row.status === "expired"}
                      onClick={() => void start(row)}
                      className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-sky-950 disabled:opacity-40"
                    >
                      {row.status === "in_progress" ? "Continuar" : "Iniciar"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">Nenhuma prova liberada no momento.</p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Realizadas</h3>
            {done.length ? (
              done.map((row) => (
                <article key={row.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-white">{row.provaTitle}</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        {row.scorePercent == null
                          ? statusLabel(row.status)
                          : `${row.scorePercent.toFixed(0)}% · ${row.passed ? "Aprovado" : "Reprovado"}`}
                      </p>
                    </div>
                    {row.attemptId ? (
                      <button
                        type="button"
                        onClick={() => void openResult(row)}
                        className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                      >
                        Ver correção
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">Você ainda não realizou provas.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function AssignmentCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const countdown = countdownParts(expiresAt, now);
  return (
    <p className={`mt-1 text-xs ${countdown.expired ? "text-rose-300" : "text-amber-200"}`}>
      {countdown.expired ? "Tempo esgotado" : `Tempo restante: ${countdown.label}`}
    </p>
  );
}

function statusLabel(status: ProvaAssignment["status"]) {
  if (status === "expired") return "Expirada";
  if (status === "submitted") return "Enviada";
  return status;
}

function HoverButton({
  title,
  disabled,
  className,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  className: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex" title={title}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`${className}${disabled ? " pointer-events-none" : ""}`}
      >
        {children}
      </button>
    </span>
  );
}

function ProvaTakeView({
  attempt,
  passingPercent,
  timeLimitHours,
  onExit,
  onSubmitted,
}: {
  attempt: ProvaAttempt;
  passingPercent: number;
  timeLimitHours: number;
  onExit: () => void;
  onSubmitted: (attempt: ProvaAttempt) => void;
}) {
  const { showToast } = useToast();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ProvaStudentAnswer>>(attempt.answers || {});
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const questions = attempt.questions;
  const current = questions[index];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = countdownParts(attempt.expiresAt, now);

  useEffect(() => {
    if (countdown.expired) {
      void submit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown.expired]);

  const answeredCount = useMemo(
    () => questions.filter((q) => hasAnswer(answers[q.id])).length,
    [answers, questions],
  );
  const currentAnswered = hasAnswer(answers[current?.id]);
  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const isLast = index >= questions.length - 1;

  async function persist(nextAnswers: Record<string, ProvaStudentAnswer>) {
    try {
      await saveProvaProgress(attempt.id, nextAnswers);
    } catch {
      // autosave best-effort
    }
  }

  function setAnswer(questionId: string, answer: ProvaStudentAnswer) {
    const next = { ...answers, [questionId]: answer };
    setAnswers(next);
    void persist(next);
  }

  async function submit(force = false) {
    if (!force && !allAnswered) return;
    setSubmitting(true);
    try {
      const next = await submitProvaAttempt(attempt.id, answers);
      onSubmitted(next);
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao enviar." });
      setSubmitting(false);
    }
  }

  if (!current) return null;

  const sendTitle = allAnswered
    ? submitting
      ? "Enviando a prova…"
      : "Enviar e finalizar a prova"
    : !currentAnswered
      ? "Marque uma resposta nesta questão"
      : "Responda todas as questões para enviar";

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Questão {index + 1} de {questions.length}</p>
          <p className="text-sm text-slate-300">{answeredCount} respondidas · mínimo {passingPercent}%</p>
        </div>
        <div
          className={`rounded-full px-3 py-1.5 text-center ${
            countdown.expired || countdown.ms < 300000 ? "bg-rose-500/20 text-rose-100" : "bg-slate-800 text-slate-100"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Tempo restante</p>
          <p className="font-mono text-lg font-bold leading-none">{countdown.label}</p>
        </div>
        <button type="button" onClick={onExit} className="text-xs font-semibold text-slate-400 hover:text-white">
          Sair
        </button>
      </div>

      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
        A contagem de {hoursLabel(timeLimitHours)} começou quando você iniciou a prova. Envie antes de o tempo zerar.
      </div>

      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const done = hasAnswer(answers[q.id]);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-9 w-9 rounded-lg text-xs font-bold ${
                i === index
                  ? "bg-sky-500 text-sky-950"
                  : done
                    ? "bg-emerald-500/20 text-emerald-100"
                    : "bg-slate-800 text-slate-400"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-900/40 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{current.categoryName}</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{current.title}</h2>
        {current.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{current.description}</p> : null}
        <div className="mt-5">
          <ProvaQuestionPlay
            question={current}
            answer={answers[current.id]}
            onAnswer={(answer) => setAnswer(current.id, answer)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <HoverButton
          title={index === 0 ? "Você já está na primeira questão" : "Questão anterior"}
          disabled={index === 0}
          onClick={() => setIndex((v) => Math.max(0, v - 1))}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40"
        >
          Anterior
        </HoverButton>
        <div className="flex flex-wrap gap-2">
          {!isLast ? (
            <HoverButton
              title={currentAnswered ? "Próxima questão" : "Marque uma resposta para ir à próxima questão"}
              disabled={!currentAnswered}
              onClick={() => setIndex((v) => Math.min(questions.length - 1, v + 1))}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-sky-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
            </HoverButton>
          ) : (
            <HoverButton
              title={sendTitle}
              disabled={!allAnswered || submitting}
              onClick={() => void submit()}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Enviando..." : "Enviar prova"}
            </HoverButton>
          )}
        </div>
      </div>
    </div>
  );
}

function hasAnswer(answer?: ProvaStudentAnswer) {
  if (!answer) return false;
  if (answer.type === "mc") return Boolean(answer.optionId);
  if (answer.type === "map") return Boolean(answer.latLng);
  return Boolean(answer.pctPoint);
}
