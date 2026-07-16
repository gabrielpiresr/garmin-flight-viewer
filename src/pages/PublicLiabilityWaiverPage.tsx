import { useEffect, useState } from "react";
import { createPublicLiabilityWaiverContract, type PublicLiabilityWaiverForm } from "../lib/publicLiabilityWaiverDb";
import { getCachedBrandSettings, getEmailBrandSettings } from "../lib/notificationsDb";

type FieldKey = keyof PublicLiabilityWaiverForm;

const emptyForm: PublicLiabilityWaiverForm = {
  fullName: "",
  cpf: "",
  email: "",
  phone: "",
  birthDate: "",
  city: "Jundiaí",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelation: "",
  acceptedTerms: false,
};

const inputCls =
  "w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder-slate-600 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30";
const invalidCls = "border-red-500 bg-red-950/30 focus:border-red-400 focus:ring-red-500/30";

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCpfInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhoneInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

function FieldLabel({ children, required = true }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-slate-300">
      {children}
      {required ? <span className="ml-1 text-red-400">*</span> : <span className="ml-1 text-xs text-slate-600">(opcional)</span>}
    </span>
  );
}

export function PublicLiabilityWaiverPage() {
  const [brand, setBrand] = useState(() => getCachedBrandSettings());
  const [form, setForm] = useState<PublicLiabilityWaiverForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ contractId: string; createdAt: string } | null>(null);

  const logoUrl = brand?.logoDataUrl || brand?.logoUrl || "";
  const schoolName = brand?.schoolName || "EPEAC";

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

  function set<K extends FieldKey>(key: K, value: PublicLiabilityWaiverForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (submitError) setSubmitError("");
  }

  function fieldClass(key: FieldKey) {
    return `${inputCls} ${fieldErrors[key] ? invalidCls : ""}`;
  }

  function validate(): Partial<Record<FieldKey, string>> {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!form.fullName.trim()) next.fullName = "Informe o nome completo.";
    if (!isValidCpf(form.cpf)) next.cpf = "Informe um CPF válido.";
    if (!form.birthDate) next.birthDate = "Informe a data de nascimento.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Informe um e-mail válido.";
    if (onlyDigits(form.phone).length < 10) next.phone = "Informe um telefone válido.";
    if (!form.emergencyName.trim()) next.emergencyName = "Informe o contato de emergência.";
    if (onlyDigits(form.emergencyPhone).length < 10) next.emergencyPhone = "Informe um telefone válido.";
    if (!form.acceptedTerms) next.acceptedTerms = "O aceite do termo é obrigatório.";
    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validate();
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setSubmitError("Revise os campos destacados antes de enviar.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await createPublicLiabilityWaiverContract(form);
      setCreated(result);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível enviar o termo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-800/50 bg-slate-900 p-8 text-center shadow-2xl">
          {logoUrl ? <img src={logoUrl} alt={schoolName} className="mx-auto mb-5 h-16 w-auto object-contain" /> : null}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-900/40 text-2xl text-emerald-300">
            ✓
          </div>
          <h1 className="text-xl font-semibold text-white">Termo recebido</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Seu termo foi aceito digitalmente e enviado para a escola.
          </p>
          <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-500">
            Protocolo: {created.contractId.slice(-8).toUpperCase()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          {logoUrl ? <img src={logoUrl} alt={schoolName} className="mx-auto mb-4 h-16 w-auto object-contain" /> : null}
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-400">{schoolName}</p>
          <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">Termo de Isenção de Responsabilidade</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Preencha seus dados para registrar o aceite digital do termo antes do voo.
          </p>
        </header>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl sm:p-6">
          <section>
            <h2 className="mb-4 text-base font-semibold text-white">Dados do ocupante</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <FieldLabel>Nome completo</FieldLabel>
                <input value={form.fullName} onChange={(event) => set("fullName", event.target.value)} className={fieldClass("fullName")} autoComplete="name" />
                {fieldErrors.fullName ? <p className="mt-1 text-xs text-red-400">{fieldErrors.fullName}</p> : null}
              </label>
              <label>
                <FieldLabel>CPF</FieldLabel>
                <input value={form.cpf} onChange={(event) => set("cpf", formatCpfInput(event.target.value))} className={fieldClass("cpf")} inputMode="numeric" placeholder="000.000.000-00" />
                {fieldErrors.cpf ? <p className="mt-1 text-xs text-red-400">{fieldErrors.cpf}</p> : null}
              </label>
              <label>
                <FieldLabel>Data de nascimento</FieldLabel>
                <input type="date" value={form.birthDate} onChange={(event) => set("birthDate", event.target.value)} className={fieldClass("birthDate")} />
                {fieldErrors.birthDate ? <p className="mt-1 text-xs text-red-400">{fieldErrors.birthDate}</p> : null}
              </label>
              <label>
                <FieldLabel>E-mail</FieldLabel>
                <input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} className={fieldClass("email")} autoComplete="email" />
                {fieldErrors.email ? <p className="mt-1 text-xs text-red-400">{fieldErrors.email}</p> : null}
              </label>
              <label>
                <FieldLabel>Telefone</FieldLabel>
                <input value={form.phone} onChange={(event) => set("phone", formatPhoneInput(event.target.value))} className={fieldClass("phone")} inputMode="tel" placeholder="(11) 99999-9999" />
                {fieldErrors.phone ? <p className="mt-1 text-xs text-red-400">{fieldErrors.phone}</p> : null}
              </label>
              <label className="sm:col-span-2">
                <FieldLabel required={false}>Cidade da assinatura</FieldLabel>
                <input value={form.city} onChange={(event) => set("city", event.target.value)} className={fieldClass("city")} />
              </label>
            </div>
          </section>

          <section className="border-t border-slate-800 pt-6">
            <h2 className="mb-4 text-base font-semibold text-white">Contato de emergência</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <FieldLabel>Nome do contato</FieldLabel>
                <input value={form.emergencyName} onChange={(event) => set("emergencyName", event.target.value)} className={fieldClass("emergencyName")} />
                {fieldErrors.emergencyName ? <p className="mt-1 text-xs text-red-400">{fieldErrors.emergencyName}</p> : null}
              </label>
              <label>
                <FieldLabel>Telefone do contato</FieldLabel>
                <input value={form.emergencyPhone} onChange={(event) => set("emergencyPhone", formatPhoneInput(event.target.value))} className={fieldClass("emergencyPhone")} inputMode="tel" placeholder="(11) 99999-9999" />
                {fieldErrors.emergencyPhone ? <p className="mt-1 text-xs text-red-400">{fieldErrors.emergencyPhone}</p> : null}
              </label>
              <label className="sm:col-span-2">
                <FieldLabel required={false}>Parentesco ou referência</FieldLabel>
                <input value={form.emergencyRelation} onChange={(event) => set("emergencyRelation", event.target.value)} className={fieldClass("emergencyRelation")} placeholder="Ex.: pai, mãe, cônjuge, amigo" />
              </label>
            </div>
          </section>

          <section className="border-t border-slate-800 pt-6">
            <h2 className="mb-3 text-base font-semibold text-white">Termo de aceite</h2>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm leading-6 text-slate-300">
              <p className="font-semibold text-slate-100">Advertência</p>
              <p className="mt-2">
                O voo, bem como todas as demais atividades a ele relacionadas, é perigoso e há riscos envolvidos na sua participação. Mesmo com a observância das recomendações de segurança, existe chance de danos graves ou acidente fatal.
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5">
                <li>Declaro ter recebido as informações a respeito e ter pleno conhecimento do significado do voo.</li>
                <li>Declaro conhecer a natureza, finalidade e risco da prática do voo, decidindo realizá-la voluntariamente.</li>
                <li>Isento a EPEAC, seus dirigentes, funcionários, representantes, instrutores e prepostos de responsabilidade por danos materiais, pessoais, morais, à imagem ou de qualquer outra espécie.</li>
                <li>Estou ciente de que, caso o voo não ocorra por meteorologia, manutenção não programada ou outros motivos, ele será cancelado e reagendado, exceto em caso de desistência do ocupante.</li>
                <li>Responsabilizo-me por danos que, por minha ação ou omissão, venham a ser causados à escola.</li>
                <li>Declaro gozar de bom estado geral de saúde e não estar sob efeito de drogas ou álcool.</li>
                <li>Fotos e vídeos dependem de autorização prévia do instrutor e do aluno em comando da aeronave.</li>
              </ol>
            </div>
            <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${fieldErrors.acceptedTerms ? "border-red-500 bg-red-950/30" : "border-slate-800 bg-slate-950/60"}`}>
              <input
                type="checkbox"
                checked={form.acceptedTerms}
                onChange={(event) => set("acceptedTerms", event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-sky-500"
              />
              <span className="text-sm leading-6 text-slate-300">
                Li, compreendi e concordo integralmente com o termo de isenção de responsabilidade. Confirmo que este aceite vale como minha assinatura digital.
              </span>
            </label>
            {fieldErrors.acceptedTerms ? <p className="mt-1 text-xs text-red-400">{fieldErrors.acceptedTerms}</p> : null}
          </section>

          {submitError ? (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">{submitError}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Gerando termo..." : "Aceitar e gerar termo"}
          </button>
        </form>
      </div>
    </div>
  );
}
