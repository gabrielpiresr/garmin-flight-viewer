import { useState } from "react";
import type { ProvaAttempt, ProvaQuestionResult, ProvaSanitizedQuestion } from "../../types/provas";
import { ProvaQuestionPlay } from "./ProvaQuestionPlay";

function ringPercent(value: number) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = 36;
  const c = 2 * Math.PI * r;
  return { dash: `${(clamped / 100) * c} ${c}` };
}

export function ProvaResultView({
  attempt,
  passingPercent,
  onBack,
}: {
  attempt: ProvaAttempt;
  passingPercent: number;
  onBack?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const score = attempt.scorePercent ?? 0;
  const passed = attempt.passed === true;
  const results = attempt.results ?? [];
  const byId = new Map(attempt.questions.map((q) => [q.id, q]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className={`rounded-3xl border p-6 ${passed ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 88 88" className="h-24 w-24 -rotate-90">
              <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-800" />
              <circle
                cx="44"
                cy="44"
                r="36"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ringPercent(score).dash}
                className={passed ? "text-emerald-400" : "text-rose-400"}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">{score.toFixed(0)}%</span>
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Resultado</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{passed ? "Aprovado" : "Reprovado"}</h2>
            <p className="mt-1 text-sm text-slate-300">
              Mínimo para aprovação: {passingPercent}%. Você acertou {results.filter((r) => r.correct).length} de {results.length} questões.
            </p>
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="mt-4 rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              >
                Voltar às provas
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {results.map((result, index) => {
          const question = byId.get(result.questionId);
          if (!question) return null;
          const open = openId === result.questionId;
          return (
            <QuestionReview
              key={result.questionId}
              index={index + 1}
              question={question}
              result={result}
              open={open}
              onToggle={() => setOpenId(open ? null : result.questionId)}
            />
          );
        })}
      </div>
    </div>
  );
}

function QuestionReview({
  index,
  question,
  result,
  open,
  onToggle,
}: {
  index: number;
  question: ProvaSanitizedQuestion;
  result: ProvaQuestionResult;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border ${result.correct ? "border-emerald-500/25" : "border-rose-500/25"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-900/60">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
            result.correct ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"
          }`}
        >
          {index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-100">{question.title}</span>
          <span className="text-xs text-slate-500">{question.categoryName} · {result.correct ? "Acertou" : "Errou"}</span>
        </span>
        <span className="text-slate-500">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-slate-800 px-4 py-4">
          {question.description ? <p className="whitespace-pre-wrap text-sm text-slate-300">{question.description}</p> : null}
          <ProvaQuestionPlay question={question} answer={result.answer} reveal={result.correctReveal} disabled />
        </div>
      ) : null}
    </div>
  );
}
