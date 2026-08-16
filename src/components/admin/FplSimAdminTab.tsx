import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { FPL_PROTIP_FIELDS } from "../../lib/fplSimCatalog";
import { getFplProTips, saveFplProTips } from "../../lib/fplSimDb";
import { getFplHelp } from "../../lib/fplMcaHelp";
import { useToast } from "../ui/ToastProvider";

export function FplSimAdminTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tips, setTips] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.schoolId) return;
    void getFplProTips(user.schoolId).then((data) => {
      setTips(data);
      setLoading(false);
    });
  }, [user?.schoolId]);

  async function save() {
    if (!user?.schoolId) return;
    setSaving(true);
    try {
      await saveFplProTips(user.schoolId, tips);
      showToast({ variant: "success", message: "Pro-tips salvos. Os alunos veem no (i) de cada campo." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao salvar." });
    }
    setSaving(false);
  }

  const groups = Array.from(new Set(FPL_PROTIP_FIELDS.map((field) => field.group)));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Simulador FPL</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Ferramenta de estudo isolada. A ajuda automática de cada campo já traz o texto da MCA 100-11. Aqui você
          acrescenta um Pro-tip da escola (procedimento local, exemplo da frota, erro comum dos alunos).
        </p>
      </div>
      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-800/60" />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-3 text-sm font-semibold text-sky-300">{group}</h3>
              <div className="space-y-4">
                {FPL_PROTIP_FIELDS.filter((field) => field.group === group).map((field) => {
                  const help = getFplHelp(field.id);
                  return (
                    <label key={field.id} className="block space-y-1.5">
                      <span className="text-sm text-slate-200">{field.label}</span>
                      <p className="text-[11px] text-slate-500">
                        MCA: {help.mcaRef} — {help.body.slice(0, 140)}
                        {help.body.length > 140 ? "…" : ""}
                      </p>
                      <textarea
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                        rows={2}
                        value={tips[field.id] ?? ""}
                        onChange={(e) => setTips((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder="Pro-tip opcional da escola"
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar Pro-tips"}
          </button>
        </div>
      )}
    </div>
  );
}
