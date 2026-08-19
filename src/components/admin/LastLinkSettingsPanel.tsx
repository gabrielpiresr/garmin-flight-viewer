import { useEffect, useState } from "react";
import {
  getCreditPaymentSettings,
  saveCreditPaymentProvider,
  saveLastLinkSettings,
  testLastLinkConnection,
} from "../../lib/lastlinkDb";
import type { CreditPaymentProvider, LastLinkSettings } from "../../types/lastlink";
import { useToast } from "../ui/ToastProvider";

const inputCls = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none";

function formatExpiry(value: string | null): string {
  if (!value) return "sem sessão";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem sessão";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function LastLinkSettingsPanel() {
  const { showToast } = useToast();
  const [provider, setProvider] = useState<CreditPaymentProvider>("cakto");
  const [settings, setSettings] = useState<LastLinkSettings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCreditPaymentSettings().then((value) => {
      setProvider(value.provider);
      setSettings(value.lastlink);
      setEmail(value.lastlink.email);
    }).catch((error) => showToast({ variant: "error", message: error.message }));
  }, [showToast]);

  async function saveProvider(next: CreditPaymentProvider) {
    setBusy(true);
    try {
      const saved = await saveCreditPaymentProvider(next);
      setProvider(saved);
      showToast({ variant: "success", message: saved === "lastlink" ? "LastLink ativa para créditos." : "Cakto ativa para créditos." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const value = await saveLastLinkSettings({ email, password: password || null });
      setSettings(value);
      setPassword("");
      showToast({ variant: "success", message: "Configuração LastLink salva." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const value = await testLastLinkConnection();
      setSettings(value);
      showToast({ variant: "success", message: "Conexão com a LastLink validada. A sessão fica salva para os próximos links." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Pagamento de créditos</h3>
        <p className="mt-1 text-xs text-slate-500">
          Define qual provedor gera o link na aba de créditos, na compra de horas e no WhatsApp. A Cakto continua disponível para voltar quando quiser.
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveProvider("cakto")}
          className={`rounded-lg border px-3 py-3 text-left text-xs transition ${provider === "cakto" ? "border-sky-500 bg-sky-950/40 text-sky-100" : "border-slate-700 text-slate-300 hover:bg-slate-800/60"}`}
        >
          <span className="block font-semibold">Cakto</span>
          <span className="mt-1 block text-[11px] text-slate-400">Integração atual, com webhook de crédito.</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveProvider("lastlink")}
          className={`rounded-lg border px-3 py-3 text-left text-xs transition ${provider === "lastlink" ? "border-emerald-500 bg-emerald-950/40 text-emerald-100" : "border-slate-700 text-slate-300 hover:bg-slate-800/60"}`}
        >
          <span className="block font-semibold">LastLink</span>
          <span className="mt-1 block text-[11px] text-slate-400">Duplica a oferta base no produto creditosdehoradevoo e lança crédito pelo webhook.</span>
        </button>
      </div>

      {provider === "lastlink" && !settings?.passwordConfigured ? (
        <p className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          Salve o e-mail e a senha da LastLink abaixo antes de gerar links.
        </p>
      ) : null}

      <div className="mt-5 border-t border-slate-800 pt-4">
        <h4 className="text-sm font-semibold text-slate-200">Integração LastLink</h4>
        <p className="mt-1 text-xs text-slate-500">
          O login é feito uma vez e o token fica salvo (cerca de 7 dias). Cada link duplica a oferta “oferta base para duplicação” e só ajusta nome e valor.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">E-mail
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={inputCls} />
          </label>
          <label className="text-xs text-slate-400">Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings?.passwordConfigured ? "Já configurada" : ""} autoComplete="new-password" className={inputCls} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Sessão: {settings?.sessionConfigured ? `válida até ${formatExpiry(settings.sessionExpiresAt)}` : "ainda não autenticada"}
          {settings?.communityId ? ` • produto ${settings.productSlug || "creditosdehoradevoo"}` : ""}
          {settings?.baseOfferId ? " • oferta base encontrada" : ""}
        </p>
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/40 p-3">
          <p className="text-xs font-medium text-slate-300">URL para o webhook da LastLink</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Produto creditosdehoradevoo → Integrações → Lastlink Webhook → Novo webhook. Evento: Compra Completa (Purchase_Order_Confirmed).
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={settings?.webhookUrl || "Disponível após o setup da função lastlink-webhook"} className={`${inputCls} mt-0 font-mono text-xs`} />
            <button
              type="button"
              onClick={() => {
                if (!settings?.webhookUrl) return;
                void navigator.clipboard.writeText(settings.webhookUrl);
                showToast({ variant: "success", message: "URL do webhook copiada." });
              }}
              disabled={!settings?.webhookUrl}
              className="rounded-lg border border-slate-700 px-3 text-xs text-slate-300 disabled:opacity-50"
            >
              Copiar
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Salvar</button>
          <button type="button" onClick={() => void test()} disabled={busy || !settings?.passwordConfigured} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 disabled:opacity-50">Testar conexão</button>
        </div>
      </div>
    </section>
  );
}
