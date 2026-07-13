import { useMemo, useState } from "react";
import { buildScheduleFaqList } from "../../lib/scheduleStudentHelp";
import type { FlightScheduleRules } from "../../types/schoolRules";
import type { ScheduleStudentHelpConfig } from "../../types/scheduleStudentHelp";
import { ScheduleFaqAccordion } from "./ScheduleFaqAccordion";

type ScheduleHelpModalProps = {
  open: boolean;
  onClose: () => void;
  rules: FlightScheduleRules;
  helpConfig: ScheduleStudentHelpConfig;
  mode: FlightScheduleRules["mode"];
};

export function ScheduleHelpModal({ open, onClose, rules, helpConfig, mode }: ScheduleHelpModalProps) {
  const [query, setQuery] = useState("");

  const items = useMemo(() => buildScheduleFaqList(rules, helpConfig), [rules, helpConfig]);

  if (!open) return null;

  const closedNote =
    mode === "closed"
      ? "A escala está fechada no momento. As informações abaixo explicam como funciona quando estiver aberta."
      : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-help-title"
    >
      <button type="button" className="absolute inset-0" aria-label="Fechar" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-700 bg-slate-900 shadow-xl sm:max-h-[85vh] sm:rounded-2xl">
        <div className="shrink-0 border-b border-slate-800 px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="schedule-help-title" className="text-base font-semibold text-slate-100">
                Preciso de ajuda
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">Perguntas frequentes sobre a escala</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          {closedNote ? (
            <p className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
              {closedNote}
            </p>
          ) : null}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pergunta..."
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4">
          <ScheduleFaqAccordion items={items} query={query} />
        </div>
      </div>
    </div>
  );
}
