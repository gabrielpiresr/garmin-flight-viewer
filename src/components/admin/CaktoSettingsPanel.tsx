import { useEffect, useState } from "react";
import { getCaktoSettings, saveCaktoSettings, testCaktoConnection } from "../../lib/caktoDb";
import type { CaktoSettings } from "../../types/cakto";
import { useToast } from "../ui/ToastProvider";

const inputCls = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none";

export function CaktoSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<CaktoSettings | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCaktoSettings().then((value) => {
      setSettings(value);
      setClientId(value.clientId);
      setProductId(value.productId);
    }).catch((error) => showToast({ variant: "error", message: error.message }));
  }, [showToast]);

  async function save() {
    setBusy(true);
    try {
      const value = await saveCaktoSettings({ clientId, clientSecret: clientSecret || null, productId });
      setSettings(value);
      setClientSecret("");
      showToast({ variant: "success", message: "Configuração Cakto salva." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await testCaktoConnection();
      showToast({ variant: "success", message: "Conexão com a Cakto validada." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function copyWebhook() {
    if (!settings?.webhookUrl) return;
    await navigator.clipboard.writeText(settings.webhookUrl);
    showToast({ variant: "success", message: "URL do webhook copiada." });
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Integração Cakto</h3>
        <p className="mt-1 text-xs text-slate-500">As credenciais são usadas somente pela Appwrite Function.</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-slate-400">Client ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-slate-400">Client Secret
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={settings?.secretConfigured ? "Já configurado" : ""} className={inputCls} />
        </label>
        <label className="text-xs text-slate-400 md:col-span-2">Product ID padrão
          <input value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/40 p-3">
        <p className="text-xs font-medium text-slate-300">URL para configurar em Integrações &gt; Webhooks na Cakto</p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={settings?.webhookUrl || "Disponível após o deploy da função cakto-webhook"} className={`${inputCls} mt-0 font-mono text-xs`} />
          <button type="button" onClick={() => void copyWebhook()} disabled={!settings?.webhookUrl} className="rounded-lg border border-slate-700 px-3 text-xs text-slate-300 disabled:opacity-50">Copiar</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Selecione os eventos financeiros de compra, cobrança, reembolso e chargeback.</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Salvar</button>
        <button type="button" onClick={() => void test()} disabled={busy || !settings?.secretConfigured} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 disabled:opacity-50">Testar conexão</button>
      </div>
    </section>
  );
}
