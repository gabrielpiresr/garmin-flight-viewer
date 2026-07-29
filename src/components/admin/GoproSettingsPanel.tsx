import { useCallback, useEffect, useMemo, useState } from "react";
import { getGoproSettings, listGoproPublicLinks, saveGoproSettings } from "../../lib/goproDb";
import type { GoproMediaLink, GoproPublicLinksResult, GoproSettings, GoproSettingsInput } from "../../types/gopro";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const inputClass = "mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";
const secondaryButton = "inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50";

const emptyForm: GoproSettingsInput = {
  email: "",
  password: "",
  accessToken: "",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatBytes(value: number | null): string {
  if (!value || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function statusClass(item: GoproMediaLink): string {
  if (item.source === "created") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  if (item.publicUrl) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function statusLabel(item: GoproMediaLink): string {
  if (item.source === "created") return "Criado agora";
  if (item.source === "cached") return "Cache interno";
  if (item.publicUrl) return "Publico";
  return "Sem link";
}

function copyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M7 3.5A1.5 1.5 0 018.5 2h7A1.5 1.5 0 0117 3.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 10.5v-7z" />
      <path d="M3 7.5A1.5 1.5 0 014.5 6H5v8h8v.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14.5v-7z" />
    </svg>
  );
}

function refreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466.75.75 0 10-1.061 1.06 7 7 0 0011.697-3.138.75.75 0 00-1.435-.388zM4.688 8.576a5.5 5.5 0 019.201-2.466.75.75 0 101.061-1.06A7 7 0 003.253 8.188a.75.75 0 101.435.388z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M3.25 4A.75.75 0 014 3.25h3A.75.75 0 017.75 4v3A.75.75 0 016.5 7.56L4.22 5.28A.75.75 0 013.25 4zm13.5 12a.75.75 0 01-.75.75h-3a.75.75 0 01-.75-.75v-3a.75.75 0 011.28-.53l2.25 2.25c.14.14.22.331.22.53z" clipRule="evenodd" />
    </svg>
  );
}

function linkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M12.232 4.232a3 3 0 114.243 4.243l-2.122 2.121a3 3 0 01-4.242 0 .75.75 0 011.06-1.06 1.5 1.5 0 002.122 0l2.121-2.122a1.5 1.5 0 10-2.121-2.121l-.536.536a.75.75 0 01-1.06-1.061l.535-.536z" />
      <path d="M7.768 15.768a3 3 0 11-4.243-4.243l2.122-2.121a3 3 0 014.242 0 .75.75 0 11-1.06 1.06 1.5 1.5 0 00-2.122 0l-2.121 2.122a1.5 1.5 0 102.121 2.121l.536-.536a.75.75 0 011.06 1.061l-.535.536z" />
      <path d="M12.657 7.343a.75.75 0 010 1.061l-4.253 4.253a.75.75 0 11-1.061-1.061l4.253-4.253a.75.75 0 011.061 0z" />
    </svg>
  );
}

export function GoproSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<GoproSettings | null>(null);
  const [form, setForm] = useState<GoproSettingsInput>(emptyForm);
  const [result, setResult] = useState<GoproPublicLinksResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<"list" | "create" | null>(null);
  const [query, setQuery] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getGoproSettings();
      setSettings(next);
      setForm({ email: next.email, password: "", accessToken: "" });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar GoPro." });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function save() {
    if (!form.email.trim()) {
      showToast({ variant: "warning", message: "Informe o login da GoPro." });
      return;
    }
    if (!form.password?.trim() && !form.accessToken?.trim() && !settings?.passwordConfigured && !settings?.accessTokenConfigured) {
      showToast({ variant: "warning", message: "Informe a senha da GoPro." });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveGoproSettings({
        email: form.email.trim(),
        password: form.password?.trim() || undefined,
        accessToken: form.accessToken?.trim() || undefined,
      });
      setSettings(saved);
      setForm({ email: saved.email, password: "", accessToken: "" });
      showToast({ variant: "success", message: "Credenciais GoPro salvas." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao salvar GoPro." });
    } finally {
      setSaving(false);
    }
  }

  async function sync(ensurePublic: boolean) {
    setSyncing(ensurePublic ? "create" : "list");
    try {
      const next = await listGoproPublicLinks(ensurePublic);
      setResult(next);
      const latest = await getGoproSettings().catch(() => null);
      if (latest) setSettings(latest);
      showToast({
        variant: next.errors.length ? "warning" : "success",
        message: ensurePublic
          ? `${next.links.length} links prontos. ${next.errors.length} arquivos ficaram pendentes.`
          : `${next.links.length} links publicos encontrados.`,
      });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao consultar GoPro." });
    } finally {
      setSyncing(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ variant: "success", message: "Link copiado." });
    } catch {
      showToast({ variant: "warning", message: "Nao foi possivel copiar automaticamente." });
    }
  }

  const filtered = useMemo(() => {
    const items = result?.media ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => `${item.filename} ${item.title} ${item.type} ${item.id}`.toLowerCase().includes(term));
  }, [query, result]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const canQuery = Boolean(settings?.passwordConfigured || form.password?.trim() || settings?.accessTokenConfigured || form.accessToken?.trim());

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-800 bg-slate-900/70">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                <path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v13a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 18.5v-13zm3 1.25a.75.75 0 000 1.5h10a.75.75 0 000-1.5H7zm0 4.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5H7zm0 4.5a.75.75 0 000 1.5h7a.75.75 0 000-1.5H7z" />
              </svg>
            </span>
            <div>
              <h2 className="font-semibold text-slate-100">GoPro</h2>
              <p className="mt-1 text-sm text-slate-500">Links publicos da biblioteca GoPro do admin.</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            <p>Login: <span className={settings?.email ? "text-slate-200" : "text-amber-300"}>{settings?.email || "Nao salvo"}</span></p>
            <p>Sessao: <span className={settings?.passwordConfigured || settings?.accessTokenConfigured ? "text-emerald-300" : "text-amber-300"}>{settings?.passwordConfigured ? "Renova pelo login" : settings?.accessTokenConfigured ? "Token salvo" : "Pendente"}</span></p>
            <p>Ultima sync: {formatDate(settings?.lastSyncAt)}</p>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <label className="text-xs font-medium text-slate-400">
            Login GoPro
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="admin@gopro.com" className={inputClass} />
          </label>
          <label className="text-xs font-medium text-slate-400">
            Senha GoPro
            <input type="password" value={form.password ?? ""} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={settings?.passwordConfigured ? "Senha ja salva" : "Senha"} className={inputClass} />
          </label>
          <label className="text-xs font-medium text-slate-400 sm:col-span-2">
            gp_access_token opcional
            <input type="password" value={form.accessToken ?? ""} onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))} placeholder={settings?.accessTokenConfigured ? "Token ja salvo" : "Token da sessao web GoPro"} className={inputClass} />
            <span className="mt-1 block font-normal text-slate-600">O sistema renova a sessao com login e senha. Use este campo apenas como fallback manual.</span>
          </label>
        </div>

        {settings?.lastError ? (
          <p className="mx-5 mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 sm:mx-6">
            Ultimo erro: {settings.lastError}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 px-5 py-4 sm:px-6">
          <button type="button" onClick={() => void save()} disabled={saving} className={secondaryButton}>
            {saving ? "Salvando..." : "Salvar credenciais"}
          </button>
          <button type="button" onClick={() => void sync(false)} disabled={syncing !== null || !canQuery} className={secondaryButton}>
            {refreshIcon()}
            {syncing === "list" ? "Carregando..." : "Carregar links"}
          </button>
          <button type="button" onClick={() => void sync(true)} disabled={syncing !== null || !canQuery} className={primaryButton}>
            {linkIcon()}
            {syncing === "create" ? "Sincronizando..." : "Sincronizar e criar links"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/70">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-100">Arquivos e links</h2>
            <p className="mt-1 text-sm text-slate-500">
              {result ? `${result.links.length} com link, ${result.missing.length} sem link, ${result.totalItems} arquivos consultados.` : "Nenhuma consulta executada."}
            </p>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar arquivo..." className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500 sm:max-w-xs" />
        </div>

        {result?.errors.length ? (
          <div className="border-b border-slate-800 px-5 py-4 sm:px-6">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              <p className="font-semibold">Arquivos pendentes</p>
              <ul className="mt-2 space-y-1">
                {result.errors.slice(0, 5).map((error) => (
                  <li key={error.mediaId}>{error.filename || error.mediaId}: {error.message}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {!result ? (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-800 text-slate-500">{linkIcon()}</div>
              <p className="mt-4 text-sm font-medium text-slate-300">Carregue a biblioteca para ver os links publicos</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid min-h-56 place-items-center p-8 text-center text-sm text-slate-500">Nenhum arquivo encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-950/40 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Arquivo</th>
                  <th className="px-5 py-3 font-semibold">Captura</th>
                  <th className="px-5 py-3 font-semibold">Tamanho</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Link publico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="max-w-sm px-5 py-4">
                      <p className="truncate font-medium text-slate-200">{item.filename || item.title || item.id}</p>
                      <p className="mt-1 truncate text-xs text-slate-600">{item.type || item.fileExtension || "GoPro"} {item.cameraModel ? `- ${item.cameraModel}` : ""}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-400">{formatDate(item.capturedAt || item.createdAt)}</td>
                    <td className="px-5 py-4 text-slate-400">{formatBytes(item.fileSize)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item)}`}>{statusLabel(item)}</span>
                    </td>
                    <td className="min-w-80 px-5 py-4">
                      {item.publicUrl ? (
                        <div className="flex items-center gap-2">
                          <a href={item.publicUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-xs text-cyan-300 hover:text-cyan-200">
                            {item.publicUrl}
                          </a>
                          <button type="button" onClick={() => void copy(item.publicUrl)} title="Copiar link" aria-label="Copiar link" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800">
                            {copyIcon()}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">Pendente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
