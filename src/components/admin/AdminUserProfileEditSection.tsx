import { useEffect, useState, type ChangeEvent } from "react";
import type { AdminUserDetail } from "../../types/adminUsers";
import type { AdminUserProfileUpdateInput } from "../../lib/adminUsersDb";
import {
  BRAZIL_UFS,
  ESCOLARIDADE_OPTIONS,
  ESTADO_CIVIL_OPTIONS,
  formatCep,
  formatCpf,
  formatPhone,
  onlyDigits,
} from "../../lib/profileCompletion";

type ProfileDraft = {
  fullName: string;
  nickname: string;
  email: string;
  cpf: string;
  phone: string;
  birthDate: string;
  anacCode: string;
  sagaUserId: string;
  weightKg: string;
  heightCm: string;
  rg: string;
  rgOrgaoExpedidor: string;
  rgDataEmissao: string;
  nacionalidade: string;
  estadoCivil: string;
  endereco: string;
  cep: string;
  cidade: string;
  uf: string;
  sexo: string;
  naturalidade: string;
  filiacaoPai: string;
  filiacaoMae: string;
  escolaridade: string;
  escolaridadePeriodo: string;
  escolaridadeCurso: string;
  alergiasMedicamentos: string;
  emergenciaNome: string;
  emergenciaParentesco: string;
  emergenciaEndereco: string;
  emergenciaTelefone: string;
};

type DraftField = {
  key: keyof ProfileDraft;
  label: string;
  type?: "text" | "email" | "date" | "number" | "select" | "textarea" | "cpf" | "cep" | "phone" | "digits";
  placeholder?: string;
  options?: string[] | Array<{ value: string; label: string }>;
  wide?: boolean;
};

function detailToDraft(detail: AdminUserDetail): ProfileDraft {
  const profile = detail.profile;
  return {
    fullName: profile.fullName || detail.name || "",
    nickname: profile.nickname || "",
    email: detail.email || "",
    cpf: profile.cpf ? formatCpf(profile.cpf) : "",
    phone: profile.phone ? formatPhone(profile.phone) : "",
    birthDate: profile.birthDate?.slice(0, 10) || "",
    anacCode: profile.anacCode || "",
    sagaUserId: profile.sagaUserId || "",
    weightKg: profile.weightKg != null ? String(profile.weightKg) : "",
    heightCm: profile.heightCm != null ? String(profile.heightCm) : "",
    rg: profile.rg || "",
    rgOrgaoExpedidor: profile.rgOrgaoExpedidor || "",
    rgDataEmissao: profile.rgDataEmissao?.slice(0, 10) || "",
    nacionalidade: profile.nacionalidade || "",
    estadoCivil: profile.estadoCivil || "",
    endereco: profile.endereco || "",
    cep: profile.cep ? formatCep(profile.cep) : "",
    cidade: profile.cidade || "",
    uf: profile.uf || "",
    sexo: profile.sexo || "",
    naturalidade: profile.naturalidade || "",
    filiacaoPai: profile.filiacaoPai || "",
    filiacaoMae: profile.filiacaoMae || "",
    escolaridade: profile.escolaridade || "",
    escolaridadePeriodo: profile.escolaridadePeriodo || "",
    escolaridadeCurso: profile.escolaridadeCurso || "",
    alergiasMedicamentos: profile.alergiasMedicamentos || "",
    emergenciaNome: profile.emergenciaNome || "",
    emergenciaParentesco: profile.emergenciaParentesco || "",
    emergenciaEndereco: profile.emergenciaEndereco || "",
    emergenciaTelefone: profile.emergenciaTelefone ? formatPhone(profile.emergenciaTelefone) : "",
  };
}

function positiveNumberOrNull(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function draftToPayload(draft: ProfileDraft): AdminUserProfileUpdateInput {
  return {
    fullName: draft.fullName.trim(),
    nickname: draft.nickname.trim(),
    email: draft.email.trim(),
    cpf: onlyDigits(draft.cpf),
    phone: onlyDigits(draft.phone),
    birthDate: draft.birthDate.trim(),
    anacCode: onlyDigits(draft.anacCode),
    sagaUserId: draft.sagaUserId.trim(),
    weightKg: positiveNumberOrNull(draft.weightKg),
    heightCm: positiveNumberOrNull(draft.heightCm),
    rg: draft.rg.trim(),
    rgOrgaoExpedidor: draft.rgOrgaoExpedidor.trim(),
    rgDataEmissao: draft.rgDataEmissao.trim(),
    nacionalidade: draft.nacionalidade.trim(),
    estadoCivil: draft.estadoCivil.trim(),
    endereco: draft.endereco.trim(),
    cep: onlyDigits(draft.cep),
    cidade: draft.cidade.trim(),
    uf: draft.uf.trim(),
    sexo: draft.sexo.trim(),
    naturalidade: draft.naturalidade.trim(),
    filiacaoPai: draft.filiacaoPai.trim(),
    filiacaoMae: draft.filiacaoMae.trim(),
    escolaridade: draft.escolaridade.trim(),
    escolaridadePeriodo: draft.escolaridadePeriodo.trim(),
    escolaridadeCurso: draft.escolaridadeCurso.trim(),
    alergiasMedicamentos: draft.alergiasMedicamentos.trim(),
    emergenciaNome: draft.emergenciaNome.trim(),
    emergenciaParentesco: draft.emergenciaParentesco.trim(),
    emergenciaEndereco: draft.emergenciaEndereco.trim(),
    emergenciaTelefone: onlyDigits(draft.emergenciaTelefone),
  };
}

function normalizeDraftInput(field: DraftField, value: string): string {
  if (field.type === "cpf") return formatCpf(value);
  if (field.type === "cep") return formatCep(value);
  if (field.type === "phone") return formatPhone(value);
  if (field.type === "digits") return onlyDigits(value);
  return value;
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none";

const MAIN_FIELDS: DraftField[] = [
  { key: "fullName", label: "Nome completo" },
  { key: "nickname", label: "Nickname", placeholder: "Apelido no SAGA" },
  { key: "email", label: "E-mail (login)", type: "email" },
  { key: "cpf", label: "CPF", type: "cpf" },
  { key: "phone", label: "Telefone", type: "phone" },
  { key: "birthDate", label: "Data de nascimento", type: "date" },
  { key: "anacCode", label: "Código ANAC", type: "digits" },
  { key: "weightKg", label: "Peso (kg)", type: "number" },
  { key: "heightCm", label: "Altura (cm)", type: "number" },
];

const ENROLLMENT_FIELDS: DraftField[] = [
  { key: "rg", label: "RG" },
  { key: "rgOrgaoExpedidor", label: "Órgão expedidor" },
  { key: "rgDataEmissao", label: "Data de emissão do RG", type: "date" },
  { key: "nacionalidade", label: "Nacionalidade" },
  { key: "estadoCivil", label: "Estado civil", type: "select", options: ESTADO_CIVIL_OPTIONS },
  { key: "endereco", label: "Endereço residencial", wide: true },
  { key: "cep", label: "CEP", type: "cep" },
  { key: "uf", label: "UF", type: "select", options: BRAZIL_UFS },
  { key: "cidade", label: "Cidade" },
];

const COMPLEMENT_FIELDS: DraftField[] = [
  {
    key: "sexo",
    label: "Sexo",
    type: "select",
    options: [
      { value: "M", label: "Masculino" },
      { value: "F", label: "Feminino" },
    ],
  },
  { key: "naturalidade", label: "Naturalidade" },
  { key: "filiacaoPai", label: "Filiação - pai" },
  { key: "filiacaoMae", label: "Filiação - mãe" },
  { key: "escolaridade", label: "Escolaridade", type: "select", options: ESCOLARIDADE_OPTIONS },
  { key: "escolaridadePeriodo", label: "Série/período" },
  { key: "escolaridadeCurso", label: "Curso (formação)" },
  { key: "alergiasMedicamentos", label: "Alergias a medicamentos", type: "textarea", wide: true },
  { key: "emergenciaNome", label: "Emergência - nome" },
  { key: "emergenciaParentesco", label: "Emergência - parentesco" },
  { key: "emergenciaEndereco", label: "Emergência - endereço", wide: true },
  { key: "emergenciaTelefone", label: "Emergência - telefone", type: "phone" },
];

type Props = {
  detail: AdminUserDetail;
  saving: boolean;
  onSave: (payload: AdminUserProfileUpdateInput) => void;
};

export function AdminUserProfileEditSection({ detail, saving, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => detailToDraft(detail));
  const [baseline, setBaseline] = useState<ProfileDraft>(() => detailToDraft(detail));

  useEffect(() => {
    const next = detailToDraft(detail);
    setDraft(next);
    setBaseline(next);
    setEditing(false);
  }, [detail]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function setField(key: keyof ProfileDraft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleCancel() {
    setDraft(baseline);
    setEditing(false);
  }

  function handleSave() {
    onSave(draftToPayload(draft));
  }

  function renderOptions(options: DraftField["options"]) {
    return options?.map((option) => {
      const value = typeof option === "string" ? option : option.value;
      const label = typeof option === "string" ? option : option.label;
      return (
        <option key={value} value={value}>
          {label}
        </option>
      );
    });
  }

  function renderField(field: DraftField) {
    const common = {
      value: draft[field.key],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setField(field.key, normalizeDraftInput(field, event.target.value)),
      className: inputCls,
      placeholder: field.placeholder,
    };

    return (
      <label key={field.key} className={`block text-xs text-slate-500 ${field.wide ? "lg:col-span-2" : ""}`}>
        {field.label}
        {field.type === "select" ? (
          <select {...common}>
            <option value="">Selecione...</option>
            {renderOptions(field.options)}
          </select>
        ) : field.type === "textarea" ? (
          <textarea {...common} rows={2} />
        ) : (
          <input
            {...common}
            type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
            inputMode={
              field.type === "cpf" || field.type === "cep" || field.type === "digits"
                ? "numeric"
                : field.type === "phone"
                  ? "tel"
                  : field.type === "number"
                    ? "decimal"
                    : undefined
            }
            min={field.type === "number" ? 0 : undefined}
            step={field.key === "heightCm" ? 1 : field.type === "number" ? 0.1 : undefined}
          />
        )}
      </label>
    );
  }

  if (!editing) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500">Dados cadastrais do perfil, ficha de matrícula e vínculo SAGA.</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
        >
          Editar perfil completo
        </button>
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-cyan-800/40 bg-cyan-950/10 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/90">Editar perfil completo</p>
          <p className="mt-1 text-xs text-slate-500">Altera os campos salvos no perfil do aluno. Anexos continuam separados.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Dados principais</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {MAIN_FIELDS.map(renderField)}
            <label className="block text-xs text-slate-500 md:col-span-2">
              ID SAGA
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={draft.sagaUserId}
                  onChange={(e) => setField("sagaUserId", e.target.value)}
                  placeholder="Vazio = sem vínculo no SAGA"
                  className={`${inputCls} mt-0 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setField("sagaUserId", "")}
                  disabled={saving || !draft.sagaUserId}
                  className="shrink-0 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200 hover:bg-amber-950/50 disabled:opacity-50"
                  title="Remove o vínculo com o SAGA sem apagar o aluno no SAGA"
                >
                  Limpar
                </button>
              </div>
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Ficha de matrícula</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{ENROLLMENT_FIELDS.map(renderField)}</div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Complemento e emergência</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{COMPLEMENT_FIELDS.map(renderField)}</div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Limpar o ID SAGA só remove o vínculo nesta plataforma. O cadastro no sistema SAGA não é excluído automaticamente.
      </p>
    </section>
  );
}
