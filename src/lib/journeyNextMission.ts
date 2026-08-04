/**
 * Próxima missão da trilha: após a última missão aprovada, mesmo que existam
 * missões vazias/puladas antes dela. Retorna -1 se a trilha estiver completa.
 */
export function findNextOpenMissionIndex(
  missionIdsInOrder: string[],
  approvedMissionIds: Set<string>,
): number {
  const lastApprovedIndex = missionIdsInOrder.reduce(
    (lastIdx, id, idx) => (approvedMissionIds.has(id) ? idx : lastIdx),
    -1,
  );
  if (lastApprovedIndex >= 0) {
    return missionIdsInOrder.findIndex(
      (id, i) => i > lastApprovedIndex && !approvedMissionIds.has(id),
    );
  }
  return missionIdsInOrder.findIndex((id) => !approvedMissionIds.has(id));
}
