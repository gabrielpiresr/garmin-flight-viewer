import { useRef, useState } from "react";
import type {
  InstructorAdmissionCandidate,
  InstructorAdmissionStage,
} from "../../../types/instructorAdmission";
import { candidateDisplayName, stageColumnBg, stagePillStyle } from "../../../types/instructorAdmission";
import type { InstructorHoursMap } from "../../../lib/instructorAdmissionMetrics";
import { formatHoursLabel } from "../../../lib/instructorAdmissionMetrics";

export function CandidateCard({
  candidate,
  hoursMap,
  hoursLoading,
  onDragStart,
  onClick,
  onEdit,
  onDelete,
  onSendRegistrationLink,
}: {
  candidate: InstructorAdmissionCandidate;
  hoursMap?: InstructorHoursMap;
  hoursLoading?: boolean;
  onDragStart: (candidate: InstructorAdmissionCandidate) => void;
  onClick: (candidate: InstructorAdmissionCandidate) => void;
  onEdit: (candidate: InstructorAdmissionCandidate) => void;
  onDelete: (candidate: InstructorAdmissionCandidate) => void;
  onSendRegistrationLink: (candidate: InstructorAdmissionCandidate) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hours = candidate.userId ? hoursMap?.[candidate.userId] : undefined;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(candidate)}
      className="group relative rounded-lg bg-[var(--panel)] px-3 py-2.5 transition-colors hover:bg-slate-800/50 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start gap-1.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
        >
          <path
            fillRule="evenodd"
            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-3 2a3 3 0 100 6 3 3 0 000-6zm6 0a3 3 0 100 6 3 3 0 000-6z"
            clipRule="evenodd"
          />
        </svg>

        <button
          type="button"
          className="flex-1 min-w-0 text-left"
          onClick={() => onClick(candidate)}
        >
          <p className="text-sm text-slate-100 leading-snug truncate">{candidateDisplayName(candidate)}</p>
          {candidate.nickname && candidate.name !== candidate.nickname && (
            <p className="mt-0.5 text-[10px] text-slate-600 truncate">{candidate.name}</p>
          )}
          {candidate.email && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{candidate.email}</p>
          )}
          {candidate.phone && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{candidate.phone}</p>
          )}
          {candidate.userId && hoursLoading && !hours && (
            <p className="mt-1 text-xs text-slate-600 animate-pulse">Carregando horas...</p>
          )}
          {hours && (
            <p className="mt-1 text-xs text-sky-400/90">
              {formatHoursLabel(hours.totalHours)} total · {formatHoursLabel(hours.monthHours)} no mês
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {candidate.source === "form" && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-emerald-900/50 text-emerald-400">
                Via formulário
              </span>
            )}
            {candidate.source === "instructor" && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-sky-900/50 text-sky-300">
                Instrutor ativo
              </span>
            )}
            {candidate.source === "manual" && (
              <span className="rounded px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-400">
                Manual
              </span>
            )}
          </div>
        </button>

        <div ref={menuRef} className="desktop-group-hover-reveal relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="rounded p-0.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M2 8a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm4.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm4.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-5 z-50 min-w-[140px] overflow-hidden rounded-lg border border-slate-700 bg-[var(--panel)] shadow-2xl py-0.5">
              {[
                { label: "Abrir detalhes", action: () => onClick(candidate), cls: "text-slate-200" },
                { label: "Editar", action: () => onEdit(candidate), cls: "text-slate-200" },
                { label: "Enviar link de registro", action: () => onSendRegistrationLink(candidate), cls: "text-sky-400" },
                { label: "Excluir", action: () => onDelete(candidate), cls: "text-red-400" },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    item.action();
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 transition ${item.cls}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function KanbanColumn({
  stage,
  candidates,
  hoursMap,
  hoursLoading,
  candidatesLoading,
  onDrop,
  onDragStart,
  onClick,
  onEdit,
  onDelete,
  onQuickAdd,
  onConfigureStage,
  onSendRegistrationLink,
}: {
  stage: InstructorAdmissionStage;
  candidates: InstructorAdmissionCandidate[];
  hoursMap?: InstructorHoursMap;
  hoursLoading?: boolean;
  candidatesLoading?: boolean;
  onDrop: (stageId: string) => void;
  onDragStart: (candidate: InstructorAdmissionCandidate) => void;
  onClick: (candidate: InstructorAdmissionCandidate) => void;
  onEdit: (candidate: InstructorAdmissionCandidate) => void;
  onDelete: (candidate: InstructorAdmissionCandidate) => void;
  onQuickAdd: (stageId: string) => void;
  onConfigureStage: (stage: InstructorAdmissionStage) => void;
  onSendRegistrationLink: (candidate: InstructorAdmissionCandidate) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const pill = stagePillStyle(stage.color);

  return (
    <div
      className={`flex w-[280px] shrink-0 flex-col rounded-lg transition ${dragOver ? "ring-1 ring-sky-500/50" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => {
        setDragOver(false);
        onDrop(stage.id);
      }}
    >
      <div className="mb-2 px-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: pill.bg, color: pill.text }}
          >
            {stage.name}
          </span>
          <button
            type="button"
            onClick={() => onConfigureStage(stage)}
            title="Editar etapa"
            className="rounded p-0.5 text-slate-600 hover:bg-slate-800 hover:text-slate-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-xs text-slate-600 font-medium">{candidates.length}</span>
        </div>
        {stage.description && (
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500 line-clamp-2" title={stage.description}>
            {stage.description}
          </p>
        )}
      </div>

      <div
        className="flex flex-col gap-1 overflow-y-auto rounded-lg p-1.5"
        style={{
          minHeight: 60,
          maxHeight: "calc(100vh - 220px)",
          backgroundColor: stageColumnBg(stage.color),
        }}
      >
        {candidatesLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-800/40" />
            ))}
          </div>
        ) : (
          candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            hoursMap={hoursMap}
            hoursLoading={hoursLoading}
            onDragStart={onDragStart}
            onClick={onClick}
            onEdit={onEdit}
            onDelete={onDelete}
            onSendRegistrationLink={onSendRegistrationLink}
          />
        ))
        )}
        <button
          type="button"
          onClick={() => onQuickAdd(stage.id)}
          className="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-800/60 hover:text-slate-300 transition"
        >
          <span className="text-base leading-none">+</span>
          Novo candidato
        </button>
      </div>
    </div>
  );
}
