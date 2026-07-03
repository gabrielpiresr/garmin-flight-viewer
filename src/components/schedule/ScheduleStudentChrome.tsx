import { useMemo, useState, type ReactNode } from "react";
import { useScheduleOnboardingGate } from "../../hooks/useScheduleOnboardingGate";
import { activeOnboardingSteps } from "../../lib/scheduleStudentHelp";
import type { FlightScheduleRules } from "../../types/schoolRules";
import type { ScheduleStudentHelpConfig } from "../../types/scheduleStudentHelp";
import { ScheduleHelpModal } from "./ScheduleHelpModal";
import { ScheduleOnboardingModal } from "./ScheduleOnboardingModal";

type ScheduleStudentChromeProps = {
  rules: FlightScheduleRules;
  helpConfig: ScheduleStudentHelpConfig;
  mode: FlightScheduleRules["mode"];
  toolbarLeading?: ReactNode;
  toolbarTrailing?: ReactNode;
  children: ReactNode;
};

export function ScheduleHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100 sm:h-[38px] sm:px-3 sm:text-sm"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[11px] font-bold text-sky-300" aria-hidden="true">
        ?
      </span>
      <span className="hidden sm:inline">Preciso de ajuda</span>
      <span className="sm:hidden">Ajuda</span>
    </button>
  );
}

export function ScheduleOnboardingReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver tour da escala novamente"
      aria-label="Ver tour da escala novamente"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:bg-slate-800 hover:text-sky-300 sm:h-[38px] sm:w-[38px]"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

export function ScheduleStudentChrome({
  rules,
  helpConfig,
  mode,
  toolbarLeading,
  toolbarTrailing,
  children,
}: ScheduleStudentChromeProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replaySession, setReplaySession] = useState(0);
  const onboarding = useScheduleOnboardingGate(helpConfig);

  const onboardingSteps = useMemo(() => activeOnboardingSteps(helpConfig), [helpConfig]);
  const canShowOnboarding = helpConfig.onboardingEnabled && onboardingSteps.length > 0;
  const onboardingOpen = canShowOnboarding && ((!onboarding.loading && onboarding.shouldShow) || replayOpen);

  async function handleOnboardingComplete() {
    if (onboarding.shouldShow) {
      await onboarding.complete();
    }
    setReplayOpen(false);
  }

  function openOnboardingReplay() {
    setReplaySession((value) => value + 1);
    setReplayOpen(true);
  }

  const hasToolbar = Boolean(toolbarLeading || toolbarTrailing);

  return (
    <>
      <div className="space-y-4">
        <div className={hasToolbar ? "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2" : "flex justify-end"}>
          {toolbarLeading ? (
            <div className="order-2 flex min-w-0 flex-wrap items-center gap-2 sm:order-1 sm:flex-1">
              {toolbarLeading}
            </div>
          ) : null}
          <div className="order-1 flex shrink-0 items-center justify-end gap-1.5 sm:order-2 sm:ml-auto sm:gap-2">
            <ScheduleHelpButton onClick={() => setHelpOpen(true)} />
            {canShowOnboarding ? <ScheduleOnboardingReplayButton onClick={openOnboardingReplay} /> : null}
            {toolbarTrailing}
          </div>
        </div>
        {children}
      </div>

      <ScheduleHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        rules={rules}
        helpConfig={helpConfig}
        mode={mode}
      />

      {onboardingOpen ? (
        <ScheduleOnboardingModal
          key={replayOpen ? `replay-${replaySession}` : "first-access"}
          steps={onboardingSteps}
          onComplete={handleOnboardingComplete}
        />
      ) : null}
    </>
  );
}
