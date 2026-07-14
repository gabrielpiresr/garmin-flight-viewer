import { useEffect, useMemo, useState } from "react";
import type { FlightDisplayInfo } from "../lib/flightDisplay";
import { shortName } from "../lib/flightDisplay";
import { submitFlightEvaluation } from "../lib/flightEvaluationsDb";
import type { SavedFlightListItem } from "../lib/flightsDb";
import {
  FLIGHT_EVALUATION_CRITERION_KEYS,
  type FlightEvaluation,
  type FlightEvaluationCriterionKey,
  type FlightEvaluationRules,
  type FlightEvaluationScores,
} from "../types/flightEvaluation";
import { useToast } from "./ui/ToastProvider";

type Props = {
  open: boolean;
  flight: SavedFlightListItem | null;
  info?: FlightDisplayInfo | null;
  rules: FlightEvaluationRules;
  studentUserId: string;
  existing?: FlightEvaluation | null;
  onClose: () => void;
  onSubmitted: (evaluation: FlightEvaluation) => void;
};

function StarRating({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
            disabled={disabled}
            onClick={() => onChange(star)}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition sm:h-9 sm:w-9 ${
              active ? "text-amber-400" : "text-slate-600 hover:text-slate-400"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <svg className="h-7 w-7 sm:h-6 sm:w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

const emptyScores = (): FlightEvaluationScores => ({
  instruction: 0,
  safety: 0,
  learning: 0,
});

export function FlightEvaluationModal({
  open,
  flight,
  info,
  rules,
  studentUserId,
  existing,
  onClose,
  onSubmitted,
}: Props) {
  const { showToast } = useToast();
  const [scores, setScores] = useState<FlightEvaluationScores>(emptyScores);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readOnly = Boolean(existing);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setScores({ ...existing.scores });
      setComment(existing.comment || "");
    } else {
      setScores(emptyScores());
      setComment("");
    }
    setError(null);
  }, [open, existing, flight?.id]);

  const summary = useMemo(() => {
    if (!flight) return null;
    const aircraft = info?.aircraft ?? flight.aircraft_ident ?? "—";
    const date = info?.flightDateIso
      ? new Date(`${info.flightDateIso}T12:00:00`).toLocaleDateString("pt-BR")
      : flight.flight_date
        ? new Date(`${flight.flight_date}T12:00:00`).toLocaleDateString("pt-BR")
        : "—";
    return {
      aircraft,
      date,
      startTime: info?.startTime || flight.start_time || null,
      instructor: shortName(info?.instructorName || "") || "—",
      route: info?.fromTo || null,
      duration: info?.totalFlight || null,
    };
  }, [flight, info]);

  if (!open || !flight) return null;

  function setScore(key: FlightEvaluationCriterionKey, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (readOnly || !flight) return;
    for (const key of FLIGHT_EVALUATION_CRITERION_KEYS) {
      if (scores[key] < 1 || scores[key] > 5) {
        setError("Marque de 1 a 5 estrelas em todos os critérios.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const evaluation = await submitFlightEvaluation(
        studentUserId,
        {
          flightId: flight.id,
          instructorUserId: flight.instructor_user_id,
          scores,
          comment,
        },
        rules,
      );
      showToast({ variant: "success", message: "Avaliação enviada. Obrigado!" });
      onSubmitted(evaluation);
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível salvar a avaliação.";
      setError(message);
      showToast({ variant: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="flight-eval-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
          <div>
            <h2 id="flight-eval-title" className="text-base font-semibold text-slate-100">
              Avaliação do voo
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {readOnly ? "Você já avaliou este voo." : "Como foi sua experiência neste voo?"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Fechar"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {summary ? (
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-200">
                  {summary.aircraft}
                </span>
                <span className="text-slate-300">{summary.date}</span>
                {summary.startTime ? <span className="text-slate-500">{summary.startTime}</span> : null}
              </div>
              <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                <p>
                  Instrutor: <span className="text-slate-300">{summary.instructor}</span>
                </p>
                {summary.route ? (
                  <p className="truncate">
                    Rota: <span className="text-slate-300">{summary.route}</span>
                  </p>
                ) : null}
                {summary.duration ? (
                  <p>
                    Duração: <span className="text-slate-300">{summary.duration}</span>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {rules.disclaimer.trim() ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
              {rules.disclaimer.trim()}
            </p>
          ) : null}

          {FLIGHT_EVALUATION_CRITERION_KEYS.map((key) => {
            const field = rules.criteria[key];
            return (
              <div key={key} className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{field.title}</p>
                  <p className="text-xs text-slate-500">{field.description}</p>
                </div>
                <StarRating
                  label={field.title}
                  value={scores[key]}
                  disabled={readOnly || saving}
                  onChange={(value) => setScore(key, value)}
                />
              </div>
            );
          })}

          <label className="block space-y-2">
            <span>
              <span className="block text-sm font-semibold text-slate-100">{rules.comment.title}</span>
              <span className="block text-xs text-slate-500">{rules.comment.description}</span>
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={readOnly || saving}
              rows={4}
              maxLength={2000}
              placeholder={rules.comment.description}
              className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500 disabled:opacity-60"
            />
          </label>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            {readOnly ? "Fechar" : "Agora não"}
          </button>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {saving ? "Enviando..." : "Enviar avaliação"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FlightEvaluationPendingBadge({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
    >
      Avaliar
    </button>
  );
}

export function FlightEvaluationDoneBadge({
  onClick,
  average,
}: {
  onClick?: () => void;
  average?: number | null;
}) {
  const label = average != null ? average.toFixed(1) : "—";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className="text-[11px] font-medium text-slate-100 hover:text-white"
      >
        {label}
      </button>
    );
  }
  return <span className="text-[11px] font-medium text-slate-100">{label}</span>;
}
