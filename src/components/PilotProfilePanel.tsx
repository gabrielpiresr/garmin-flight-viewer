import type { ReactNode } from "react";
import type { PilotProfile } from "../lib/rbac";

type ProfileAction = {
  label: string;
  loadingLabel: string;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type PilotProfilePanelProps = {
  profile: PilotProfile;
  photoUrl: string;
  photoAlt: string;
  title: string;
  description: string;
  eyebrow?: string;
  action?: ProfileAction;
  message?: string;
  childrenBeforeAnac?: ReactNode;
};

function field(label: string, value: string | number | null | undefined) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-200 [overflow-wrap:anywhere]">{value || "—"}</p>
    </div>
  );
}

function parseBrDate(value: string): Date | null {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpiredDate(value: string): boolean {
  const date = parseBrDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function ExpiredBadge() {
  return <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300">Vencida</span>;
}

export function PilotProfilePanel({
  profile,
  photoUrl,
  photoAlt,
  title,
  description,
  eyebrow = "Perfil",
  action,
  message,
  childrenBeforeAnac,
}: PilotProfilePanelProps) {
  const medicalExpired = isExpiredDate(profile.anacMedical.validade);

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
            <div className="h-36 w-28 overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/60">
              {photoUrl ? (
                <img src={photoUrl} alt={photoAlt} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-500">
                  Foto ANAC
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">{eyebrow}</p>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="break-words text-xs text-slate-500">{description}</p>
            </div>
          </div>

          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 sm:w-auto"
            >
              {action.loading ? action.loadingLabel : action.label}
            </button>
          ) : null}
        </div>

        {message ? <p className="text-xs text-amber-400">{message}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {field("Nome completo", profile.fullName)}
          {field("E-mail", profile.email)}
          {field("CPF", profile.cpf)}
          {field("Telefone", profile.phone)}
          {field("Nascimento", profile.birthDate)}
          {field("Peso (kg)", profile.weightKg)}
          {field("Altura (cm)", profile.heightCm)}
          {field("Código ANAC", profile.anacCode)}
        </div>
      </section>

      {childrenBeforeAnac}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Habilitações</h3>
          {profile.anacRatings.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nenhuma habilitação importada.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {profile.anacRatings.map((item, idx) => {
                const expired = isExpiredDate(item.validade);
                return (
                  <li key={`${item.habilitacao}-${idx}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-words [overflow-wrap:anywhere]">{item.habilitacao}</span>
                    <span className={`flex items-center gap-2 text-xs ${expired ? "text-red-400" : "text-slate-400"}`}>
                      {item.validade || "—"}
                      {expired ? <ExpiredBadge /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Licenças</h3>
          {profile.anacLicenses.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nenhuma licença importada.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {profile.anacLicenses.map((item, idx) => (
                <li key={`${item.licenca}-${idx}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-words [overflow-wrap:anywhere]">{item.licenca}</span>
                  <span className="text-xs text-slate-400">{item.expedicao || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Certificado Médico Aeronáutico</h3>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <p>
              <span className="text-slate-400">Classe:</span> {profile.anacMedical.classe || "—"}
            </p>
            <p>
              <span className="text-slate-400">Validade:</span>{" "}
              <span className={medicalExpired ? "inline-flex items-center gap-2 text-red-400" : ""}>
                {profile.anacMedical.validade || "—"}
                {medicalExpired ? <ExpiredBadge /> : null}
              </span>
            </p>
            <p>
              <span className="text-slate-400">Órgão Expedidor:</span> {profile.anacMedical.orgao_expedidor || "—"}
            </p>
            <p>
              <span className="text-slate-400">Observações:</span> {profile.anacMedical.observacoes || "—"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
