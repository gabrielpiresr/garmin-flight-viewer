import type { AdminUserProfileUpdateInput } from "./adminUsersDb";
import type {
  InstructorAdmissionCandidate,
  InstructorAdmissionFieldValue,
  InstructorAdmissionForm,
  InstructorAdmissionFormField,
  InstructorAdmissionSystemProperty,
} from "../types/instructorAdmission";

export const INSTRUCTOR_ADMISSION_SAGA_ANAC_RESPONSE_KEY = "__saga_anac_json";
export const INSTRUCTOR_ADMISSION_SAGA_ANAC_LOOKUP_AT_KEY = "__saga_anac_lookup_at";
export const INSTRUCTOR_ADMISSION_SAGA_ANAC_MESSAGE_KEY = "__saga_anac_message";

function stringValue(value: InstructorAdmissionFieldValue | undefined): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normal(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function fieldMatchesSystemProperty(
  field: InstructorAdmissionFormField,
  property: InstructorAdmissionSystemProperty,
): boolean {
  if (field.systemProperty === property) return true;
  const haystack = `${normal(field.id)} ${normal(field.label)}`;
  switch (property) {
    case "fullName":
      return field.type === "text" && /\bnome\b/.test(haystack);
    case "nickname":
      return /apelido|nickname/.test(haystack);
    case "email":
      return field.type === "email" || /e-?mail|email/.test(haystack);
    case "phone":
      return field.type === "phone" || /telefone|celular|whatsapp|phone/.test(haystack);
    case "cpf":
      return /\bcpf\b/.test(haystack);
    case "anacCode":
      return /anac|canac/.test(haystack);
    case "birthDate":
      return /nascimento|birth|data de nasc/.test(haystack);
  }
}

export function admissionValueForSystemProperty(
  form: InstructorAdmissionForm | null,
  responses: Record<string, InstructorAdmissionFieldValue>,
  property: InstructorAdmissionSystemProperty,
): string {
  const field = form?.fields.find((item) => fieldMatchesSystemProperty(item, property));
  return field ? stringValue(responses[field.id]) : "";
}

export function getInstructorCandidateSagaAnacJson(
  candidate: InstructorAdmissionCandidate,
): string | null {
  const value = candidate.responses[INSTRUCTOR_ADMISSION_SAGA_ANAC_RESPONSE_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

export function isInstructorAdmissionInternalResponseKey(key: string): boolean {
  return key === INSTRUCTOR_ADMISSION_SAGA_ANAC_RESPONSE_KEY ||
    key === INSTRUCTOR_ADMISSION_SAGA_ANAC_LOOKUP_AT_KEY ||
    key === INSTRUCTOR_ADMISSION_SAGA_ANAC_MESSAGE_KEY;
}

export function withInstructorCandidateSagaAnacResponse(
  responses: Record<string, InstructorAdmissionFieldValue>,
  data: unknown,
  message?: string,
): Record<string, InstructorAdmissionFieldValue> {
  return {
    ...responses,
    [INSTRUCTOR_ADMISSION_SAGA_ANAC_RESPONSE_KEY]: JSON.stringify(data),
    [INSTRUCTOR_ADMISSION_SAGA_ANAC_LOOKUP_AT_KEY]: new Date().toISOString(),
    [INSTRUCTOR_ADMISSION_SAGA_ANAC_MESSAGE_KEY]: message || "Dados ANAC obtidos no SAGA.",
  };
}

function applySystemProperty(
  property: InstructorAdmissionSystemProperty,
  value: string,
  result: {
    name?: string;
    email?: string;
    phone?: string;
    nickname?: string;
    profilePatch: AdminUserProfileUpdateInput;
  },
) {
  if (!value) return;
  switch (property) {
    case "fullName":
      result.name = value;
      result.profilePatch.fullName = value;
      break;
    case "nickname":
      result.nickname = value;
      result.profilePatch.nickname = value;
      break;
    case "email":
      result.email = value.toLowerCase();
      result.profilePatch.email = value.toLowerCase();
      break;
    case "phone":
      result.phone = value;
      result.profilePatch.phone = value;
      break;
    case "cpf":
      result.profilePatch.cpf = value;
      break;
    case "anacCode":
      result.profilePatch.anacCode = value;
      break;
    case "birthDate":
      result.profilePatch.birthDate = value;
      break;
  }
}

export function extractAdmissionFieldsFromResponses(
  form: InstructorAdmissionForm,
  responses: Record<string, InstructorAdmissionFieldValue>,
): {
  name?: string;
  email?: string;
  phone?: string;
  nickname?: string;
  profilePatch: AdminUserProfileUpdateInput;
} {
  const result: {
    name?: string;
    email?: string;
    phone?: string;
    nickname?: string;
    profilePatch: AdminUserProfileUpdateInput;
  } = { profilePatch: {} };

  for (const field of form.fields) {
    if (field.systemProperty) {
      applySystemProperty(field.systemProperty, stringValue(responses[field.id]), result);
    }
  }

  if (!result.name) {
    const nameField = form.fields.find((field) => field.type === "text" && /nome/i.test(field.label));
    if (nameField) result.name = stringValue(responses[nameField.id]);
  }
  if (!result.email) {
    const emailField = form.fields.find((field) => field.type === "email");
    if (emailField) result.email = stringValue(responses[emailField.id]).toLowerCase();
  }
  if (!result.phone) {
    const phoneField = form.fields.find((field) => field.type === "phone");
    if (phoneField) result.phone = stringValue(responses[phoneField.id]);
  }
  for (const property of ["cpf", "anacCode", "birthDate"] as const) {
    if (result.profilePatch[property]) continue;
    const value = admissionValueForSystemProperty(form, responses, property);
    if (value) applySystemProperty(property, value, result);
  }

  return result;
}

export function buildInitialResponsesFromCandidate(
  form: InstructorAdmissionForm,
  candidate: InstructorAdmissionCandidate,
): Record<string, InstructorAdmissionFieldValue> {
  const responses: Record<string, InstructorAdmissionFieldValue> = { ...candidate.responses };

  for (const field of form.fields) {
    if (!field.systemProperty) continue;
    if (responses[field.id] !== undefined && responses[field.id] !== "") continue;
    switch (field.systemProperty) {
      case "fullName":
        responses[field.id] = candidate.name;
        break;
      case "nickname":
        if (candidate.nickname) responses[field.id] = candidate.nickname;
        break;
      case "email":
        responses[field.id] = candidate.email;
        break;
      case "phone":
        if (candidate.phone) responses[field.id] = candidate.phone;
        break;
      case "cpf":
      case "anacCode":
      case "birthDate":
        break;
      default:
        break;
    }
  }

  return responses;
}

export function candidateValueForSystemProperty(
  candidate: InstructorAdmissionCandidate,
  property: InstructorAdmissionSystemProperty,
): string {
  switch (property) {
    case "fullName":
      return candidate.name;
    case "nickname":
      return candidate.nickname || "";
    case "email":
      return candidate.email;
    case "phone":
      return candidate.phone || "";
    case "cpf":
    case "anacCode":
    case "birthDate":
      return admissionValueForSystemProperty(null, candidate.responses, property);
    default:
      return "";
  }
}
