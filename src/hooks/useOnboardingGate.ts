import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getOnboardingPublic,
  getProfileOnboardingCompletedAt,
  markOnboardingCompleted,
} from "../lib/onboardingDb";
import { hasRichTextContent } from "../lib/richContentFields";
import type { OnboardingStep } from "../types/onboarding";

type OnboardingGateState = {
  loading: boolean;
  shouldShow: boolean;
  steps: OnboardingStep[];
  complete: () => Promise<void>;
};

export function useOnboardingGate(): OnboardingGateState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [shouldShow, setShouldShow] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user || user.role !== "aluno" || user.approvalStatus === "pending") {
        if (!cancelled) {
          setShouldShow(false);
          setSteps([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const [publicConfig, completedAt] = await Promise.all([
          getOnboardingPublic(),
          getProfileOnboardingCompletedAt(user.id),
        ]);
        if (cancelled) return;
        const enabled = publicConfig.onboarding.enabled;
        const activeSteps = publicConfig.steps.filter(
          (step) => step.title.trim() && hasRichTextContent(step.descriptionJson),
        );
        setSteps(activeSteps);
        setShouldShow(Boolean(enabled && activeSteps.length > 0 && !completedAt));
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
  }, [user?.id, user?.role, user?.approvalStatus]);

  const complete = useCallback(async () => {
    if (!user) return;
    const { error } = await markOnboardingCompleted(user.id);
    if (error) throw error;
    setShouldShow(false);
  }, [user]);

  return { loading, shouldShow, steps, complete };
}
