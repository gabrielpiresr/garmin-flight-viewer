import type { AdminUserProfileUpdateInput } from "./adminUsersDb";
import type {
  InstructorAdmissionCandidate,
  InstructorAdmissionFieldValue,
  InstructorAdmissionForm,
  InstructorAdmissionSystemProperty,
} from "../types/instructorAdmission";

function stringValue(value: InstructorAdmissionFieldValue | undefined): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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
    default:
      return "";
  }
}
