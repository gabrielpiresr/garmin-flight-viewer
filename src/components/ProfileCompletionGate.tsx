import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { getProfile, updateProfileFields, type EnsureProfileUpdates, type PilotProfile } from "../lib/rbac";
import {
  PROFILE_COMPLETION_SECTIONS,
  buildProfileCompletionInitialValues,
  getMissingProfileCompletionFields,
  getProfileCompletionInputValue,
  normalizeProfileCompletionValue,
  onlyDigits,
  type ProfileCompletionField,
  type ProfileCompletionFieldKey,
} from "../lib/profileCompletion";

type ProfileCompletionGateProps = {
  userId: string | null | undefined;
  enabled: boolean;
  onSignOut?: () => void | Promise<void>;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40";

function fieldIsValid(field: ProfileCompletionField, value: string): boolean {
  if (field.type === "number") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0;
  }
  if (field.type === "cpf") return onlyDigits(value).length === 11;
  if (field.type === "cep") return onlyDigits(value).length === 8;
  if (field.type === "tel") return onlyDigits(value).length >= 10;
  if (field.type === "digits") return onlyDigits(value).length > 0;
  return value.trim().length > 0;
}

function fieldError(field: ProfileCompletionField, value: string): string | null {
  if (fieldIsValid(field, value)) return null;
  if (field.type === "cpf") return "Informe um CPF com 11 dígitos.";
  if (field.type === "cep") return "Informe um CEP com 8 dígitos.";
  if (field.type === "tel") return "Informe DDD e telefone.";
  if (field.type === "number") return "Informe um número maior que zero.";
  return "Campo obrigatório.";
}

function renderField(
  field: ProfileCompletionField,
  value: string,
  error: string | null,
  onChange: (value: string) => void,
) {
  const describedBy = error ? `profile-completion-${field.key}-error` : undefined;
  const baseProps = {
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange(getProfileCompletionInputValue(field, event.target.value)),
    className: `${inputClass} ${error ? "border-red-500/70 focus:border-red-400 focus:ring-red-500/30" : ""}`,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
  };

  return (
    <label key={field.key} className="block text-xs font-medium text-slate-400">
      {field.label}
      {field.type === "select" ? (
        <select {...baseProps}>
          <option value="">Selecione...</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea {...baseProps} rows={2} placeholder={field.placeholder} />
      ) : (
        <input
          {...baseProps}
          type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
          inputMode={
            field.type === "cpf" || field.type === "cep" || field.type === "digits"
              ? "numeric"
              : field.type === "number"
                ? "decimal"
                : field.type === "tel"
                  ? "tel"
                  : undefined
          }
          min={field.key === "heightCm" ? 1 : field.type === "number" ? 1 : undefined}
          step={field.type === "number" ? 0.1 : undefined}
          placeholder={field.placeholder}
        />
      )}
      {error ? (
        <span id={describedBy} className="mt-1 block text-[11px] text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function ProfileCompletionGate({ userId, enabled, onSignOut }: ProfileCompletionGateProps) {
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [values, setValues] = useState<Record<ProfileCompletionFieldKey, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!userId || !enabled) return;
    setLoading(true);
    setError(null);
    const result = await getProfile(userId);
    if (result.error) {
      setError(result.error.message);
      setProfile(null);
      setValues(null);
    } else {
      setProfile(result.data);
      setValues(result.data ? buildProfileCompletionInitialValues(result.data) : null);
    }
    setLoading(false);
  }, [enabled, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const missingFields = useMemo(() => (profile ? getMissingProfileCompletionFields(profile) : []), [profile]);
  const visibleSections = useMemo(
    () =>
      PROFILE_COMPLETION_SECTIONS.map((section) => ({
        ...section,
        fields: section.fields.filter((field) => missingFields.some((missing) => missing.key === field.key)),
      })).filter((section) => section.fields.length > 0),
    [missingFields],
  );
  const isBlocking = enabled && Boolean(profile) && missingFields.length > 0;

  if (!enabled || !userId || !isBlocking) return null;

  const errors = new Map(
    missingFields.map((field) => [field.key, values ? fieldError(field, values[field.key] ?? "") : "Campo obrigatório."]),
  );
  const invalidCount = Array.from(errors.values()).filter(Boolean).length;

  async function handleSave() {
    if (!userId || !values) return;
    setSubmitted(true);
    const nextErrors = missingFields.map((field) => fieldError(field, values[field.key] ?? "")).filter(Boolean);
    if (nextErrors.length > 0) return;

    setSaving(true);
    setError(null);
    const updates: EnsureProfileUpdates = {};
    for (const field of PROFILE_COMPLETION_SECTIONS.flatMap((section) => section.fields)) {
      updates[field.dbKey] = normalizeProfileCompletionValue(field, values[field.key] ?? "") as never;
    }

    const result = await updateProfileFields(userId, updates);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Não foi possível salvar seus dados.");
    } else {
      setProfile(result.data);
      setValues(buildProfileCompletionInitialValues(result.data));
      window.dispatchEvent(new CustomEvent("profile-completion-updated"));
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-completion-title"
    >
      <div className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950 sm:max-h-[88vh] sm:max-w-3xl sm:rounded-2xl">
        <div className="border-b border-slate-800 px-4 py-4 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">Atualização obrigatória</p>
          <h2 id="profile-completion-title" className="mt-1 text-lg font-semibold text-slate-100">
            Complete seus dados para continuar
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-400">
            Encontramos {missingFields.length} campo(s) pendente(s) no seu perfil e na ficha de matrícula. O sistema fica bloqueado até o preenchimento.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <p className="text-sm text-slate-400">Carregando seus dados...</p>
          ) : null}
          <div className="space-y-5">
            {visibleSections.map((section) => (
              <section key={section.title} className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">{section.title}</h3>
                  <p className="text-xs text-slate-500">{section.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.fields.map((field) =>
                    renderField(
                      field,
                      values?.[field.key] ?? "",
                      submitted ? errors.get(field.key) ?? null : null,
                      (next) => setValues((current) => (current ? { ...current, [field.key]: next } : current)),
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}
          {submitted && invalidCount > 0 ? (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
              Revise os campos destacados para liberar o acesso.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-5 sm:pb-3">
          {onSignOut ? (
            <button
              type="button"
              onClick={() => void onSignOut()}
              disabled={saving}
              className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-60 sm:w-auto"
            >
              Sair da conta
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !values}
            className="rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60 sm:min-w-44"
          >
            {saving ? "Salvando..." : "Salvar e continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}
