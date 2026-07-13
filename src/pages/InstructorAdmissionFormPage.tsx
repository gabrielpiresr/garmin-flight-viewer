import { useEffect, useState } from "react";
import {
  getInstructorAdmissionCandidateByRegistrationToken,
  getPublicInstructorAdmissionForm,
  listInstructorAdmissionStages,
  submitInstructorAdmissionForm,
  uploadInstructorAdmissionFile,
} from "../lib/instructorAdmissionDb";
import { buildInitialResponsesFromCandidate } from "../lib/instructorAdmissionFormFields";
import { getCachedBrandSettings, getEmailBrandSettings } from "../lib/notificationsDb";
import type {
  InstructorAdmissionCandidate,
  InstructorAdmissionFieldValue,
  InstructorAdmissionFileValue,
  InstructorAdmissionForm,
  InstructorAdmissionFormField,
} from "../types/instructorAdmission";

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhoneInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: InstructorAdmissionFormField;
  value: InstructorAdmissionFieldValue | undefined;
  onChange: (value: InstructorAdmissionFieldValue) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const baseClass =
    "mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none";

  if (field.type === "textarea") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={4}
        disabled={disabled}
        className={baseClass}
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 accent-sky-500"
        />
        {field.placeholder || "Sim"}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={baseClass}
      >
        <option value="">Selecione...</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "attachment") {
    const fileValue = value as InstructorAdmissionFileValue | undefined;
    return (
      <div className="mt-1">
        <input
          type="file"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploadError(null);
            setUploading(true);
            void uploadInstructorAdmissionFile(file)
              .then((uploaded) => onChange(uploaded))
              .catch((error) => {
                setUploadError(error instanceof Error ? error.message : "Falha no upload.");
              })
              .finally(() => setUploading(false));
          }}
          className="block w-full text-sm text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-sky-500"
        />
        {uploading && <p className="mt-1 text-xs text-slate-500">Enviando arquivo...</p>}
        {uploadError && <p className="mt-1 text-xs text-red-400">{uploadError}</p>}
        {fileValue?.fileName && (
          <p className="mt-1 text-xs text-emerald-400">✓ {fileValue.fileName}</p>
        )}
      </div>
    );
  }

  const inputType =
    field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  return (
    <input
      type={inputType}
      value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      onChange={(e) => {
        if (field.type === "phone") onChange(formatPhoneInput(e.target.value));
        else if (field.type === "number") onChange(e.target.value ? Number(e.target.value) : "");
        else onChange(e.target.value);
      }}
      placeholder={field.placeholder}
      disabled={disabled}
      className={baseClass}
    />
  );
}

export function InstructorAdmissionFormPage() {
  const params = new URLSearchParams(window.location.search);
  const tokenHint = params.get("token")?.trim() || "";
  const emailHint = params.get("email")?.trim() || "";

  const [brand, setBrand] = useState(() => getCachedBrandSettings());
  const logoUrl = brand?.logoDataUrl || brand?.logoUrl || "";
  const schoolName = brand?.schoolName || "Escola";

  const [form, setForm] = useState<InstructorAdmissionForm | null>(null);
  const [linkedCandidate, setLinkedCandidate] = useState<InstructorAdmissionCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Record<string, InstructorAdmissionFieldValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void getEmailBrandSettings()
      .then((settings) => {
        if (!cancelled) setBrand(settings);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [nextForm, stages, candidate] = await Promise.all([
          getPublicInstructorAdmissionForm(),
          listInstructorAdmissionStages(),
          tokenHint ? getInstructorAdmissionCandidateByRegistrationToken(tokenHint) : Promise.resolve(null),
        ]);
        if (!nextForm) {
          setLoadError("O formulário de candidatura não está disponível no momento.");
          return;
        }
        if (!stages.length) {
          setLoadError("O processo seletivo ainda não foi configurado.");
          return;
        }
        if (tokenHint && !candidate) {
          setLoadError("Link de registro inválido ou expirado.");
          return;
        }
        setForm(nextForm);
        setLinkedCandidate(candidate);
        const initial = candidate
          ? buildInitialResponsesFromCandidate(nextForm, candidate)
          : {};
        if (!candidate && emailHint) {
          const emailField = nextForm.fields.find(
            (field) => field.type === "email" || field.systemProperty === "email",
          );
          if (emailField) initial[emailField.id] = emailHint;
        }
        setResponses(initial);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar formulário.");
      } finally {
        setLoading(false);
      }
    })();
  }, [emailHint, tokenHint]);

  function isFieldEmpty(field: InstructorAdmissionFormField, value: InstructorAdmissionFieldValue | undefined): boolean {
    if (field.type === "checkbox") return value !== true;
    if (field.type === "attachment") {
      const file = value as InstructorAdmissionFileValue | undefined;
      return !file?.fileId;
    }
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return !value.trim();
    return false;
  }

  function validateForm(): Record<string, string> {
    if (!form) return {};
    const next: Record<string, string> = {};
    for (const field of form.fields) {
      if (!field.required) continue;
      if (isFieldEmpty(field, responses[field.id])) {
        next[field.id] = `O campo "${field.label}" é obrigatório.`;
      }
    }
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setSubmitError("Preencha todos os campos obrigatórios antes de enviar.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      await submitInstructorAdmissionForm(responses, { token: tokenHint || undefined });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Falha ao enviar candidatura.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Carregando formulário...
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-800/50 bg-slate-900 p-8 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName} className="mx-auto mb-4 h-14 w-auto object-contain" />
          ) : null}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-900/40 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-semibold text-white">Candidatura enviada!</h1>
          <p className="mt-2 text-sm text-slate-400">
            Recebemos sua candidatura. Nossa equipe entrará em contato em breve.
          </p>
        </div>
      </div>
    );
  }

  if (!form || loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName} className="mx-auto mb-4 h-14 w-auto object-contain" />
          ) : null}
          <h1 className="text-lg font-semibold text-white">Formulário indisponível</h1>
          <p className="mt-2 text-sm text-slate-400">{loadError || "Tente novamente mais tarde."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName} className="mx-auto mb-4 h-16 w-auto object-contain" />
          ) : null}
          <h1 className="text-2xl font-bold text-white">{form.title}</h1>
          {form.description && <p className="mt-2 text-sm text-slate-400">{form.description}</p>}
          {linkedCandidate && (
            <p className="mt-2 text-xs text-sky-400">
              Olá, {linkedCandidate.name.split(" ")[0]}! Complete seu cadastro abaixo.
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
        >
          {form.fields.map((field) => (
            <label key={field.id} className="block text-sm text-slate-300">
              <span>
                {field.label}
                {field.required && <span className="ml-1 text-red-400">*</span>}
              </span>
              {field.helpText && (
                <span className="mt-0.5 block text-xs text-slate-500">{field.helpText}</span>
              )}
              <FieldInput
                field={field}
                value={responses[field.id]}
                onChange={(value) => {
                  setResponses((current) => ({ ...current, [field.id]: value }));
                  if (fieldErrors[field.id]) {
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next[field.id];
                      return next;
                    });
                  }
                  if (submitError) setSubmitError(null);
                }}
                disabled={submitting}
              />
              {fieldErrors[field.id] && (
                <p className="mt-1 text-xs text-red-400">{fieldErrors[field.id]}</p>
              )}
            </label>
          ))}

          {submitError && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Enviar candidatura"}
          </button>
        </form>
      </div>
    </div>
  );
}
