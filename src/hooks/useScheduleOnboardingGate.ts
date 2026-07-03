import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { activeOnboardingSteps } from "../lib/scheduleStudentHelp";
import {
  getProfileScheduleOnboardingCompletedAt,
  markScheduleOnboardingCompleted,
} from "../lib/scheduleOnboardingDb";
import type { ScheduleOnboardingStep, ScheduleStudentHelpConfig } from "../types/scheduleStudentHelp";

type ScheduleOnboardingGateState = {
  loading: boolean;
  shouldShow: boolean;
  steps: ScheduleOnboardingStep[];
  complete: () => Promise<void>;
};

export function useScheduleOnboardingGate(helpConfig: ScheduleStudentHelpConfig | null): ScheduleOnboardingGateState {
  const { user, isRoot } = useAuth();
  const [loading, setLoading] = useState(true);
  const [shouldShow, setShouldShow] = useState(false);
  const [steps, setSteps] = useState<ScheduleOnboardingStep[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!helpConfig || !user || user.role !== "aluno" || user.approvalStatus === "pending" || isRoot) {
        if (!cancelled) {
          setShouldShow(false);
          setSteps([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const activeSteps = activeOnboardingSteps(helpConfig);
        const completedAt = await getProfileScheduleOnboardingCompletedAt(user.id);
        if (cancelled) return;
        setSteps(activeSteps);
        setShouldShow(Boolean(helpConfig.onboardingEnabled && activeSteps.length > 0 && !completedAt));
      } catch {
        if (!cancelled) {
          setShouldShow(false);
          setSteps([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [helpConfig, user?.id, user?.role, user?.approvalStatus, isRoot]);

  const complete = useCallback(async () => {
    if (!user) return;
    const { error } = await markScheduleOnboardingCompleted(user.id);
    if (error) throw error;
    setShouldShow(false);
  }, [user]);

  return { loading, shouldShow, steps, complete };
}
