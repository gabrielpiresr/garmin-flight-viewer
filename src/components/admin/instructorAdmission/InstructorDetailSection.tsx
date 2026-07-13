import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminUserDetail, updateAdminUserInstructorPreferences } from "../../../lib/adminUsersDb";
import type { AdminUserDetail } from "../../../types/adminUsers";
import type { AvailabilityType } from "../../../types/planning";
import type { InstructorPreferenceLevel, SchedulePeriod } from "../../../types/schedule";
import { InstructorCostsSection } from "../InstructorCostsSection";
import { Skeleton } from "../../ui/Skeleton";
import { useToast } from "../../ui/ToastProvider";

const INSTRUCTOR_DAYS = [1, 2, 3, 4, 5, 6] as const;
const DAY_LABEL: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const PERIOD_LABEL: Record<SchedulePeriod, string> = { morning: "Manhã", afternoon: "Tarde", night: "Noite" };
const PREFERENCE_LABEL: Record<InstructorPreferenceLevel, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};
const AVAIL_CYCLE: Array<AvailabilityType | undefined> = [undefined, "available", "preferred", "blocked"];
const AUTOSAVE_DELAY_MS = 600;

function availKey(dayOfWeek: number, period: SchedulePeriod): string {
  return `${dayOfWeek}-${period}`;
}

function cycleAvailability(current: AvailabilityType | undefined): AvailabilityType | undefined {
  const idx = AVAIL_CYCLE.indexOf(current);
  return AVAIL_CYCLE[(idx + 1) % AVAIL_CYCLE.length];
}

function availabilityCellClass(value: AvailabilityType | undefined): string {
  if (value === "preferred") return "bg-emerald-600 border-emerald-500 text-white";
  if (value === "available") return "bg-sky-600 border-sky-500 text-white";
  if (value === "blocked") return "bg-red-600 border-red-500 text-white";
  return "bg-slate-800/40 border-slate-700/60 text-slate-600 hover:border-slate-600 hover:bg-slate-700/40";
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function InstructorDetailSection({ userId }: { userId: string }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [preference, setPreference] = useState<InstructorPreferenceLevel>("medium");
  const [availability, setAvailability] = useState<Record<string, AvailabilityType>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const snapshotRef = useRef("");
  const hydratedRef = useRef(false);
  const userRef = useRef<AdminUserDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setLoading(true);
    void getAdminUserDetail(userId)
      .then((detail) => {
        if (cancelled) return;
        userRef.current = detail;
        const nextPreference = detail.profile.instructorPreferenceLevel ?? "medium";
        const nextAvailability: Record<string, AvailabilityType> = {};
        for (const row of detail.profile.instructorAvailability ?? []) {
          nextAvailability[availKey(row.dayOfWeek, row.period)] = row.availabilityType;
        }
        setPreference(nextPreference);
        setAvailability(nextAvailability);
        snapshotRef.current = JSON.stringify({ preference: nextPreference, availability: nextAvailability });
        hydratedRef.current = true;
      })
      .catch(() => {
        if (!cancelled) showToast({ variant: "error", message: "Falha ao carregar preferências do instrutor." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, showToast]);

  const persistPreferences = useCallback(async () => {
    if (!userRef.current) return;
    const serialized = JSON.stringify({ preference, availability });
    if (serialized === snapshotRef.current) return;

    setSaveStatus("saving");
    try {
      const availabilityRows = Object.entries(availability).map(([key, availabilityType]) => {
        const dashIdx = key.indexOf("-");
        return {
          dayOfWeek: Number(key.slice(0, dashIdx)),
          period: key.slice(dashIdx + 1) as SchedulePeriod,
          availabilityType,
        };
      });
      const updated = await updateAdminUserInstructorPreferences(userRef.current, {
        preferenceLevel: preference,
        availability: availabilityRows,
      });
      userRef.current = updated;
      snapshotRef.current = serialized;
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar preferências.",
      });
    }
  }, [availability, preference, showToast]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const serialized = JSON.stringify({ preference, availability });
    if (serialized === snapshotRef.current) return;

    setSaveStatus("idle");
    const timer = window.setTimeout(() => {
      void persistPreferences();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [preference, availability, persistPreferences]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Preferência padrão do instrutor
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">Usada como ponto de partida em instrutores da semana.</p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === "saving" && <span className="text-xs text-slate-500">Salvando...</span>}
            {saveStatus === "saved" && <span className="text-xs text-emerald-400">Salvo</span>}
            {saveStatus === "error" && <span className="text-xs text-red-400">Erro ao salvar</span>}
            <label className="text-xs text-slate-400">
              Preferência
              <select
                value={preference}
                disabled={loading}
                onChange={(e) => setPreference(e.target.value as InstructorPreferenceLevel)}
                className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 disabled:opacity-50"
              >
                {(["low", "medium", "high"] as const).map((level) => (
                  <option key={level} value={level}>
                    {PREFERENCE_LABEL[level]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-20 pb-1" />
                  {INSTRUCTOR_DAYS.map((day) => (
                    <th key={day} className="pb-1 text-center text-xs font-semibold text-slate-400">
                      {DAY_LABEL[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["morning", "afternoon", "night"] as const).map((period) => (
                  <tr key={period}>
                    <td className="pr-2 text-right text-[11px] text-slate-500">{PERIOD_LABEL[period]}</td>
                    {INSTRUCTOR_DAYS.map((day) => {
                      const key = availKey(day, period);
                      const value = availability[key];
                      return (
                        <td key={day} className="p-0">
                          <button
                            type="button"
                            onClick={() => {
                              setAvailability((prev) => {
                                const next = { ...prev };
                                const cycled = cycleAvailability(prev[key]);
                                if (!cycled) delete next[key];
                                else next[key] = cycled;
                                return next;
                              });
                            }}
                            aria-label={`${DAY_LABEL[day]} ${PERIOD_LABEL[period]}`}
                            className={`h-8 w-full rounded-md border transition-all duration-75 ${availabilityCellClass(value)}`}
                          >
                            {value === "preferred" ? <span className="text-[10px] font-bold">*</span> : null}
                            {value === "available" ? <span className="text-[10px]">ok</span> : null}
                            {value === "blocked" ? <span className="text-[10px] font-bold">✕</span> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Clique nas células para alternar: vazio → disponível → preferido → bloqueado. As alterações são salvas automaticamente.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Repasses e comissões
        </h3>
        <InstructorCostsSection instructorUserId={userId} autoSave />
      </section>
    </div>
  );
}
