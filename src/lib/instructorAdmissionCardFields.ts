export type InstructorCardFieldKey =
  | "fullName"
  | "email"
  | "phone"
  | "hours"
  | "score"
  | "referralSource"
  | "sourceBadge"
  | "linkedAccount"
  | "formFilledAt"
  | "statusEnteredAt";

export const INSTRUCTOR_CARD_FIELD_DEFS: { key: InstructorCardFieldKey; label: string }[] = [
  { key: "fullName", label: "Nome completo (se nickname)" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "hours", label: "Horas de voo" },
  { key: "score", label: "Score" },
  { key: "referralSource", label: "Fonte / campanha" },
  { key: "sourceBadge", label: "Origem (manual/form/ativo)" },
  { key: "linkedAccount", label: "Conta vinculada" },
  { key: "formFilledAt", label: "Formulário preenchido em" },
  { key: "statusEnteredAt", label: "Entrada na etapa" },
];

export const DEFAULT_INSTRUCTOR_CARD_FIELDS = new Set<InstructorCardFieldKey>([
  "fullName",
  "email",
  "phone",
  "hours",
  "score",
  "referralSource",
  "sourceBadge",
]);

const STORAGE_PREFIX = "instructor_admission_card_fields_";

export function instructorCardFieldsStorageKey(userId: string | undefined): string {
  return userId ? `${STORAGE_PREFIX}${userId}` : `${STORAGE_PREFIX}guest`;
}

export function loadInstructorCardFields(storageKey: string): Set<InstructorCardFieldKey> {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const arr = JSON.parse(stored) as string[];
      const valid = new Set(
        arr.filter((k): k is InstructorCardFieldKey =>
          INSTRUCTOR_CARD_FIELD_DEFS.some((d) => d.key === k),
        ),
      );
      return valid.size > 0 ? valid : new Set(DEFAULT_INSTRUCTOR_CARD_FIELDS);
    }
  } catch {
    /* ignore */
  }
  return new Set(DEFAULT_INSTRUCTOR_CARD_FIELDS);
}

export function saveInstructorCardFields(storageKey: string, fields: Set<InstructorCardFieldKey>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(fields)));
  } catch {
    /* ignore */
  }
}
