import { useCallback, useRef, useState } from "react";
import type { SagaImportPendingMission } from "../lib/sagaImportDb";

export function useSagaImportMissionPrompt() {
  const [pendingMission, setPendingMission] = useState<SagaImportPendingMission | null>(null);
  const [awaitingMission, setAwaitingMission] = useState(false);
  const resolverRef = useRef<((missionId: string) => void) | null>(null);

  const onAwaitingMissionMapping = useCallback((pending: SagaImportPendingMission) => {
    setAwaitingMission(true);
    setPendingMission(pending);
    return new Promise<string>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirmMissionMapping = useCallback((missionId: string) => {
    setAwaitingMission(false);
    resolverRef.current?.(missionId);
    resolverRef.current = null;
    setPendingMission(null);
  }, []);

  const clearMissionPrompt = useCallback((force = false) => {
    if (!force && awaitingMission) return;
    setAwaitingMission(false);
    resolverRef.current = null;
    setPendingMission(null);
  }, [awaitingMission]);

  const armMissionPromptFromProgress = useCallback((pending: SagaImportPendingMission | null | undefined) => {
    if (!pending?.lookupKey) return false;
    setAwaitingMission(true);
    setPendingMission(pending);
    return true;
  }, []);

  return {
    pendingMission,
    awaitingMission,
    onAwaitingMissionMapping,
    confirmMissionMapping,
    clearMissionPrompt,
    armMissionPromptFromProgress,
  };
}
