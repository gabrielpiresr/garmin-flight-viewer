import { useEffect, useMemo, useState } from "react";
import type {
  AiswebAirportBundle,
  AiswebRotaer,
} from "../types/aisweb";
import { airportSummaryFromBundle } from "../lib/flightPlanFormat";
import type {
  FlightBriefingAiReport,
  FlightBriefingAiTask,
  FlightBriefingAiTaskStatus,
} from "../types/flightBriefingAi";

const loadingGif =
  "data:image/gif;base64,R0lGODlhEAAQAPIAAP///wAAAMfHx2ZmZgAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAEAAQAAADLwi63P4wykmrvTjrzbv/YCiOZGmeaKqubOu+cCzPdG3feK7vfO8H4AhAQA7";

const btn =
  "inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

function statusLabel(status: FlightBriefingAiTaskStatus): string {
  if (status === "done") return "feito";
  if (status === "inactive") return "inativo";
  return "pendente";
}

function actionLabel(task: FlightBriefingAiTask): string {
  if (task.action === "phone") return "ligar";
  if (task.action === "email") return "email";
  if (task.action === "url") return "abrir link";
  return "manual";
}

function actionHref(task: FlightBriefingAiTask): string | null {
  if (task.action === "url" && task.url) return task.url;
  if (task.action === "phone" && task.contact?.type === "phone") {
    return `tel:${task.contact.value.replace(/[^\d+]/g, "")}`;
  }
  if (task.action === "url" && task.contact?.type === "website") return task.contact.value;
  return null;
}

function contactHref(contact: NonNullable<FlightBriefingAiTask["contact"]>): string | null {
  if (contact.type === "phone") return `tel:${contact.value.replace(/[^\d+]/g, "")}`;
  if (contact.type === "website") return contact.value;
  return null;
}

function emailSubject(task: FlightBriefingAiTask): string {
  return `Confirmação operacional ${task.airportIcao || ""}`.trim();
}

function airportGroupLabel(icao: string): string {
  return icao === "ROTA" ? "Rota" : icao;
}

function formatWorkingScheduleShort(rotaer: AiswebRotaer | null | undefined): string {
  const schedules = rotaer?.workingHours?.schedules || [];
  if (schedules.length) {
    return schedules
      .map((s) => {
        const days = s.days.join("/") || "-";
        const hours = s.begin && s.end ? `${s.begin}-${s.end}` : "-";
        return `${days} ${hours}`;
      })
      .join(" | ");
  }
  return rotaer?.workingHours?.text || "-";
}

function formatFuelShort(rotaer: AiswebRotaer | null | undefined): string {
  const fuel = rotaer?.fuel;
  if (!fuel) return "-";
  const types = fuel.types?.length ? fuel.types.join(" | ") : fuel.text || "-";
  return fuel.hours ? `${types} | ${fuel.hours}` : types;
}

function formatRunwaysShort(rotaer: AiswebRotaer | null | undefined): string {
  const runways = rotaer?.runways || [];
  if (!runways.length) return "-";
  return runways
    .map((rwy) => {
      const size =
        rwy.lengthM != null && rwy.widthM != null
          ? `${rwy.lengthM.toLocaleString("pt-BR")} x ${rwy.widthM} m`
          : rwy.lengthM != null
            ? `${rwy.lengthM.toLocaleString("pt-BR")} m`
            : "-";
      const surface = (rwy.surfaceLabel || rwy.surface || "").trim();
      return surface ? `${rwy.ident} - ${size} | ${surface}` : `${rwy.ident} - ${size}`;
    })
    .join(" | ");
}

function TaskNoteTextarea({
  task,
  onTaskUpdate,
}: {
  task: FlightBriefingAiTask;
  onTaskUpdate: (taskId: string, patch: { pilotNote?: string }) => void;
}) {
  const [draft, setDraft] = useState(task.pilotNote || "");

  useEffect(() => {
    setDraft(task.pilotNote || "");
  }, [task.id, task.pilotNote]);

  return (
    <textarea
      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600"
      rows={3}
      value={draft}
      placeholder="Observação do piloto..."
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== (task.pilotNote || "")) onTaskUpdate(task.id, { pilotNote: draft });
      }}
    />
  );
}

function EmailCopyBlock({
  task,
  onCopy,
}: {
  task: FlightBriefingAiTask;
  onCopy: (text: string, label: string) => void;
}) {
  if (task.action !== "email" || task.contact?.type !== "email") return null;
  const subject = emailSubject(task);
  const body = task.suggestedText || "";
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Email</span>
        <button type="button" className={btn} onClick={() => onCopy(task.contact!.value, "Email")}>
          Copiar email
        </button>
      </div>
      <p className="break-all font-mono text-xs text-slate-200">{task.contact.value}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assunto</span>
        <button type="button" className={btn} onClick={() => onCopy(subject, "Assunto")}>
          Copiar assunto
        </button>
      </div>
      <p className="text-xs text-slate-300">{subject}</p>
      {body ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Corpo</span>
            <button type="button" className={btn} onClick={() => onCopy(body, "Corpo do email")}>
              Copiar corpo
            </button>
          </div>
          <p className="whitespace-pre-wrap text-xs text-slate-300">{body}</p>
        </>
      ) : null}
    </div>
  );
}

function TaskDetailModal({
  task,
  onClose,
  onTaskUpdate,
  onCopy,
  onOpenAirportNotams,
}: {
  task: FlightBriefingAiTask;
  onClose: () => void;
  onTaskUpdate: (taskId: string, patch: { status?: FlightBriefingAiTaskStatus; pilotNote?: string }) => void;
  onCopy: (text: string, label: string) => void;
  onOpenAirportNotams?: (icao: string) => void;
}) {
  const href = actionHref(task);
  const phone = task.action === "phone" && task.contact?.type === "phone" ? task.contact.value : "";
  const providers = (task.providers?.length ? task.providers : task.contact ? [task.contact] : [])
    .filter((provider, index, list) => list.findIndex((item) => item.type === provider.type && item.value === provider.value) === index);
  const hasProviderList = providers.length > 1;
  const isNotamTask = /notam/i.test(`${task.title} ${task.description}`);

  return (
    <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">{task.airportIcao || "Rota"}</p>
            <h3 className="text-base font-semibold text-slate-100">{task.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{statusLabel(task.status)} · {actionLabel(task)}</p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300">{task.description}</p>
        {task.dueHint ? <p className="mt-2 text-xs text-amber-200">Prazo: {task.dueHint}</p> : null}
        {isNotamTask && task.airportIcao && onOpenAirportNotams ? (
          <button
            type="button"
            className={`${btn} mt-3 border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20`}
            onClick={() => {
              onOpenAirportNotams(task.airportIcao || "");
              onClose();
            }}
          >
            Abrir NOTAMs do aeródromo
          </button>
        ) : null}

        {hasProviderList ? (
          <div className="mt-3 grid gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Fornecedores / contatos</p>
            {providers.map((provider) => {
              const providerHref = contactHref(provider);
              return (
                <article key={`${provider.type}-${provider.value}`} className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-100">{provider.label}</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-300">{provider.value}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={btn} onClick={() => onCopy(provider.value, provider.label)}>
                        Copiar
                      </button>
                      {providerHref ? (
                        <a
                          className={btn}
                          href={providerHref}
                          target={provider.type === "website" ? "_blank" : undefined}
                          rel={provider.type === "website" ? "noreferrer" : undefined}
                        >
                          {provider.type === "phone" ? "Ligar" : "Abrir"}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {phone && !hasProviderList ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <span className="font-mono text-xs text-slate-200">{phone}</span>
            <button type="button" className={btn} onClick={() => onCopy(phone, "Telefone")}>
              Copiar telefone
            </button>
            <a className={btn} href={href || undefined}>
              Ligar
            </a>
          </div>
        ) : null}

        {href && task.action === "url" && !hasProviderList ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <a className="break-all text-xs font-semibold text-cyan-300 hover:text-cyan-200" href={href} target="_blank" rel="noreferrer">
              {href}
            </a>
            <button type="button" className={btn} onClick={() => onCopy(href, "Link")}>
              Copiar link
            </button>
            <a className={btn} href={href} target="_blank" rel="noreferrer">
              Abrir link
            </a>
          </div>
        ) : null}

        <EmailCopyBlock task={task} onCopy={onCopy} />

        {task.suggestedText && task.action !== "email" ? (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Texto</span>
              <button type="button" className={btn} onClick={() => onCopy(task.suggestedText || "", "Texto")}>
                Copiar texto
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{task.suggestedText}</p>
          </div>
        ) : null}

        <TaskNoteTextarea task={task} onTaskUpdate={onTaskUpdate} />

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => onTaskUpdate(task.id, { status: task.status === "done" ? "open" : "done" })}
          >
            {task.status === "done" ? "Voltar para pendente" : "Marcar feito"}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => onTaskUpdate(task.id, { status: task.status === "inactive" ? "open" : "inactive" })}
          >
            {task.status === "inactive" ? "Reativar" : "Inativar"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TaskCard({
  task,
  onOpen,
  onTaskUpdate,
}: {
  task: FlightBriefingAiTask;
  onOpen: (task: FlightBriefingAiTask) => void;
  onTaskUpdate: (taskId: string, patch: { status?: FlightBriefingAiTaskStatus }) => void;
}) {
  const done = task.status === "done";
  const inactive = task.status === "inactive";

  return (
    <article
      className={`cursor-pointer rounded-lg border p-2.5 transition hover:border-cyan-500/45 hover:bg-slate-900/80 ${
        done
          ? "border-emerald-500/35 bg-emerald-500/10"
          : inactive
            ? "border-slate-800 bg-slate-950/30 opacity-60"
            : "border-slate-800 bg-slate-950/60"
      }`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
        }
      }}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={done}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onTaskUpdate(task.id, { status: event.target.checked ? "done" : "open" })}
          aria-label={`Marcar ${task.title}`}
        />
        <div className="min-w-0 flex-1 text-left">
          <span className={`block text-xs font-semibold leading-4 ${done ? "text-emerald-100 line-through decoration-emerald-300/80" : "text-slate-100"}`}>
            {task.title}
          </span>
          <span className="hidden">
            {statusLabel(task.status)} · {actionLabel(task)}
          </span>
        </div>
      </div>
    </article>
  );
}

type BriefingAirportDoc = {
  role: "origem" | "destino" | "alternativo";
  icao: string;
  bundle: AiswebAirportBundle;
  note?: string;
};

function airportRoleLabel(role: BriefingAirportDoc["role"]): string {
  if (role === "origem") return "Origem";
  if (role === "destino") return "Destino";
  return "Alternativo";
}

export function FlightBriefingAiPanel({
  report,
  loading,
  error,
  onTaskUpdate,
  onCopy,
  airports = [],
  onAirportNoteChange,
  onOpenAirportNotams,
}: {
  report: FlightBriefingAiReport | null;
  loading: boolean;
  error: string | null;
  onTaskUpdate: (taskId: string, patch: { status?: FlightBriefingAiTaskStatus; pilotNote?: string }) => void;
  onCopy: (text: string, label: string) => void;
  airports?: BriefingAirportDoc[];
  onAirportNoteChange?: (role: BriefingAirportDoc["role"], icao: string, note: string) => void;
  onOpenAirportNotams?: (icao: string) => void;
}) {
  const [selectedTask, setSelectedTask] = useState<FlightBriefingAiTask | null>(null);
  const tasksByIcao = useMemo(() => {
    const map = new Map<string, FlightBriefingAiTask[]>();
    for (const task of report?.tasks || []) {
      const key = task.airportIcao || "ROTA";
      map.set(key, [...(map.get(key) || []), task]);
    }
    return map;
  }, [report]);
  const airportRows = useMemo<Array<{ icao: string; airport: BriefingAirportDoc | null }>>(() => {
    const seen = new Set<string>();
    const rows: Array<{ icao: string; airport: BriefingAirportDoc | null }> = airports.map((airport) => {
      seen.add(airport.icao);
      return { icao: airport.icao, airport };
    });
    for (const [icao] of tasksByIcao) {
      if (icao !== "ROTA" && !seen.has(icao)) rows.push({ icao, airport: null });
    }
    if (tasksByIcao.has("ROTA")) rows.push({ icao: "ROTA", airport: null });
    return rows;
  }, [airports, tasksByIcao]);

  useEffect(() => {
    if (!selectedTask) return;
    const updated = report?.tasks.find((task) => task.id === selectedTask.id);
    if (updated) setSelectedTask(updated);
  }, [report, selectedTask?.id]);

  if (loading) {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
        <img src={loadingGif} alt="" className="h-10 w-10 rounded-lg border border-cyan-400/30 bg-slate-950 p-1" />
        <div>
          <p className="text-sm font-semibold text-cyan-100">IA pesquisando contatos e pendências.</p>
          <p className="mt-1 text-xs text-cyan-200/70">Pode levar mais de 30 segundos.</p>
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="text-sm font-semibold text-slate-200">Checklist IA ainda não gerado.</p>
        {error ? <p className="mt-1 text-xs text-amber-200">{error}</p> : null}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Checklist IA</h3>
          <p className="text-xs text-slate-500">
            {report.tasks.filter((task) => task.status === "open").length} pendente(s) · {report.tasks.filter((task) => task.status === "done").length} feita(s)
          </p>
        </div>
        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-400">
          {report.status === "fallback" ? "fallback" : "IA pronta"}
        </span>
      </div>

      {airportRows.length === 0 ? <p className="text-xs text-slate-500">Nenhuma tarefa sugerida.</p> : null}
      <section className="grid gap-3 @lg:grid-cols-3">
        {airportRows.map(({ icao, airport }) => {
          const tasks = tasksByIcao.get(icao) || [];
          const aiAirport = report.airports.find((item) => item.icao === icao);
          const summary = airport
            ? airportSummaryFromBundle(airportRoleLabel(airport.role), airport.icao, airport.bundle)
            : null;
          const rotaer = airport?.bundle.rotaer || null;
          const metar = airport?.bundle.met?.metar?.trim() || "";
          const taf = airport?.bundle.met?.taf?.trim() || "";
          return (
          <div key={icao} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  {airport ? airportRoleLabel(airport.role) : "Checklist"}
                </p>
                <h4 className="text-base font-semibold text-slate-100">{airportGroupLabel(icao)}</h4>
                {summary?.name ? <p className="text-xs text-slate-500">{summary.name}</p> : null}
              </div>
              <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                {tasks.filter((task) => task.status === "open").length} pend.
              </span>
            </div>

            {airport ? (
              <div className="mt-3 space-y-1.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ["Tipo", rotaer?.typeOpr || "-"],
                    ["Uso", rotaer?.typeUtil || "-"],
                    ["Elev.", rotaer?.altFt != null ? `${rotaer.altFt.toLocaleString("pt-BR")} ft` : "-"],
                    ["Comb.", formatFuelShort(rotaer)],
                    ["Horário", formatWorkingScheduleShort(rotaer)],
                    ["Sol", airport.bundle.sun?.sunriseUtc || airport.bundle.sun?.sunsetUtc ? `${airport.bundle.sun?.sunriseUtc || "-"}Z / ${airport.bundle.sun?.sunsetUtc || "-"}Z` : "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                      <p className="text-[9px] text-slate-500">{label}</p>
                      <p className="truncate text-[11px] font-semibold text-slate-200">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                  <p className="text-[9px] text-slate-500">Pistas</p>
                  <p className="line-clamp-2 text-[11px] font-semibold text-slate-200">{formatRunwaysShort(rotaer)}</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">METAR</p>
                    <p className="mt-1 line-clamp-3 font-mono text-[10px] leading-snug text-slate-300">{metar || "-"}</p>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/45 px-2 py-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">TAF</p>
                    <p className="mt-1 line-clamp-3 font-mono text-[10px] leading-snug text-slate-300">{taf || "-"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {aiAirport ? (
              <details className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-cyan-100">Auxílio IA</summary>
                <div className="mt-2 space-y-2 text-xs text-cyan-50/85">
                  <p><span className="font-semibold">Combustível:</span> {aiAirport.fuel.detail}</p>
                  <p><span className="font-semibold">Hangaragem:</span> {aiAirport.hangarage.detail}</p>
                  <p><span className="font-semibold">Slot/PPR:</span> {aiAirport.slotPpr.detail}</p>
                </div>
              </details>
            ) : null}

            {airport && onAirportNoteChange ? (
              <label className="mt-2 block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Observação do aeródromo</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600"
                  rows={2}
                  value={airport.note || ""}
                  placeholder="Anotação manual..."
                  onChange={(event) => onAirportNoteChange(airport.role, airport.icao, event.target.value)}
                />
              </label>
            ) : null}

            <div className="mt-3 space-y-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={setSelectedTask}
                onTaskUpdate={onTaskUpdate}
              />
            ))}
            </div>
          </div>
          );
        })}
      </section>

      {report.sources.length ? (
        <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">Fontes</summary>
          <div className="mt-2 grid gap-2">
            {report.sources.slice(0, 12).map((source) => (
              <a key={source.id} href={source.url || "#"} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-800 bg-slate-900/45 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500/40">
                <span className="font-semibold text-slate-100">{source.title}</span>
                {source.url ? <span className="mt-1 block break-all font-mono text-[10px] text-slate-500">{source.url}</span> : null}
              </a>
            ))}
          </div>
        </details>
      ) : null}

      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdate={onTaskUpdate}
          onCopy={onCopy}
          onOpenAirportNotams={onOpenAirportNotams}
        />
      ) : null}
    </div>
  );
}
