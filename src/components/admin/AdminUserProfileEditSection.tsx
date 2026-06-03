import { useEffect, useState } from "react";
import type { AdminUserDetail } from "../../types/adminUsers";
import type { AdminUserProfileUpdateInput } from "../../lib/adminUsersDb";

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
};

function detailToDraft(detail: AdminUserDetail): ProfileDraft {
  return {
    fullName: detail.profile.fullName || detail.name || "",
    nickname: detail.profile.nickname || "",
    email: detail.email || "",
    cpf: detail.profile.cpf || "",
    phone: detail.profile.phone || "",
    birthDate: detail.profile.birthDate?.slice(0, 10) || "",
    anacCode: detail.profile.anacCode || "",
    sagaUserId: detail.profile.sagaUserId || "",
    weightKg: detail.profile.weightKg != null ? String(detail.profile.weightKg) : "",
    heightCm: detail.profile.heightCm != null ? String(detail.profile.heightCm) : "",
  };
}

function draftToPayload(draft: ProfileDraft): AdminUserProfileUpdateInput {
  const weight = draft.weightKg.trim() ? Number(draft.weightKg) : null;
  const height = draft.heightCm.trim() ? Number(draft.heightCm) : null;
  return {
    fullName: draft.fullName.trim(),
    nickname: draft.nickname.trim(),
    email: draft.email.trim(),
    cpf: draft.cpf.trim(),
    phone: draft.phone.trim(),
    birthDate: draft.birthDate.trim(),
    anacCode: draft.anacCode.trim(),
    sagaUserId: draft.sagaUserId.trim(),
    weightKg: Number.isFinite(weight) && weight! > 0 ? weight : null,
    heightCm: Number.isFinite(height) && height! > 0 ? height : null,
  };
}

function draftsEqual(a: ProfileDraft, b: ProfileDraft): boolean {
  return (
    a.fullName === b.fullName &&
    a.nickname === b.nickname &&
    a.email === b.email &&
    a.cpf === b.cpf &&
    a.phone === b.phone &&
    a.birthDate === b.birthDate &&
    a.anacCode === b.anacCode &&
    a.sagaUserId === b.sagaUserId &&
    a.weightKg === b.weightKg &&
    a.heightCm === b.heightCm
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none";

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
  }, [detail.userId, detail.profile.docId, detail.profile.sagaUserId, detail.profile.anacCode, detail.profile.nickname]);

  const dirty = !draftsEqual(draft, baseline);

  function setField<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleCancel() {
    setDraft(baseline);
    setEditing(false);
  }

  function handleSave() {
    onSave(draftToPayload(draft));
  }

  if (!editing) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500">Dados cadastrais do perfil (Appwrite + SAGA).</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
        >
          Editar dados principais
        </button>
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-cyan-800/40 bg-cyan-950/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/90">Editar dados principais</p>
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs text-slate-500">
          Nome completo
          <input type="text" value={draft.fullName} onChange={(e) => setField("fullName", e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs text-slate-500">
          Nickname (SAGA)
          <input
            type="text"
            value={draft.nickname}
            onChange={(e) => setField("nickname", e.target.value)}
            placeholder="Apelido no SAGA"
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-slate-500">
          E-mail (login)
          <input type="email" value={draft.email} onChange={(e) => setField("email", e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs text-slate-500">
          CPF
          <input type="text" value={draft.cpf} onChange={(e) => setField("cpf", e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs text-slate-500">
          Telefone
          <input type="text" value={draft.phone} onChange={(e) => setField("phone", e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs text-slate-500">
          Data de nascimento
          <input type="date" value={draft.birthDate} onChange={(e) => setField("birthDate", e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs text-slate-500">
          Código ANAC
          <input type="text" value={draft.anacCode} onChange={(e) => setField("anacCode", e.target.value)} className={inputCls} />
        </label>
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
        <label className="block text-xs text-slate-500">
          Peso (kg)
          <input
            type="number"
            min={0}
            step={0.1}
            value={draft.weightKg}
            onChange={(e) => setField("weightKg", e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-slate-500">
          Altura (cm)
          <input
            type="number"
            min={0}
            step={1}
            value={draft.heightCm}
            onChange={(e) => setField("heightCm", e.target.value)}
            className={inputCls}
          />
        </label>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        Limpar o ID SAGA só remove o vínculo nesta plataforma. O cadastro no sistema SAGA não é excluído automaticamente.
      </p>
    </section>
  );
}
