import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createWppTemplate,
  deleteWppTemplate,
  getWppSettings,
  listWppDeliveryStatuses,
  listWppTemplates,
  saveWppBotSettings,
  saveWppSettings,
  saveWppNotificationTemplates,
  sendWppTemplateTest,
  testWppConnection,
  updateWppTemplate,
} from "../../lib/wppDb";
import { ensureSoloFlightWppTemplates } from "../../lib/soloFlightDb";
import type {
  WppConnectionInput,
  WppConnectionSettings,
  WppDeliveryStatus,
  WppFlightReviewReadyTemplateSettings,
  WppIncomingActionType,
  WppIncomingAutoReplyRule,
  WppIncomingAutoReplySettings,
  WppIncomingReplyButton,
  WppTemplate,
  WppTemplateCategory,
  WppTemplateInput,
  WppTransactionalTemplateSettings,
  WppTomorrowFlightReminderTemplateSettings,
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

const DEFAULT_FLIGHT_REVIEW_TEMPLATE: WppFlightReviewReadyTemplateSettings = {
  enabled: true,
  templateName: "attvoo_2",
  language: "pt_BR",
};

const DEFAULT_TOMORROW_FLIGHT_REMINDER_TEMPLATE: WppTomorrowFlightReminderTemplateSettings = {
  enabled: false,
  templateName: "lembrete_voo_amanha",
  language: "pt_BR",
  sendHour: 19,
  bodyParameters: ["student_name", "flight_date", "start_time", "aircraft", "mission", "instructor"],
};

const DEFAULT_PAYMENT_RECEIVED_TEMPLATE: WppTransactionalTemplateSettings = {
  enabled: true,
  templateName: "pagamento_recebido_cakto",
  language: "pt_BR",
  bodyParameters: ["student_name", "product", "amount", "payment_method", "booking_url"],
};

const DEFAULT_BOOKING_REQUESTED_TEMPLATE: WppTransactionalTemplateSettings = {
  enabled: true,
  templateName: "solicitacao_agendamento_voo",
  language: "pt_BR",
  bodyParameters: ["student_name", "flight_date", "start_time", "aircraft", "duration", "status"],
};

const DEFAULT_SOLO_FLIGHT_APPROVAL_TEMPLATE: WppTransactionalTemplateSettings = {
  enabled: true,
  templateName: "voo_solo_aprovacao",
  language: "pt_BR",
  bodyParameters: ["student_name", "flight_date", "route", "flags_summary", "request_id"],
};

const DEFAULT_SOLO_FLIGHT_AWARENESS_TEMPLATE: WppTransactionalTemplateSettings = {
  enabled: true,
  templateName: "voo_solo_ciencia",
  language: "pt_BR",
  bodyParameters: ["student_name", "flight_date", "route", "status", "request_id"],
};

const DEFAULT_INCOMING_AUTO_REPLY_MESSAGE =
  "Oi{{nickname_suffix}}! Este bot envia mensagens automaticas e tambem responde alguns pedidos por este canal.";

const DEFAULT_INCOMING_AUTO_REPLY: WppIncomingAutoReplySettings = {
  enabled: true,
  matchingMode: "content",
  message: DEFAULT_INCOMING_AUTO_REPLY_MESSAGE,
  buttons: [],
  actions: [],
  rules: [],
  verifyToken: "",
  webhookUrl: "",
};

const WPP_BOT_ACTION_LABEL: Record<WppIncomingActionType, string> = {
  send_last_flight_stickers: "Enviar figurinhas do \u00faltimo voo",
  send_next_mission_details: "Enviar detalhes da pr\u00f3xima miss\u00e3o",
  send_student_credit_balance: "Enviar saldo de cr\u00e9ditos",
  send_next_scheduled_flights: "Enviar pr\u00f3ximos voos agendados",
  send_flight_credit_purchase_options: "Enviar op\u00e7\u00f5es de compra de horas",
  send_flight_credit_custom_purchase_link: "Enviar link de compra personalizada",
  create_flight_credit_checkout: "Gerar checkout Cakto de horas",
  start_flight_booking: "Iniciar agendamento de voo",
};

type WppSettingsSection = "bot" | "connection" | "notifications" | "templates" | "deliveries";

const WPP_SETTING_SECTIONS: Array<{
  id: WppSettingsSection;
  title: string;
  description: string;
}> = [
  { id: "bot", title: "Bot de entrada", description: "Gatilhos e respostas" },
  { id: "connection", title: "Conex\u00e3o Meta", description: "Conta e token" },
  { id: "notifications", title: "Automa\u00e7\u00f5es", description: "Templates usados" },
  { id: "templates", title: "Templates", description: "Biblioteca Meta" },
  { id: "deliveries", title: "Entregas", description: "Status da Meta" },
];

function deliveryStatusLabel(status: string): string {
  switch (String(status || "").toLowerCase()) {
    case "accepted":
      return "Aceito pela Meta";
    case "sent":
      return "Enviado à operadora";
    case "delivered":
      return "Entregue";
    case "read":
      return "Lido";
    case "failed":
      return "Falhou";
    case "deleted":
      return "Apagado";
    default:
      return status || "Desconhecido";
  }
}

function deliveryStatusStyle(status: string): string {
  switch (String(status || "").toLowerCase()) {
    case "delivered":
    case "read":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "sent":
    case "accepted":
      return "border-sky-500/40 bg-sky-500/10 text-sky-300";
    case "failed":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    default:
      return "border-slate-700 bg-slate-900 text-slate-400";
  }
}

function formatDeliveryWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

const WPP_MAX_REPLY_BUTTONS = 10;

const WPP_QUICK_RULES: WppIncomingAutoReplyRule[] = [
  {
    id: "ver_figurinhas",
    name: "Ver figurinhas",
    enabled: true,
    operator: "equals",
    matchValue: "Ver figurinhas",
    message: "Claro{{nickname_suffix}}! Vou buscar as figurinhas do seu \u00faltimo voo.",
    buttons: [],
    actions: ["send_last_flight_stickers"],
  },
  {
    id: "proxima_missao",
    name: "Próxima missão",
    enabled: true,
    operator: "equals",
    matchValue: "Pr\u00f3xima miss\u00e3o",
    message: "Claro{{nickname_suffix}}. Vou buscar os detalhes da sua próxima missão.",
    buttons: [],
    actions: ["send_next_mission_details"],
  },
  {
    id: "ver_proxima_missao",
    name: "Ver pr\u00f3xima miss\u00e3o",
    enabled: true,
    operator: "equals",
    matchValue: "Ver pr\u00f3xima miss\u00e3o",
    message: "Claro{{nickname_suffix}}. Vou buscar os detalhes da sua pr\u00f3xima miss\u00e3o.",
    buttons: [],
    actions: ["send_next_mission_details"],
  },
  {
    id: "saldo_creditos",
    name: "Saldo de créditos",
    enabled: true,
    operator: "equals",
    matchValue: "Saldo de créditos",
    message: "Claro{{nickname_suffix}}. Vou consultar seu saldo de créditos.",
    buttons: [],
    actions: ["send_student_credit_balance"],
  },
  {
    id: "proximos_voos",
    name: "Próximos voos",
    enabled: true,
    operator: "equals",
    matchValue: "Próximos voos",
    message: "Claro{{nickname_suffix}}. Vou buscar seus próximos voos agendados.",
    buttons: [],
    actions: ["send_next_scheduled_flights"],
  },
  {
    id: "agendar_voo",
    name: "Agendar voo",
    enabled: true,
    operator: "equals",
    matchValue: "Agendar voo",
    message: "",
    buttons: [],
    actions: ["start_flight_booking"],
  },
  {
    id: "comprar_horas",
    name: "Comprar horas",
    enabled: true,
    operator: "equals",
    matchValue: "Comprar horas",
    message: "Claro{{nickname_suffix}}. Vou te mostrar as opções para comprar mais horas de voo.",
    buttons: [],
    actions: ["send_flight_credit_purchase_options"],
  },
  {
    id: "comprar_1h",
    name: "Comprar 1h",
    enabled: true,
    operator: "equals",
    matchValue: "Comprar 1h",
    message: "Claro{{nickname_suffix}}. Vou gerar o checkout seguro para 1h de voo.",
    buttons: [],
    actions: ["create_flight_credit_checkout"],
  },
  {
    id: "comprar_10h",
    name: "Comprar 10h",
    enabled: true,
    operator: "equals",
    matchValue: "Comprar 10h",
    message: "Claro{{nickname_suffix}}. Vou gerar o checkout seguro para 10h de voo.",
    buttons: [],
    actions: ["create_flight_credit_checkout"],
  },
  {
    id: "comprar_20h",
    name: "Comprar 20h",
    enabled: true,
    operator: "equals",
    matchValue: "Comprar 20h",
    message: "Claro{{nickname_suffix}}. Vou gerar o checkout seguro para 20h de voo.",
    buttons: [],
    actions: ["create_flight_credit_checkout"],
  },
  {
    id: "comprar_40h",
    name: "Comprar 40h",
    enabled: true,
    operator: "equals",
    matchValue: "Comprar 40h",
    message: "Claro{{nickname_suffix}}. Vou gerar o checkout seguro para 40h de voo.",
    buttons: [],
    actions: ["create_flight_credit_checkout"],
  },
  {
    id: "comprar_personalizada",
    name: "Personalizada",
    enabled: true,
    operator: "equals",
    matchValue: "Personalizada",
    message: "Claro{{nickname_suffix}}. Vou abrir a compra personalizada na plataforma.",
    buttons: [],
    actions: ["send_flight_credit_custom_purchase_link"],
  },
];

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

function makeWppVerifyToken(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `wpp_${random}`;
}

function incomingAutoReplyForm(settings: WppConnectionSettings): WppIncomingAutoReplySettings {
  const saved = settings.incomingAutoReply ?? DEFAULT_INCOMING_AUTO_REPLY;
  return {
    enabled: saved.enabled !== false,
    matchingMode: saved.matchingMode === "id" ? "id" : "content",
    message: saved.message || DEFAULT_INCOMING_AUTO_REPLY_MESSAGE,
    buttons: Array.isArray(saved.buttons) ? saved.buttons : [],
    actions: Array.isArray(saved.actions) ? saved.actions : [],
    rules: Array.isArray(saved.rules) ? saved.rules : [],
    verifyToken: saved.verifyToken || makeWppVerifyToken(),
    webhookUrl: saved.webhookUrl || "",
  };
}

function makeWppBotRule() {
  const id = makeWppVerifyToken().replace(/^wpp_/, "rule_");
  return {
    id,
    name: "Nova regra",
    enabled: true,
    operator: "equals" as const,
    matchValue: "",
    message: "",
    buttons: [] as WppIncomingReplyButton[],
    actions: [] as WppIncomingActionType[],
  };
}

function makeWppBotButton(): WppIncomingReplyButton {
  const suffix = Math.random().toString(36).slice(2, 8);
  return { id: `btn_${suffix}`, title: "Opcao" };
}

function normalizeRuleKey(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function upsertWppQuickRule(rules: WppIncomingAutoReplyRule[], quickRule: WppIncomingAutoReplyRule): WppIncomingAutoReplyRule[] {
  const matchKey = normalizeRuleKey(quickRule.matchValue);
  const nextRules = rules.filter((rule) => rule.id !== quickRule.id && normalizeRuleKey(rule.matchValue) !== matchKey);
  return [...nextRules, { ...quickRule, buttons: [...quickRule.buttons], actions: [...quickRule.actions] }];
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

function urlButtonVariableSlots(template: WppTemplate): Array<{ index: number; label: string }> {
  const buttons = template.components.find((component) => component.type.toUpperCase() === "BUTTONS")?.buttons ?? [];
  return buttons
    .map((button, index) => {
      const type = String(button?.type || "").toUpperCase();
      const url = String(button?.url || "");
      if (type !== "URL" || variableCount(url) < 1) return null;
      const text = String(button?.text || "Abrir link").trim() || "Abrir link";
      return { index, label: `Botão URL “${text}” {{1}}` };
    })
    .filter((item): item is { index: number; label: string } => Boolean(item));
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
  const urlButtons = urlButtonVariableSlots(template);
  const [phone, setPhone] = useState("");
  const [headerValues, setHeaderValues] = useState<string[]>(() => Array.from({ length: headerCount }, () => ""));
  const [values, setValues] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const [buttonUrlValues, setButtonUrlValues] = useState<string[]>(() => Array.from({ length: urlButtons.length }, () => ""));
  const [sending, setSending] = useState(false);

  async function send() {
    if (phone.replace(/\D/g, "").length < 10) {
      showToast({ variant: "warning", message: "Informe o telefone com DDI e DDD." });
      return;
    }
    if ([...headerValues, ...values, ...buttonUrlValues].some((value) => !value.trim())) {
      showToast({ variant: "warning", message: "Preencha todos os valores do template." });
      return;
    }
    setSending(true);
    try {
      await sendWppTemplateTest({
        templateName: template.name,
        language: template.language,
        to: phone,
        headerParameters: headerValues,
        bodyParameters: values,
        buttonUrlParameters: buttonUrlValues.map((value, index) => ({
          index: urlButtons[index]?.index ?? index,
          text: value,
        })),
      });
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
        {urlButtons.map((button, index) => (
          <label key={`url-btn-${button.index}`} className="block text-xs font-medium text-slate-400">{button.label}
            <input
              value={buttonUrlValues[index] || ""}
              onChange={(e) => setButtonUrlValues((current) => current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)))}
              placeholder="Sufixo dinâmico da URL (ex.: token do link)"
              className={inputClass}
            />
          </label>
        ))}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prévia</p><p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{componentText(template, "BODY") || "Sem conteúdo"}</p></div>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4 sm:px-6"><button type="button" onClick={onClose} className={secondaryButton}>Cancelar</button><button type="button" onClick={() => void send()} disabled={sending || template.status !== "APPROVED"} className={primaryButton}>{sending ? "Enviando..." : "Enviar teste"}</button></div>
    </ModalShell>
  );
}

function WppButtonsEditor({
  buttons,
  onChange,
}: {
  buttons: WppIncomingReplyButton[];
  onChange: (buttons: WppIncomingReplyButton[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">Botoes de resposta</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Ate 3 viram botoes; de 4 a {WPP_MAX_REPLY_BUTTONS} sao enviados como lista no WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...buttons, makeWppBotButton()].slice(0, WPP_MAX_REPLY_BUTTONS))}
          disabled={buttons.length >= WPP_MAX_REPLY_BUTTONS}
          className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
        >
          + Botao ({buttons.length}/{WPP_MAX_REPLY_BUTTONS})
        </button>
      </div>
      {buttons.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-600">Sem botoes.</p>
      ) : (
        <div className="grid gap-2">
          {buttons.map((button, index) => (
            <div key={`${button.id}-${index}`} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="text-[11px] font-medium text-slate-500">
                ID
                <input
                  value={button.id}
                  maxLength={128}
                  onChange={(event) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.target.value } : item))}
                  className={`${inputClass} py-2 font-mono`}
                />
              </label>
              <label className="text-[11px] font-medium text-slate-500">
                Texto
                <input
                  value={button.title}
                  maxLength={24}
                  onChange={(event) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
                  className={`${inputClass} py-2`}
                />
              </label>
              <button
                type="button"
                onClick={() => onChange(buttons.filter((_, itemIndex) => itemIndex !== index))}
                className="self-end rounded-lg border border-red-900/50 px-2.5 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WppActionsPicker({
  actions,
  onChange,
}: {
  actions: WppIncomingActionType[];
  onChange: (actions: WppIncomingActionType[]) => void;
}) {
  function toggle(action: WppIncomingActionType) {
    onChange(actions.includes(action) ? actions.filter((item) => item !== action) : [...actions, action]);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(Object.keys(WPP_BOT_ACTION_LABEL) as WppIncomingActionType[]).map((action) => (
        <label key={action} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300">
          <input
            type="checkbox"
            checked={actions.includes(action)}
            onChange={() => toggle(action)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
          />
          {WPP_BOT_ACTION_LABEL[action]}
        </label>
      ))}
    </div>
  );
}

export function WppSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<WppConnectionSettings | null>(null);
  const [form, setForm] = useState<WppConnectionInput>(EMPTY_CONNECTION);
  const [flightReviewTemplate, setFlightReviewTemplate] = useState<WppFlightReviewReadyTemplateSettings>(DEFAULT_FLIGHT_REVIEW_TEMPLATE);
  const [tomorrowFlightReminderTemplate, setTomorrowFlightReminderTemplate] = useState<WppTomorrowFlightReminderTemplateSettings>(DEFAULT_TOMORROW_FLIGHT_REMINDER_TEMPLATE);
  const [paymentReceivedTemplate, setPaymentReceivedTemplate] = useState<WppTransactionalTemplateSettings>(DEFAULT_PAYMENT_RECEIVED_TEMPLATE);
  const [bookingRequestedTemplate, setBookingRequestedTemplate] = useState<WppTransactionalTemplateSettings>(DEFAULT_BOOKING_REQUESTED_TEMPLATE);
  const [soloFlightApprovalTemplate, setSoloFlightApprovalTemplate] = useState<WppTransactionalTemplateSettings>(DEFAULT_SOLO_FLIGHT_APPROVAL_TEMPLATE);
  const [soloFlightAwarenessTemplate, setSoloFlightAwarenessTemplate] = useState<WppTransactionalTemplateSettings>(DEFAULT_SOLO_FLIGHT_AWARENESS_TEMPLATE);
  const [soloFlightCoordinatorPhone, setSoloFlightCoordinatorPhone] = useState("");
  const [soloFlightSgsoPhone, setSoloFlightSgsoPhone] = useState("");
  const [incomingAutoReply, setIncomingAutoReply] = useState<WppIncomingAutoReplySettings>(DEFAULT_INCOMING_AUTO_REPLY);
  const [templates, setTemplates] = useState<WppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [ensuringSoloTemplates, setEnsuringSoloTemplates] = useState(false);
  const [savingBot, setSavingBot] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeSection, setActiveSection] = useState<WppSettingsSection>("bot");
  const [search, setSearch] = useState("");
  const [deliveries, setDeliveries] = useState<WppDeliveryStatus[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
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

  const loadDeliveries = useCallback(async () => {
    setLoadingDeliveries(true);
    try { setDeliveries(await listWppDeliveryStatuses({ limit: 40 })); }
    catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar entregas." }); }
    finally { setLoadingDeliveries(false); }
  }, [showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getWppSettings();
      setSettings(next); setForm(connectionForm(next));
      setFlightReviewTemplate(next.flightReviewReadyTemplate ?? DEFAULT_FLIGHT_REVIEW_TEMPLATE);
      setTomorrowFlightReminderTemplate(next.tomorrowFlightReminderTemplate ?? DEFAULT_TOMORROW_FLIGHT_REMINDER_TEMPLATE);
      setPaymentReceivedTemplate(next.paymentReceivedTemplate ?? DEFAULT_PAYMENT_RECEIVED_TEMPLATE);
      setBookingRequestedTemplate(next.bookingRequestedTemplate ?? DEFAULT_BOOKING_REQUESTED_TEMPLATE);
      setSoloFlightApprovalTemplate(next.soloFlightApprovalTemplate ?? DEFAULT_SOLO_FLIGHT_APPROVAL_TEMPLATE);
      setSoloFlightAwarenessTemplate(next.soloFlightAwarenessTemplate ?? DEFAULT_SOLO_FLIGHT_AWARENESS_TEMPLATE);
      setSoloFlightCoordinatorPhone(next.soloFlightCoordinatorPhone ?? "");
      setSoloFlightSgsoPhone(next.soloFlightSgsoPhone ?? "");
      setIncomingAutoReply(incomingAutoReplyForm(next));
      if (next.apiKeyConfigured && next.wabaId) await loadTemplates();
    } catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar integração." }); }
    finally { setLoading(false); }
  }, [loadTemplates, showToast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (activeSection === "deliveries") void loadDeliveries();
  }, [activeSection, loadDeliveries]);

  async function connect() {
    if (!form.wabaId.trim() || !form.phoneNumberId.trim() || (!form.apiKey.trim() && !settings?.apiKeyConfigured)) {
      showToast({ variant: "warning", message: "Preencha o WABA ID, Phone Number ID e token de acesso." }); return;
    }
    setSaving(true);
    try {
      await saveWppSettings({
        ...form,
        flightReviewReadyTemplate: flightReviewTemplate,
        tomorrowFlightReminderTemplate,
        paymentReceivedTemplate,
        bookingRequestedTemplate,
        incomingAutoReply,
        soloFlightApprovalTemplate: {
          ...soloFlightApprovalTemplate,
          templateName: soloFlightApprovalTemplate.templateName.trim().toLowerCase(),
          language: soloFlightApprovalTemplate.language.trim() || "pt_BR",
          bodyParameters: soloFlightApprovalTemplate.bodyParameters,
        },
        soloFlightAwarenessTemplate: {
          ...soloFlightAwarenessTemplate,
          templateName: soloFlightAwarenessTemplate.templateName.trim().toLowerCase(),
          language: soloFlightAwarenessTemplate.language.trim() || "pt_BR",
          bodyParameters: soloFlightAwarenessTemplate.bodyParameters,
        },
        soloFlightCoordinatorPhone: soloFlightCoordinatorPhone.trim(),
        soloFlightSgsoPhone: soloFlightSgsoPhone.trim(),
      });
      const tested = await testWppConnection();
      setSettings(tested); setForm(connectionForm(tested));
      setIncomingAutoReply(incomingAutoReplyForm(tested));
      showToast({ variant: "success", message: "Conta do WhatsApp conectada com sucesso." });
      await loadTemplates();
    } catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Não foi possível conectar a conta." }); }
    finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true);
    try { const next = await testWppConnection(); setSettings(next); setIncomingAutoReply(incomingAutoReplyForm(next)); showToast({ variant: "success", message: "Conexão funcionando normalmente." }); }
    catch (error) { showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha no teste de conexão." }); }
    finally { setTesting(false); }
  }

  async function saveBotSettings() {
    const message = incomingAutoReply.message.trim();
    const verifyToken = incomingAutoReply.verifyToken.trim() || makeWppVerifyToken();
    if (!message) {
      showToast({ variant: "warning", message: "Informe a resposta padrão do bot." });
      return;
    }
    const invalidButton = [
      ...incomingAutoReply.buttons,
      ...incomingAutoReply.rules.flatMap((rule) => rule.buttons),
    ].some((button) => !button.id.trim() || !button.title.trim());
    if (invalidButton) {
      showToast({ variant: "warning", message: "Preencha ID e texto de todos os botoes." });
      return;
    }
    setSavingBot(true);
    try {
      const next = await saveWppBotSettings({
        incomingAutoReply: {
          ...incomingAutoReply,
          message,
          verifyToken,
          webhookUrl: incomingAutoReply.webhookUrl.trim(),
        },
      });
      setSettings(next);
      setIncomingAutoReply(incomingAutoReplyForm(next));
      showToast({ variant: "success", message: "Bot de entrada salvo." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao salvar o bot." });
    } finally {
      setSavingBot(false);
    }
  }

  async function copyText(value: string, message: string) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    showToast({ variant: "success", message });
  }

  function updateBotRule(ruleId: string, patch: Partial<WppIncomingAutoReplySettings["rules"][number]>) {
    setIncomingAutoReply((current) => ({
      ...current,
      rules: current.rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule),
    }));
  }

  function applyQuickRule(quickRule: WppIncomingAutoReplyRule) {
    setIncomingAutoReply((current) => ({
      ...current,
      enabled: true,
      matchingMode: "content",
      rules: upsertWppQuickRule(current.rules, quickRule),
    }));
    showToast({ variant: "success", message: `Gatilho "${quickRule.matchValue}" pronto para salvar.` });
  }

  async function saveNotificationTemplates() {
    if (!flightReviewTemplate.templateName.trim()) {
      showToast({ variant: "warning", message: "Informe o template do aviso de voo." });
      return;
    }
    if (paymentReceivedTemplate.enabled && !paymentReceivedTemplate.templateName.trim()) {
      showToast({ variant: "warning", message: "Informe o template de pagamento recebido." });
      return;
    }
    if (bookingRequestedTemplate.enabled && !bookingRequestedTemplate.templateName.trim()) {
      showToast({ variant: "warning", message: "Informe o template de solicitaÃ§Ã£o de agendamento." });
      return;
    }
    setSavingTemplates(true);
    try {
      const next = await saveWppNotificationTemplates({
        flightReviewReadyTemplate: {
          ...flightReviewTemplate,
          templateName: flightReviewTemplate.templateName.trim().toLowerCase(),
          language: flightReviewTemplate.language.trim() || "pt_BR",
        },
        tomorrowFlightReminderTemplate: {
          ...tomorrowFlightReminderTemplate,
          templateName: tomorrowFlightReminderTemplate.templateName.trim().toLowerCase(),
          language: tomorrowFlightReminderTemplate.language.trim() || "pt_BR",
          sendHour: Number(tomorrowFlightReminderTemplate.sendHour) || 19,
          bodyParameters: tomorrowFlightReminderTemplate.bodyParameters,
        },
        paymentReceivedTemplate: {
          ...paymentReceivedTemplate,
          templateName: paymentReceivedTemplate.templateName.trim().toLowerCase(),
          language: paymentReceivedTemplate.language.trim() || "pt_BR",
          bodyParameters: paymentReceivedTemplate.bodyParameters,
        },
        bookingRequestedTemplate: {
          ...bookingRequestedTemplate,
          templateName: bookingRequestedTemplate.templateName.trim().toLowerCase(),
          language: bookingRequestedTemplate.language.trim() || "pt_BR",
          bodyParameters: bookingRequestedTemplate.bodyParameters,
        },
        soloFlightApprovalTemplate: {
          ...soloFlightApprovalTemplate,
          templateName: soloFlightApprovalTemplate.templateName.trim().toLowerCase(),
          language: soloFlightApprovalTemplate.language.trim() || "pt_BR",
          bodyParameters: soloFlightApprovalTemplate.bodyParameters,
        },
        soloFlightAwarenessTemplate: {
          ...soloFlightAwarenessTemplate,
          templateName: soloFlightAwarenessTemplate.templateName.trim().toLowerCase(),
          language: soloFlightAwarenessTemplate.language.trim() || "pt_BR",
          bodyParameters: soloFlightAwarenessTemplate.bodyParameters,
        },
        soloFlightCoordinatorPhone: soloFlightCoordinatorPhone.trim(),
        soloFlightSgsoPhone: soloFlightSgsoPhone.trim(),
      });
      setSettings(next);
      setFlightReviewTemplate(next.flightReviewReadyTemplate ?? DEFAULT_FLIGHT_REVIEW_TEMPLATE);
      setTomorrowFlightReminderTemplate(next.tomorrowFlightReminderTemplate ?? DEFAULT_TOMORROW_FLIGHT_REMINDER_TEMPLATE);
      setPaymentReceivedTemplate(next.paymentReceivedTemplate ?? DEFAULT_PAYMENT_RECEIVED_TEMPLATE);
      setBookingRequestedTemplate(next.bookingRequestedTemplate ?? DEFAULT_BOOKING_REQUESTED_TEMPLATE);
      showToast({ variant: "success", message: "Templates de notificação salvos." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao salvar os templates." });
    } finally {
      setSavingTemplates(false);
    }
  }

  async function createSoloTemplates() {
    setEnsuringSoloTemplates(true);
    try {
      await ensureSoloFlightWppTemplates();
      showToast({ variant: "success", message: "Templates de voo solo criados/listados no Meta." });
      await loadTemplates();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao criar templates de voo solo." });
    } finally {
      setEnsuringSoloTemplates(false);
    }
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
      <div className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-2 md:grid-cols-4">
        {WPP_SETTING_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className={`rounded-xl border px-4 py-3 text-left transition ${activeSection === section.id ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-950/40 hover:text-slate-200"}`}
          >
            <span className="block text-sm font-semibold">{section.title}</span>
            <span className="mt-1 block text-xs text-slate-500">{section.description}</span>
          </button>
        ))}
      </div>

      <section className={`${activeSection === "connection" ? "" : "hidden"} overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70`}>
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

      <section className={`${activeSection === "bot" ? "" : "hidden"} overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70`}>
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-100">Bot de entrada</h2>
            <p className="mt-1 text-sm text-slate-500">Roteie respostas por ID de botao/resposta ou pelo conteudo enviado pelo cliente.</p>
          </div>
          <button type="button" onClick={() => void saveBotSettings()} disabled={savingBot} className={primaryButton}>{savingBot ? "Salvando..." : "Salvar bot"}</button>
        </div>
        <div className="grid gap-4 p-5 sm:p-6">
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Recebimento</h3>
              <p className="mt-1 text-xs text-slate-600">Escolha se o bot observa o ID do botao clicado ou o texto enviado pelo cliente.</p>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200">
              <input type="checkbox" checked={incomingAutoReply.enabled} onChange={(e) => setIncomingAutoReply((current) => ({ ...current, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
              Responder automaticamente mensagens recebidas
            </label>
            <div className="mt-3 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/35 p-3 sm:grid-cols-2">
              <button type="button" onClick={() => setIncomingAutoReply((current) => ({ ...current, matchingMode: "id" }))} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${incomingAutoReply.matchingMode === "id" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-slate-800 text-slate-400 hover:bg-slate-900"}`}>
                Observar pelo ID
              </button>
              <button type="button" onClick={() => setIncomingAutoReply((current) => ({ ...current, matchingMode: "content" }))} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${incomingAutoReply.matchingMode === "content" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-slate-800 text-slate-400 hover:bg-slate-900"}`}>
                Observar pelo conteudo
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Gatilhos prontos</h3>
                <p className="mt-1 text-xs text-slate-600">Ative fluxos comuns sem montar a regra manualmente.</p>
              </div>
              <span className="text-xs font-medium text-slate-500">Modo recomendado: conteudo</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {WPP_QUICK_RULES.map((quickRule) => {
                const configured = incomingAutoReply.rules.some((rule) => rule.enabled && normalizeRuleKey(rule.matchValue) === normalizeRuleKey(quickRule.matchValue) && quickRule.actions.every((action) => rule.actions.includes(action)));
                return (
                  <article key={quickRule.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-200">{quickRule.matchValue}</h4>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{WPP_BOT_ACTION_LABEL[quickRule.actions[0]]}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${configured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-950 text-slate-500"}`}>{configured ? "Ativo" : "Opcional"}</span>
                    </div>
                    <button type="button" onClick={() => applyQuickRule(quickRule)} className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800">
                      {configured ? "Atualizar gatilho" : "Configurar gatilho"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Resposta padrao</h3>
              <p className="mt-1 text-xs text-slate-600">
                Usada quando nenhuma regra especifica bater. Use {"{{nickname}}"} ou {"{{nickname_suffix}}"} para personalizar com o apelido do aluno.
              </p>
            </div>
            <label className="text-xs font-medium text-slate-400">Mensagem
              <textarea value={incomingAutoReply.message} rows={3} maxLength={1024} onChange={(e) => setIncomingAutoReply((current) => ({ ...current, message: e.target.value }))} className={`${inputClass} resize-y leading-6`} />
              <span className="mt-1 block font-normal text-slate-600">{incomingAutoReply.message.length}/1024</span>
            </label>
            <div className="mt-4">
              <WppButtonsEditor buttons={incomingAutoReply.buttons} onChange={(buttons) => setIncomingAutoReply((current) => ({ ...current, buttons }))} />
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-slate-400">Acoes da resposta padrao</p>
              <WppActionsPicker actions={incomingAutoReply.actions} onChange={(actions) => setIncomingAutoReply((current) => ({ ...current, actions }))} />
            </div>
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <h3 className="text-sm font-semibold text-cyan-200">Comandos embutidos: AISWEB</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              O aluno pode enviar:
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
              <li><span className="font-mono text-cyan-300">Metar</span> ou <span className="font-mono text-cyan-300">Outro Metar</span> — instruções de uso</li>
              <li><span className="font-mono text-cyan-300">Metar SBSP</span> — METAR, TAF, limites, vento, nuvens e sol</li>
              <li><span className="font-mono text-cyan-300">Notam SBSP</span> — últimos NOTAMs ativos</li>
              <li><span className="font-mono text-cyan-300">Detalhes SBSP</span> — operação, frequências, pistas e mapa</li>
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <h3 className="text-sm font-semibold text-emerald-200">Comando embutido: Agendar voo</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              O aluno envia <span className="font-mono text-emerald-300">Agendar</span> ou <span className="font-mono text-emerald-300">Agendar voo</span> (ou o atalho rápido abaixo) e segue: horas → crédito → semana → dia → avião → horário → confirmação.
              Em qualquer etapa, <span className="font-mono text-emerald-300">Cancelar</span> ou <span className="font-mono text-emerald-300">Sair</span> encerra a sessão.
            </p>
          </div>
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Regras de resposta</h3>
                <p className="mt-1 text-xs text-slate-600">A primeira regra ativa que bater substitui a resposta padrao.</p>
              </div>
              <button type="button" onClick={() => setIncomingAutoReply((current) => ({ ...current, rules: [...current.rules, makeWppBotRule()] }))} className={secondaryButton}>
                + Nova regra
              </button>
            </div>
            {incomingAutoReply.rules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-800 px-3 py-3 text-sm text-slate-600">Nenhuma regra configurada. O bot usa a resposta padrao.</p>
            ) : (
              <div className="space-y-3">
                {incomingAutoReply.rules.map((rule, index) => (
                  <article key={rule.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                        <input type="checkbox" checked={rule.enabled} onChange={(e) => updateBotRule(rule.id, { enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
                        Regra {index + 1}
                      </label>
                      <button type="button" onClick={() => setIncomingAutoReply((current) => ({ ...current, rules: current.rules.filter((item) => item.id !== rule.id) }))} className="w-fit rounded-lg border border-red-900/50 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10">
                        Remover regra
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)]">
                      <label className="text-xs font-medium text-slate-400">Nome
                        <input value={rule.name} onChange={(e) => updateBotRule(rule.id, { name: e.target.value })} className={inputClass} />
                      </label>
                      <label className="text-xs font-medium text-slate-400">Operador
                        <select value={rule.operator} onChange={(e) => updateBotRule(rule.id, { operator: e.target.value as typeof rule.operator })} className={inputClass}>
                          <option value="equals">Igual</option>
                          <option value="contains">Contem</option>
                          <option value="starts_with">Comeca com</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-400">Valor observado
                        <input value={rule.matchValue} onChange={(e) => updateBotRule(rule.id, { matchValue: e.target.value })} placeholder={incomingAutoReply.matchingMode === "id" ? "ex: ver_figurinhas" : "ex: figurinhas"} className={inputClass} />
                      </label>
                    </div>
                    <label className="mt-3 block text-xs font-medium text-slate-400">Mensagem enviada
                      <textarea value={rule.message} rows={3} maxLength={1024} onChange={(e) => updateBotRule(rule.id, { message: e.target.value })} className={`${inputClass} resize-y leading-6`} />
                      <span className="mt-1 block font-normal text-slate-600">Variáveis: {"{{nickname}}"}, {"{{nickname_suffix}}"}</span>
                    </label>
                    <div className="mt-4 grid gap-4">
                      <WppButtonsEditor buttons={rule.buttons} onChange={(buttons) => updateBotRule(rule.id, { buttons })} />
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-400">Acoes desta regra</p>
                        <WppActionsPicker actions={rule.actions} onChange={(actions) => updateBotRule(rule.id, { actions })} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="text-xs font-medium text-slate-400">Token de verificação da Meta
              <input value={incomingAutoReply.verifyToken} onChange={(e) => setIncomingAutoReply((current) => ({ ...current, verifyToken: e.target.value.trim() }))} className={`${inputClass} font-mono`} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setIncomingAutoReply((current) => ({ ...current, verifyToken: makeWppVerifyToken() }))} className={secondaryButton}>Gerar</button>
              <button type="button" onClick={() => void copyText(incomingAutoReply.verifyToken, "Token copiado.")} disabled={!incomingAutoReply.verifyToken} className={secondaryButton}>Copiar</button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="text-xs font-medium text-slate-400">URL pública do webhook <span className="font-normal text-slate-600">(opcional)</span>
              <input value={incomingAutoReply.webhookUrl} onChange={(e) => setIncomingAutoReply((current) => ({ ...current, webhookUrl: e.target.value }))} placeholder="https://.../wpp-webhook" className={`${inputClass} font-mono`} />
            </label>
            <button type="button" onClick={() => void copyText(incomingAutoReply.webhookUrl, "URL do webhook copiada.")} disabled={!incomingAutoReply.webhookUrl} className={secondaryButton}>Copiar URL</button>
          </div>
        </div>
      </section>

      <section className={`${activeSection === "notifications" ? "" : "hidden"} overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70`}>
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-100">Automações de templates</h2>
            <p className="mt-1 text-sm text-slate-500">Linkagem usada pelos disparos automáticos e manuais da plataforma.</p>
          </div>
          <button type="button" onClick={() => void saveNotificationTemplates()} disabled={savingTemplates} className={primaryButton}>{savingTemplates ? "Salvando..." : "Salvar templates"}</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_10rem_8rem] sm:items-end sm:p-6">
          <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 sm:col-span-3">
            <input type="checkbox" checked={flightReviewTemplate.enabled} onChange={(e) => setFlightReviewTemplate((current) => ({ ...current, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
            Enviar WhatsApp no botão Notificar aluno
          </label>
          <label className="text-xs font-medium text-slate-400">Aviso de voo pronto
            <input value={flightReviewTemplate.templateName} onChange={(e) => setFlightReviewTemplate((current) => ({ ...current, templateName: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="attvoo_2" className={inputClass} />
          </label>
          <label className="text-xs font-medium text-slate-400">Idioma
            <input value={flightReviewTemplate.language} onChange={(e) => setFlightReviewTemplate((current) => ({ ...current, language: e.target.value }))} placeholder="pt_BR" className={inputClass} />
          </label>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs leading-5 text-slate-500">
            <strong className="block text-slate-300">Botão URL {"{{1}}"}</strong>
            Token do link público (sufixo dinâmico do botão)
          </div>
        </div>
        <div className="border-t border-slate-800 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_8rem] sm:items-end">
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 sm:col-span-3">
              <input type="checkbox" checked={tomorrowFlightReminderTemplate.enabled} onChange={(e) => setTomorrowFlightReminderTemplate((current) => ({ ...current, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
              Enviar lembrete automático às 19h para alunos com voo confirmado no dia seguinte
            </label>
            <p className="sm:col-span-3 text-xs leading-5 text-slate-500">
              Com escala somente no SAGA, o lembrete lê os voos confirmados direto da agenda do SAGA (não depende de sync local).
            </p>
            <label className="text-xs font-medium text-slate-400">Lembrete de voo amanhã
              <input value={tomorrowFlightReminderTemplate.templateName} onChange={(e) => setTomorrowFlightReminderTemplate((current) => ({ ...current, templateName: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="lembrete_voo_amanha" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400">Idioma
              <input value={tomorrowFlightReminderTemplate.language} onChange={(e) => setTomorrowFlightReminderTemplate((current) => ({ ...current, language: e.target.value }))} placeholder="pt_BR" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400">Hora
              <input type="number" min={0} max={23} value={tomorrowFlightReminderTemplate.sendHour} onChange={(e) => setTomorrowFlightReminderTemplate((current) => ({ ...current, sendHour: Number(e.target.value) }))} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400 sm:col-span-2">Parâmetros do corpo
              <input value={tomorrowFlightReminderTemplate.bodyParameters.join(", ")} onChange={(e) => setTomorrowFlightReminderTemplate((current) => ({ ...current, bodyParameters: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="student_name, flight_date, start_time, aircraft, mission, instructor" className={inputClass} />
            </label>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs leading-5 text-slate-500">
              <strong className="block text-slate-300">Variáveis</strong>
              student_name, flight_date, start_time, aircraft, mission, instructor, route, flight_id
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_8rem] sm:items-end">
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 sm:col-span-3">
              <input type="checkbox" checked={paymentReceivedTemplate.enabled} onChange={(e) => setPaymentReceivedTemplate((current) => ({ ...current, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
              Enviar confirmaÃ§Ã£o ao aluno quando o pagamento Cakto for aprovado
            </label>
            <label className="text-xs font-medium text-slate-400">Pagamento recebido
              <input value={paymentReceivedTemplate.templateName} onChange={(e) => setPaymentReceivedTemplate((current) => ({ ...current, templateName: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="pagamento_recebido_cakto" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400">Idioma
              <input value={paymentReceivedTemplate.language} onChange={(e) => setPaymentReceivedTemplate((current) => ({ ...current, language: e.target.value }))} placeholder="pt_BR" className={inputClass} />
            </label>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs leading-5 text-slate-500">
              <strong className="block text-slate-300">CTA</strong>
              Use um botao de URL no template apontando para o agendamento.
            </div>
            <label className="text-xs font-medium text-slate-400 sm:col-span-2">ParÃ¢metros do corpo
              <input value={paymentReceivedTemplate.bodyParameters.join(", ")} onChange={(e) => setPaymentReceivedTemplate((current) => ({ ...current, bodyParameters: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="student_name, product, amount, payment_method, booking_url" className={inputClass} />
            </label>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs leading-5 text-slate-500">
              <strong className="block text-slate-300">VariÃ¡veis</strong>
              student_name, product, amount, payment_method, installments, order_id, paid_at, booking_url
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_8rem] sm:items-end">
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 sm:col-span-3">
              <input type="checkbox" checked={bookingRequestedTemplate.enabled} onChange={(e) => setBookingRequestedTemplate((current) => ({ ...current, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
              Enviar confirmaÃ§Ã£o quando o aluno solicitar agendamento pela plataforma
            </label>
            <label className="text-xs font-medium text-slate-400">SolicitaÃ§Ã£o de agendamento
              <input value={bookingRequestedTemplate.templateName} onChange={(e) => setBookingRequestedTemplate((current) => ({ ...current, templateName: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="solicitacao_agendamento_voo" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400">Idioma
              <input value={bookingRequestedTemplate.language} onChange={(e) => setBookingRequestedTemplate((current) => ({ ...current, language: e.target.value }))} placeholder="pt_BR" className={inputClass} />
            </label>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs leading-5 text-slate-500">
              <strong className="block text-slate-300">ExceÃ§Ã£o</strong>
              SolicitaÃ§Ãµes feitas pelo bot do WhatsApp nÃ£o recebem este disparo.
            </div>
            <label className="text-xs font-medium text-slate-400 sm:col-span-2">ParÃ¢metros do corpo
              <input value={bookingRequestedTemplate.bodyParameters.join(", ")} onChange={(e) => setBookingRequestedTemplate((current) => ({ ...current, bodyParameters: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="student_name, flight_date, start_time, aircraft, duration, status" className={inputClass} />
            </label>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs leading-5 text-slate-500">
              <strong className="block text-slate-300">VariÃ¡veis</strong>
              student_name, flight_date, presentation_time, start_time, aircraft, duration, status, booking_url
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Voo solo</h3>
              <p className="mt-1 text-xs text-slate-500">Templates utilitários pt_BR para aprovação com flags e ciência sem flags.</p>
            </div>
            <button type="button" onClick={() => void createSoloTemplates()} disabled={ensuringSoloTemplates || !connected} className={secondaryButton}>
              {ensuringSoloTemplates ? "Criando..." : "Criar templates Meta"}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-400">WhatsApp coordenador
              <input value={soloFlightCoordinatorPhone} onChange={(e) => setSoloFlightCoordinatorPhone(e.target.value)} placeholder="55..." className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400">WhatsApp SGSO
              <input value={soloFlightSgsoPhone} onChange={(e) => setSoloFlightSgsoPhone(e.target.value)} placeholder="55..." className={inputClass} />
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 sm:col-span-2">
              <input type="checkbox" checked={soloFlightApprovalTemplate.enabled} onChange={(e) => setSoloFlightApprovalTemplate((current) => ({ ...current, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
              Enviar aprovação quando houver flags
            </label>
            <label className="text-xs font-medium text-slate-400">Template aprovação
              <input value={soloFlightApprovalTemplate.templateName} onChange={(e) => setSoloFlightApprovalTemplate((current) => ({ ...current, templateName: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="voo_solo_aprovacao" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400">Idioma
              <input value={soloFlightApprovalTemplate.language} onChange={(e) => setSoloFlightApprovalTemplate((current) => ({ ...current, language: e.target.value }))} placeholder="pt_BR" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400 sm:col-span-2">Parâmetros aprovação
              <input value={soloFlightApprovalTemplate.bodyParameters.join(", ")} onChange={(e) => setSoloFlightApprovalTemplate((current) => ({ ...current, bodyParameters: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="student_name, flight_date, route, flags_summary, request_id" className={inputClass} />
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 sm:col-span-2">
              <input type="checkbox" checked={soloFlightAwarenessTemplate.enabled} onChange={(e) => setSoloFlightAwarenessTemplate((current) => ({ ...current, enabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500" />
              Enviar ciência quando aprovado automaticamente
            </label>
            <label className="text-xs font-medium text-slate-400">Template ciência
              <input value={soloFlightAwarenessTemplate.templateName} onChange={(e) => setSoloFlightAwarenessTemplate((current) => ({ ...current, templateName: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="voo_solo_ciencia" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400">Idioma
              <input value={soloFlightAwarenessTemplate.language} onChange={(e) => setSoloFlightAwarenessTemplate((current) => ({ ...current, language: e.target.value }))} placeholder="pt_BR" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-400 sm:col-span-2">Parâmetros ciência
              <input value={soloFlightAwarenessTemplate.bodyParameters.join(", ")} onChange={(e) => setSoloFlightAwarenessTemplate((current) => ({ ...current, bodyParameters: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="student_name, flight_date, route, status, request_id" className={inputClass} />
            </label>
          </div>
        </div>
      </section>

      <section className={`${activeSection === "templates" ? "" : "hidden"} overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70`}>
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 className="font-semibold text-slate-100">Templates da conta</h2><p className="mt-1 text-sm text-slate-500">{templates.length} {templates.length === 1 ? "template sincronizado" : "templates sincronizados"} com a Meta.</p></div><div className="flex gap-2"><button type="button" onClick={() => void loadTemplates()} disabled={loadingTemplates || !settings?.apiKeyConfigured} className={secondaryButton}>{loadingTemplates ? "Atualizando..." : "Atualizar"}</button><button type="button" onClick={() => setEditorTemplate("new")} disabled={!connected} className={primaryButton}>+ Novo template</button></div></div>
        <div className="p-5 sm:p-6"><div className="relative mb-5"><svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"><path fillRule="evenodd" d="M9 3a6 6 0 104.472 10.002l3.763 3.763a.75.75 0 101.06-1.06l-3.763-3.763A6 6 0 009 3zM4.5 9a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z" clipRule="evenodd" /></svg><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, categoria ou status..." className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500" /></div>
          {!connected ? <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-slate-500"><svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M8 4a4 4 0 117.446 2.032l2.261 2.26a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-.707.293H7v-2H5v-2H3.5a1 1 0 01-.707-1.707l5.175-5.175A4 4 0 018 4zm4-1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" clipRule="evenodd" /></svg></span><p className="mt-4 text-sm font-medium text-slate-300">Conecte sua conta para carregar os templates</p><p className="mt-1 text-xs text-slate-600">Suas credenciais ficam protegidas na função administrativa do Appwrite.</p></div></div> : loadingTemplates ? <div className="space-y-3"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div> : filtered.length === 0 ? <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-slate-800 text-center"><div><p className="text-sm font-medium text-slate-400">{search ? "Nenhum template encontrado" : "Nenhum template nesta conta"}</p><p className="mt-1 text-xs text-slate-600">{search ? "Tente buscar por outro termo." : "Crie o primeiro template para começar."}</p></div></div> : <div className="space-y-3">{filtered.map((template) => <article key={`${template.id}-${template.language}`} className="group rounded-xl border border-slate-800 bg-slate-950/40 p-4 transition hover:border-slate-700"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-mono text-sm font-semibold text-slate-200">{template.name}</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle(template.status)}`}>{statusLabel(template.status)}</span></div><p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{componentText(template, "BODY") || "Template sem corpo de mensagem"}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-wide text-slate-600"><span>{template.category}</span><span>{template.language}</span>{template.qualityScore ? <span>Qualidade: {template.qualityScore}</span> : null}</div></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => setTestTemplate(template)} disabled={template.status !== "APPROVED"} title={template.status !== "APPROVED" ? "Apenas templates aprovados podem ser enviados" : "Enviar teste"} className="rounded-lg border border-emerald-700/40 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-35">Testar</button><button type="button" onClick={() => setEditorTemplate(template)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800">Editar</button><button type="button" onClick={() => setDeleteTemplate(template)} className="rounded-lg border border-red-900/50 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10">Excluir</button></div></div></article>)}</div>}
        </div>
      </section>

      <section className={`${activeSection === "deliveries" ? "" : "hidden"} overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70`}>
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-100">Entregas recentes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Status real da Meta via webhook: aceito, enviado, entregue, lido ou falha com motivo.
            </p>
          </div>
          <button type="button" onClick={() => void loadDeliveries()} disabled={loadingDeliveries} className={secondaryButton}>
            {loadingDeliveries ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
        <div className="p-5 sm:p-6">
          {loadingDeliveries && deliveries.length === 0 ? (
            <div className="space-y-3"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div>
          ) : deliveries.length === 0 ? (
            <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-slate-800 text-center">
              <div>
                <p className="text-sm font-medium text-slate-400">Nenhuma entrega registrada ainda</p>
                <p className="mt-1 text-xs text-slate-600">
                  Envie um template ou use &quot;Notificar aluno&quot;. Os status da Meta aparecem aqui em seguida.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((delivery) => (
                <article key={delivery.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${deliveryStatusStyle(delivery.status)}`}>
                          {deliveryStatusLabel(delivery.status)}
                        </span>
                        {delivery.templateName ? (
                          <span className="font-mono text-xs text-slate-300">{delivery.templateName}</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-300">
                        Para <span className="font-mono text-slate-100">{delivery.recipient || "—"}</span>
                      </p>
                      {delivery.failureReason ? (
                        <p className="text-sm text-red-300">{delivery.failureReason}</p>
                      ) : null}
                      <p className="truncate font-mono text-[11px] text-slate-600" title={delivery.messageId}>
                        {delivery.messageId}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-slate-500">{formatDeliveryWhen(delivery.occurredAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {editorTemplate ? <TemplateEditorModal template={editorTemplate === "new" ? null : editorTemplate} onClose={() => setEditorTemplate(null)} onSaved={() => { setEditorTemplate(null); void loadTemplates(); }} /> : null}
      {testTemplate ? <TestTemplateModal template={testTemplate} onClose={() => setTestTemplate(null)} /> : null}
      {deleteTemplate ? <ModalShell title="Excluir template?" subtitle="Essa ação remove o template da conta Meta e não pode ser desfeita." onClose={() => setDeleteTemplate(null)} size="max-w-md"><div className="p-6"><p className="text-sm text-slate-300">O template <strong className="font-mono text-white">{deleteTemplate.name}</strong> será excluído permanentemente.</p></div><div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4"><button type="button" onClick={() => setDeleteTemplate(null)} className={secondaryButton}>Cancelar</button><button type="button" onClick={() => void removeTemplate()} disabled={deleting} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir template"}</button></div></ModalShell> : null}
    </div>
  );
}
