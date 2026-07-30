import type { InstructorAdmissionCandidate, InstructorAdmissionForm } from "../types/instructorAdmission";
import { candidateDisplayName } from "../types/instructorAdmission";
import type { InstructorHoursMap } from "./instructorAdmissionMetrics";
import { computeInstructorAdmissionScore } from "./instructorAdmissionScore";

export type InstructorAdmissionSortKey =
  | "displayName"
  | "createdAt"
  | "statusEnteredAt"
  | "formFilledAt"
  | "score"
  | "totalHours"
  | "monthHours"
  | "email"
  | "referralSource";

export const INSTRUCTOR_ADMISSION_SORT_OPTIONS: {
  value: InstructorAdmissionSortKey;
  label: string;
  defaultAsc: boolean;
}[] = [
  { value: "displayName", label: "Nome", defaultAsc: true },
  { value: "createdAt", label: "Data de criação", defaultAsc: false },
  { value: "statusEnteredAt", label: "Entrada na etapa", defaultAsc: true },
  { value: "formFilledAt", label: "Formulário preenchido", defaultAsc: false },
  { value: "score", label: "Score", defaultAsc: false },
  { value: "totalHours", label: "Horas totais", defaultAsc: false },
  { value: "monthHours", label: "Horas no mês", defaultAsc: false },
  { value: "email", label: "E-mail", defaultAsc: true },
  { value: "referralSource", label: "Fonte / campanha", defaultAsc: true },
];

export const DEFAULT_INSTRUCTOR_ADMISSION_SORT: InstructorAdmissionSortKey = "displayName";

const SORT_KEY_LS = "instructor_admission_sort_key";
const SORT_ASC_LS = "instructor_admission_sort_asc";

function dateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function hoursValue(
  candidate: InstructorAdmissionCandidate,
  hoursMap: InstructorHoursMap,
  kind: "totalHours" | "monthHours",
): number {
  if (!candidate.userId) return -1;
  const hours = hoursMap[candidate.userId];
  if (!hours) return -1;
  return hours[kind];
}

export function defaultInstructorSortAscForKey(sortKey: InstructorAdmissionSortKey): boolean {
  return INSTRUCTOR_ADMISSION_SORT_OPTIONS.find((o) => o.value === sortKey)?.defaultAsc ?? false;
}

export function loadInstructorAdmissionSort(): { key: InstructorAdmissionSortKey; asc: boolean } {
  try {
    const keyRaw = localStorage.getItem(SORT_KEY_LS);
    const key =
      keyRaw && INSTRUCTOR_ADMISSION_SORT_OPTIONS.some((o) => o.value === keyRaw)
        ? (keyRaw as InstructorAdmissionSortKey)
        : DEFAULT_INSTRUCTOR_ADMISSION_SORT;
    const ascRaw = localStorage.getItem(SORT_ASC_LS);
    const asc =
      ascRaw === "true" || ascRaw === "false"
        ? ascRaw === "true"
        : defaultInstructorSortAscForKey(key);
    return { key, asc };
  } catch {
    return {
      key: DEFAULT_INSTRUCTOR_ADMISSION_SORT,
      asc: defaultInstructorSortAscForKey(DEFAULT_INSTRUCTOR_ADMISSION_SORT),
    };
  }
}

export function saveInstructorAdmissionSort(key: InstructorAdmissionSortKey, asc: boolean) {
  try {
    localStorage.setItem(SORT_KEY_LS, key);
    localStorage.setItem(SORT_ASC_LS, String(asc));
  } catch {
    /* ignore */
  }
}

export function compareInstructorAdmissionCandidates(
  a: InstructorAdmissionCandidate,
  b: InstructorAdmissionCandidate,
  sortKey: InstructorAdmissionSortKey,
  form: InstructorAdmissionForm | null,
  hoursMap: InstructorHoursMap,
): number {
  switch (sortKey) {
    case "email":
      return a.email.localeCompare(b.email, "pt-BR");
    case "referralSource":
      return (a.referralSource || "").localeCompare(b.referralSource || "", "pt-BR");
    case "score": {
      const scoreA = form?.scoreRules?.length
        ? computeInstructorAdmissionScore(a.responses, form.scoreRules, form.fields).total
        : -1;
      const scoreB = form?.scoreRules?.length
        ? computeInstructorAdmissionScore(b.responses, form.scoreRules, form.fields).total
        : -1;
      return scoreA - scoreB;
    }
    case "totalHours":
      return hoursValue(a, hoursMap, "totalHours") - hoursValue(b, hoursMap, "totalHours");
    case "monthHours":
      return hoursValue(a, hoursMap, "monthHours") - hoursValue(b, hoursMap, "monthHours");
    case "formFilledAt":
      return dateValue(a.formFilledAt) - dateValue(b.formFilledAt);
    case "statusEnteredAt":
      return dateValue(a.statusEnteredAt) - dateValue(b.statusEnteredAt);
    case "createdAt":
      return dateValue(a.createdAt) - dateValue(b.createdAt);
    case "displayName":
    default:
      return candidateDisplayName(a).localeCompare(candidateDisplayName(b), "pt-BR", { numeric: true });
  }
}

export function sortInstructorAdmissionCandidates(
  candidates: InstructorAdmissionCandidate[],
  sortKey: InstructorAdmissionSortKey,
  sortAsc: boolean,
  form: InstructorAdmissionForm | null,
  hoursMap: InstructorHoursMap,
): InstructorAdmissionCandidate[] {
  const copy = [...candidates];
  copy.sort((a, b) => {
    const cmp = compareInstructorAdmissionCandidates(a, b, sortKey, form, hoursMap);
    return sortAsc ? cmp : -cmp;
  });
  return copy;
}
