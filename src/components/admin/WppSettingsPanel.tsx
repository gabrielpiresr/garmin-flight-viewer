import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createWppTemplate,
  deleteWppTemplate,
  getWppSettings,
  listWppTemplates,
  saveWppSettings,
  sendWppTemplateTest,
  testWppConnection,
  updateWppTemplate,
} from "../../lib/wppDb";
import type {
  WppConnectionInput,
  WppConnectionSettings,
  WppTemplate,
  WppTemplateCategory,
  WppTemplateInput,
} from "../../types/wpp";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const inputClass = "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const secondaryButton = "rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50";

const EMPTY_CONNECTION: WppConnectionInput = {
  wabaId: "",
  phoneNumberId: "",
  graphApiVersion: "v23.0",
  apiKey: "",
};

const EMPTY_TEMPLATE: WppTemplateInput = {
  name: "",
  category: "UTILITY",
  language: "pt_BR",
  headerText: "",
  bodyText: "",
  footerText: "",
};

function connectionForm(settings: WppConnectionSettings): WppConnectionInput {
  return {
    wabaId: settings.wabaId,
    phoneNumberId: settings.phoneNumberId,
    graphApiVersion: settings.graphApiVersion || "v23.0",
    apiKey: "",
  };
}

function componentText(template: WppTemplate, type: string): string {
  return template.components.find((component) => component.type.toUpperCase() === type)?.text ?? "";
}

function toTemplateInput(template: WppTemplate): WppTemplateInput {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    language: template.language,
    headerText: componentText(template, "HEADER"),
    bodyText: componentText(template, "BODY"),
    footerText: componentText(template, "FOOTER"),
    buttons: template.components.find((component) => component.type.toUpperCase() === "BUTTONS")?.buttons ?? [],
  };
}

function variableCount(text: string): number {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function statusStyle(status: string): string {
  if (status === "APPROVED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "REJECTED" || status === "PAUSED" || status === "DISABLED") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function statusLabel(status: string): string {
  return ({ APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Rejeitado", PAUSED: "Pausado", DISABLED: "Desativado" } as Record<string, string>)[status] ?? status;
}

function ModalShell({ title, subtitle, onClose, children, size = "max-w-2xl" }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; size?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`my-6 w-full ${size} overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-6">
          <div><h2 className="font-semibold text-slate-100">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TemplateEditorModal({ template, onClose, onSaved }: { template: WppTemplate | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [form, setForm] = useState<WppTemplateInput>(() => template ? toTemplateInput(template) : EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(template);

  async function save() {
    if (!form.name.trim() || !form.bodyText.trim()) {
      showToast({ variant: "warning", message: "Informe o nome e o conteúdo da mensagem." });
      return;
    }
    if (!/^[a-z0-9_]+$/.test(form.name)) {
      showToast({ variant: "warning", message: "O nome deve usar apenas letras minúsculas, números e underline." });
      return;
    }
    setSaving(true);
    try {
      if (isEditing) await updateWppTemplate(form);
      else await createWppTemplate(form);
      showToast({ variant: "success", message: isEditing ? "Template enviado para atualização." : "Template enviado para aprovação." });
      onSaved();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Não foi possível salvar o template." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={isEditing ? "Editar template" : "Novo template"} subtitle="As alterações são enviadas para análise da Meta e podem levar alguns minutos para aparecer." onClose={onClose}>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <label className="text-xs font-medium text-slate-400">Nome do template
          <input value={form.name} disabled={isEditing} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="lembrete_de_voo" className={inputClass} />
          <span className="mt-1 block font-normal text-slate-600">Somente minúsculas, números e _</span>
        </label>
        <label className="text-xs font-medium text-slate-400">Idioma
          <select value={form.language} disabled={isEditing} onChange={(e) => setForm((current) => ({ ...current, language: e.target.value }))} className={inputClass}>
            <option value="pt_BR">Português (Brasil)</option><option value="en_US">Inglês (EUA)</option><option value="es">Espanhol</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-400 sm:col-span-2">Categoria
          <select value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value as WppTemplateCategory }))} className={inputClass}>
            <option value="UTILITY">Utilidade</option><option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Autenticação</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-400 sm:col-span-2">Cabeçalho <span className="font-normal text-slate-600">(opcional)</span>
          <input value={form.headerText} maxLength={60} onChange={(e) => setForm((current) => ({ ...current, headerText: e.target.value }))} placeholder="Seu próximo voo" className={inputClass} />
        </label>
        <label className="text-xs font-medium text-slate-400 sm:col-span-2">Mensagem
          <textarea value={form.bodyText} rows={6} maxLength={1024} onChange={(e) => setForm((current) => ({ ...current, bodyText: e.target.value }))} placeholder="Olá, {{1}}! Seu voo está confirmado para {{2}}." className={`${inputClass} resize-y leading-6`} />
          <span className="mt-1 block font-normal text-slate-600">Use {"{{1}}"}, {"{{2}}"}... para dados variáveis. {form.bodyText.length}/1024</span>
        </label>
        <label className="text-xs font-medium text-slate-400 sm:col-span-2">Rodapé <span className="font-normal text-slate-600">(opcional)</span>
          <input value={form.footerText} maxLength={60} onChange={(e) => setForm((current) => ({ ...current, footerText: e.target.value }))} placeholder="Equipe de operações" className={inputClass} />
        </label>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4 sm:px-6"><button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button><button type="button" onClick={() => void save()} disabled={saving} className={primaryButton}>{saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar template"}</button></div>
    </ModalShell>
  );
}

function TestTemplateModal({ template, onClose }: { template: WppTemplate; onClose: () => void }) {
  const { showToast } = useToast();
  const headerCount = variableCount(componentText(template, "HEADER"));
  const count = variableCount(componentText(template, "BODY"));
  const [phone, setPhone] = useState("");
  const [headerValues, setHeaderValues] = useState<string[]>(() => Array.from({ length: headerCount }, () => ""));
  const [values, setValues] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const [sending, setSending] = useState(false);

  async function send() {
    if (phone.replace(/\D/g, "").length < 10) {
      showToast({ variant: "warning", message: "Informe o telefone com DDI e DDD." });
      return;
    }
    if ([...headerValues, ...values].some((value) => !value.trim())) {
      showToast({ variant: "warning", message: "Preencha todos os valores do template." });
      return;
    }
    setSending(true);
    try {
      await sendWppTemplateTest({ templateName: template.name, language: template.language, to: phone, headerParameters: headerValues, bodyParameters: values });
      showToast({ variant: "success", message: "Template de teste enviado para o WhatsApp informado." });
      onClose();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao enviar o teste." });
    } finally { setSending(false); }
  }

  return (
    <ModalShell title="Disparar template de teste" subtitle={`Template: ${template.name}`} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-6">
        <label className="block text-xs font-medium text-slate-400">WhatsApp de destino
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5511999999999" inputMode="tel" className={inputClass} />
          <span className="mt-1 block font-normal text-slate-600">Inclua o código do país. Ex.: 55 para Brasil.</span>
        </label>
        {headerValues.map((value, index) => <label key={`header-${index}`} className="block text-xs font-medium text-slate-400">Cabeçalho {`{{${index + 1}}}`}
          <input value={value} onChange={(e) => setHeaderValues((current) => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))} placeholder={`Exemplo do cabeçalho ${index + 1}`} className={inputClass} />
        </label>)}
        {values.map((value, index) => <label key={index} className="block text-xs font-medium text-slate-400">Valor de {`{{${index + 1}}}`}
          <input value={value} onChange={(e) => setValues((current) => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))} placeholder={`Exemplo para a variável ${index + 1}`} className={inputClass} />
        </label>)}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prévia</p><p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{componentText(template, "BODY") || "Sem conteúdo"}</p></div>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4 sm:px-6"><button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button><button type="button" onClick={() => void send()} disabled={sending || template.status !== "APPROVED"} className={primaryButton}>{sending ? "Enviando..." : "Enviar teste"}</button></div>
    </ModalShell>
  );
}

export function WppSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<WppConnectionSettings | null>(null);
  const [form, setForm] = useState<WppConnectionInput>(EMPTY_CONNECTION);
  const [templates, setTemplates] = useState<WppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [search, setSearch] = useState("");
  const [editorTemplate, setEditorTemplate] = useState<WppTemplate | "new" | null>(null);
  const [testTemplate, setTestTemplate] = useState<WppTemplate | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<WppTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try { setTemplates(await listWppTemplates()); }
    catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar templates." }); }
    finally { setLoadingTemplates(false); }
  }, [showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getWppSettings();
      setSettings(next); setForm(connectionForm(next));
      if (next.apiKeyConfigured && next.wabaId) await loadTemplates();
    } catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar integração." }); }
    finally { setLoading(false); }
  }, [loadTemplates, showToast]);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    if (!form.wabaId.trim() || !form.phoneNumberId.trim() || (!form.apiKey.trim() && !settings?.apiKeyConfigured)) {
      showToast({ variant: "warning", message: "Preencha o WABA ID, Phone Number ID e token de acesso." }); return;
    }
    setSaving(true);
    try {
      await saveWppSettings(form);
      const tested = await testWppConnection();
      setSettings(tested); setForm(connectionForm(tested));
      showToast({ variant: "success", message: "Conta do WhatsApp conectada com sucesso." });
      await loadTemplates();
    } catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Não foi possível conectar a conta." }); }
    finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true);
    try { const next = await testWppConnection(); setSettings(next); showToast({ variant: "success", message: "Conexão funcionando normalmente." }); }
    catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha no teste de conexão." }); }
    finally { setTesting(false); }
  }

  async function removeTemplate() {
    if (!deleteTemplate) return;
    setDeleting(true);
    try { await deleteWppTemplate(deleteTemplate.name); showToast({ variant: "success", message: "Template excluído." }); setDeleteTemplate(null); await loadTemplates(); }
    catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao excluir template." }); }
    finally { setDeleting(false); }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? templates.filter((template) => `${template.name} ${template.category} ${template.status}`.toLowerCase().includes(query)) : templates;
  }, [search, templates]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>;
  const connected = settings?.connectionStatus === "connected";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400"><svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><path d="M12.04 2a9.84 9.84 0 00-8.46 14.86L2 22l5.28-1.55A9.98 9.98 0 1012.04 2zm5.77 13.78c-.25.7-1.46 1.34-2.02 1.42-.52.08-1.18.11-1.9-.12-.44-.14-1-.33-1.73-.64-3.04-1.31-5.02-4.37-5.17-4.57-.14-.2-1.23-1.64-1.23-3.12 0-1.49.77-2.22 1.05-2.52.27-.3.6-.37.8-.37h.57c.18 0 .43-.07.67.51.25.6.84 2.05.91 2.2.08.15.13.33.03.53-.1.2-.15.33-.3.51-.15.17-.32.38-.45.51-.15.15-.3.31-.13.61.18.3.78 1.28 1.67 2.07 1.15 1.02 2.11 1.33 2.41 1.48.3.15.48.13.65-.07.18-.2.75-.87.95-1.17.2-.3.4-.25.68-.15.27.1 1.75.83 2.05.98.3.15.5.22.57.35.08.12.08.72-.17 1.42z" /></svg></span><div><h2 className="font-semibold text-slate-100">WhatsApp Business API</h2><p className="mt-1 text-sm text-slate-500">Conecte sua conta Meta para gerenciar e testar templates.</p></div></div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : settings?.connectionStatus === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-slate-700 bg-slate-800 text-slate-400"}`}><span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : settings?.connectionStatus === "error" ? "bg-red-400" : "bg-slate-500"}`} />{connected ? "Conectado" : settings?.connectionStatus === "error" ? "Conexão com erro" : "Não testado"}</span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <label className="text-xs font-medium text-slate-400">WABA ID <span className="font-normal text-slate-600">(WhatsApp Business Account)</span><input value={form.wabaId} onChange={(e) => setForm((current) => ({ ...current, wabaId: e.target.value }))} placeholder="123456789012345" className={inputClass} /><span className="mt-1 block font-normal leading-5 text-slate-600">Na Meta Business Suite: Configurações (engrenagem) → Contas → Contas do WhatsApp. Selecione a conta e copie o ID do painel lateral. Não use o App ID.</span><a href="https://business.facebook.com/settings/whatsapp-business-accounts" target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 font-semibold text-emerald-400 transition hover:text-emerald-300">Abrir Contas do WhatsApp na Meta <span aria-hidden="true">↗</span></a></label>
          <label className="text-xs font-medium text-slate-400">Phone Number ID<input value={form.phoneNumberId} onChange={(e) => setForm((current) => ({ ...current, phoneNumberId: e.target.value }))} placeholder="123456789012345" className={inputClass} /></label>
          <label className="text-xs font-medium text-slate-400">API Key / token de acesso<input type="password" autoComplete="new-password" value={form.apiKey} onChange={(e) => setForm((current) => ({ ...current, apiKey: e.target.value }))} placeholder={settings?.apiKeyConfigured ? "Token já configurado — deixe vazio para manter" : "EAAB..."} className={inputClass} /></label>
          <label className="text-xs font-medium text-slate-400">Versão da Graph API<input value={form.graphApiVersion} onChange={(e) => setForm((current) => ({ ...current, graphApiVersion: e.target.value }))} placeholder="v23.0" className={inputClass} /></label>
        </div>
        {settings?.lastError ? <div className="mx-5 mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300 sm:mx-6">{settings.lastError}</div> : null}
        {connected ? <div className="mx-5 mb-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs sm:mx-6 sm:grid-cols-3"><div><span className="block text-slate-600">Conta</span><strong className="mt-1 block text-slate-300">{settings.businessName || "Conta Meta"}</strong></div><div><span className="block text-slate-600">Número verificado</span><strong className="mt-1 block text-slate-300">{settings.displayPhoneNumber || settings.verifiedName || "Conectado"}</strong></div><div><span className="block text-slate-600">Último teste</span><strong className="mt-1 block text-slate-300">{settings.lastTestAt ? new Date(settings.lastTestAt).toLocaleString("pt-BR") : "Agora"}</strong></div></div> : null}
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 px-5 py-4 sm:px-6"><button type="button" onClick={() => void testConnection()} disabled={testing || !settings?.apiKeyConfigured} className={secondaryButton}>{testing ? "Testando..." : "Testar conexão"}</button><button type="button" onClick={() => void connect()} disabled={saving} className={primaryButton}>{saving ? "Conectando..." : connected ? "Salvar e reconectar" : "Conectar conta"}</button></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 className="font-semibold text-slate-100">Templates da conta</h2><p className="mt-1 text-sm text-slate-500">{templates.length} {templates.length === 1 ? "template sincronizado" : "templates sincronizados"} com a Meta.</p></div><div className="flex gap-2"><button type="button" onClick={() => void loadTemplates()} disabled={loadingTemplates || !settings?.apiKeyConfigured} className={secondaryButton}>{loadingTemplates ? "Atualizando..." : "Atualizar"}</button><button type="button" onClick={() => setEditorTemplate("new")} disabled={!connected} className={primaryButton}>+ Novo template</button></div></div>
        <div className="p-5 sm:p-6"><div className="relative mb-5"><svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"><path fillRule="evenodd" d="M9 3a6 6 0 104.472 10.002l3.763 3.763a.75.75 0 101.06-1.06l-3.763-3.763A6 6 0 009 3zM4.5 9a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z" clipRule="evenodd" /></svg><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, categoria ou status..." className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500" /></div>
          {!connected ? <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-slate-500"><svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M8 4a4 4 0 117.446 2.032l2.261 2.26a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-.707.293H7v-2H5v-2H3.5a1 1 0 01-.707-1.707l5.175-5.175A4 4 0 018 4zm4-1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" clipRule="evenodd" /></svg></span><p className="mt-4 text-sm font-medium text-slate-300">Conecte sua conta para carregar os templates</p><p className="mt-1 text-xs text-slate-600">Suas credenciais ficam protegidas na função administrativa do Appwrite.</p></div></div> : loadingTemplates ? <div className="space-y-3"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div> : filtered.length === 0 ? <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-slate-800 text-center"><div><p className="text-sm font-medium text-slate-400">{search ? "Nenhum template encontrado" : "Nenhum template nesta conta"}</p><p className="mt-1 text-xs text-slate-600">{search ? "Tente buscar por outro termo." : "Crie o primeiro template para começar."}</p></div></div> : <div className="space-y-3">{filtered.map((template) => <article key={`${template.id}-${template.language}`} className="group rounded-xl border border-slate-800 bg-slate-950/40 p-4 transition hover:border-slate-700"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-mono text-sm font-semibold text-slate-200">{template.name}</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle(template.status)}`}>{statusLabel(template.status)}</span></div><p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{componentText(template, "BODY") || "Template sem corpo de mensagem"}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-wide text-slate-600"><span>{template.category}</span><span>{template.language}</span>{template.qualityScore ? <span>Qualidade: {template.qualityScore}</span> : null}</div></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => setTestTemplate(template)} disabled={template.status !== "APPROVED"} title={template.status !== "APPROVED" ? "Apenas templates aprovados podem ser enviados" : "Enviar teste"} className="rounded-lg border border-emerald-700/40 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-35">Testar</button><button type="button" onClick={() => setEditorTemplate(template)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800">Editar</button><button type="button" onClick={() => setDeleteTemplate(template)} className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10">Excluir</button></div></div></article>)}</div>}
        </div>
      </section>

      {editorTemplate ? <TemplateEditorModal template={editorTemplate === "new" ? null : editorTemplate} onClose={() => setEditorTemplate(null)} onSaved={() => { setEditorTemplate(null); void loadTemplates(); }} /> : null}
      {testTemplate ? <TestTemplateModal template={testTemplate} onClose={() => setTestTemplate(null)} /> : null}
      {deleteTemplate ? <ModalShell title="Excluir template?" subtitle="Essa ação remove o template da conta Meta e não pode ser desfeita." onClose={() => setDeleteTemplate(null)} size="max-w-md"><div className="p-6"><p className="text-sm text-slate-300">O template <strong className="font-mono text-white">{deleteTemplate.name}</strong> será excluído permanentemente.</p></div><div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4"><button type="button" onClick={() => setDeleteTemplate(null)} className={secondaryButton}>Cancelar</button><button type="button" onClick={() => void removeTemplate()} disabled={deleting} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir template"}</button></div></ModalShell> : null}
    </div>
  );
}
