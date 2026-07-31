import { useCallback, useEffect, useState } from "react";
import { getAiswebSettings, saveAiswebSettings } from "../../lib/aiswebDb";
import {
  AISWEB_CROSSWIND_NOTE,
  AISWEB_DEFAULT_MINIMUMS,
  type AiswebFlightCondition,
  type AiswebOperationalMinimum,
  type AiswebPlatformSettings,
} from "../../types/aisweb";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";
const secondaryButton =
  "inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50";
const tableInputClass =
  "w-full min-w-[5.5rem] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";

function cloneMinimums(source: AiswebOperationalMinimum[]): AiswebOperationalMinimum[] {
  return source.map((row) => ({ ...row }));
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Nunca salvo";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AiswebSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AiswebPlatformSettings | null>(null);
  const [defaultIcao, setDefaultIcao] = useState("");
  const [minimums, setMinimums] = useState<AiswebOperationalMinimum[]>(() =>
    cloneMinimums(AISWEB_DEFAULT_MINIMUMS),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAiswebSettings();
      setSettings(next);
      setDefaultIcao(next.defaultIcao ?? "");
      setMinimums(
        next.minimums?.length
          ? cloneMinimums(next.minimums)
          : cloneMinimums(AISWEB_DEFAULT_MINIMUMS),
      );
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao carregar AISWEB.",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function updateMinimum(
    condition: AiswebFlightCondition,
    field: "ceilingFt" | "visibilityKm" | "maxWindKt",
    raw: string,
  ) {
    const parsed = Number(raw);
    setMinimums((current) =>
      current.map((row) =>
        row.condition === condition
          ? { ...row, [field]: Number.isFinite(parsed) ? parsed : 0 }
          : row,
      ),
    );
  }

  function resetToDefaults() {
    setDefaultIcao("");
    setMinimums(cloneMinimums(AISWEB_DEFAULT_MINIMUMS));
    showToast({ variant: "success", message: "Valores padrão aplicados. Salve para confirmar." });
  }

  async function handleSave() {
    const icao = defaultIcao.trim().toUpperCase();
    if (icao && !/^[A-Z]{4}$/.test(icao)) {
      showToast({ variant: "warning", message: "Informe um ICAO válido com 4 letras." });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveAiswebSettings({
        defaultIcao: icao,
        minimums: minimums.map((row) => ({
          ...row,
          ceilingFt: Math.max(0, Math.round(row.ceilingFt)),
          visibilityKm: Math.max(0, row.visibilityKm),
          maxWindKt: Math.max(0, Math.round(row.maxWindKt)),
        })),
      });
      setSettings(saved);
      setDefaultIcao(saved.defaultIcao ?? "");
      setMinimums(
        saved.minimums?.length
          ? cloneMinimums(saved.minimums)
          : cloneMinimums(AISWEB_DEFAULT_MINIMUMS),
      );
      showToast({ variant: "success", message: "Configuração AISWEB salva." });
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar AISWEB.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-800 bg-slate-900/70">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                <path d="M3.5 12.5a.75.75 0 01.75-.75h5.19l7.1-7.1a1.75 1.75 0 012.475 2.475l-7.1 7.1V19.75a.75.75 0 01-1.5 0v-5.19l-1.72 1.72a.75.75 0 01-1.06-1.06l2.25-2.25H4.25a.75.75 0 01-.75-.75z" />
                <path d="M4 18.25a.75.75 0 000 1.5h6a.75.75 0 000-1.5H4z" />
              </svg>
            </span>
            <div>
              <h2 className="font-semibold text-slate-100">AISWEB</h2>
              <p className="mt-1 text-sm text-slate-500">
                Aeródromo padrão e limites operacionais usados quando a watchlist do usuário está vazia.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
            <p>
              ICAO padrão:{" "}
              <span className={settings?.defaultIcao ? "text-slate-200" : "text-amber-300"}>
                {settings?.defaultIcao || "Não definido"}
              </span>
            </p>
            <p>Atualizado: {formatUpdatedAt(settings?.updatedAt ?? null)}</p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <label className="block max-w-xs text-xs font-medium text-slate-400">
            Aeródromo padrão
            <input
              type="text"
              value={defaultIcao}
              maxLength={4}
              onChange={(event) => setDefaultIcao(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
              placeholder="SBSP"
              className={`${inputClass} font-mono uppercase tracking-widest`}
            />
            <span className="mt-1 block font-normal text-slate-600">
              Código ICAO de 4 letras. Usado como padrão para todos os usuários sem watchlist.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/70">
        <div className="border-b border-slate-800 px-5 py-5 sm:px-6">
          <h2 className="font-semibold text-slate-100">Limites operacionais</h2>
          <p className="mt-1 text-sm text-slate-500">
            Teto, visibilidade e vento máximos por condição de voo.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/40 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Condição</th>
                <th className="px-5 py-3 font-semibold">Teto mínimo (ft)</th>
                <th className="px-5 py-3 font-semibold">Visibilidade mínima (km)</th>
                <th className="px-5 py-3 font-semibold">Vento máximo (kts)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {minimums.map((row) => (
                <tr key={row.condition} className="hover:bg-slate-800/30">
                  <td className="px-5 py-4 font-medium text-slate-200">{row.label}</td>
                  <td className="px-5 py-4">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={row.ceilingFt}
                      onChange={(event) => updateMinimum(row.condition, "ceilingFt", event.target.value)}
                      className={tableInputClass}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={row.visibilityKm}
                      onChange={(event) => updateMinimum(row.condition, "visibilityKm", event.target.value)}
                      className={tableInputClass}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.maxWindKt}
                      onChange={(event) => updateMinimum(row.condition, "maxWindKt", event.target.value)}
                      className={tableInputClass}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-slate-800 px-5 py-4 text-xs text-slate-500 sm:px-6">
          {AISWEB_CROSSWIND_NOTE}
        </p>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 px-5 py-4 sm:px-6">
          <button type="button" onClick={resetToDefaults} disabled={saving} className={secondaryButton}>
            Restaurar padrões
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className={primaryButton}>
            {saving ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
      </section>
    </div>
  );
}
