import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { BUCKET_ID, storage } from "../../lib/appwrite";
import { getProfile, type PilotProfile } from "../../lib/rbac";
import type { SchedulePeriod } from "../../types/schedule";
import { PilotProfilePanel } from "../PilotProfilePanel";

const DAYS = [1, 2, 3, 4, 5, 6] as const;
const DAY_LABEL: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const PERIOD_LABEL: Record<SchedulePeriod, string> = { morning: "Manhã", afternoon: "Tarde" };

export function InstructorProfileTab() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: profileError } = await getProfile(user.id);
    if (profileError) {
      setError(profileError.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const photoUrl = useMemo(() => {
    if (!profile?.anacPhotoFileId || !storage || !BUCKET_ID) return "";
    return storage.getFileView(BUCKET_ID, profile.anacPhotoFileId).toString();
  }, [profile?.anacPhotoFileId]);

  const availabilityByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of profile?.instructorAvailability ?? []) {
      map.set(`${row.dayOfWeek}-${row.period}`, row.availabilityType === "preferred" ? "Preferencial" : "Disponível");
    }
    return map;
  }, [profile?.instructorAvailability]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        Carregando perfil...
      </div>
    );
  }

  if (error) {
    return <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-3 text-sm text-red-300">{error}</p>;
  }

  if (!profile) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">Perfil do instrutor não encontrado.</p>;
  }

  return (
    <PilotProfilePanel
      profile={profile}
      photoUrl={photoUrl}
      photoAlt="Foto do instrutor ANAC"
      title="Dados do instrutor"
      description="Dados cadastrais, informações da ANAC e disponibilidade semanal."
      childrenBeforeAnac={
        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Disponibilidade semanal</p>
            <p className="text-xs text-slate-600">Somente horários informados para montagem da escala.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-20 pb-1" />
                  {DAYS.map((day) => (
                    <th key={day} className="pb-1 text-center text-xs font-semibold text-slate-400">
                      {DAY_LABEL[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["morning", "afternoon"] as const).map((period) => (
                  <tr key={period}>
                    <td className="pr-2 text-right text-[11px] text-slate-500">{PERIOD_LABEL[period]}</td>
                    {DAYS.map((day) => {
                      const value = availabilityByKey.get(`${day}-${period}`);
                      return (
                        <td key={day} className="p-0">
                          <div
                            className={`flex h-9 items-center justify-center rounded-md border text-[10px] font-semibold ${
                              value
                                ? "border-sky-500/50 bg-sky-600/20 text-sky-200"
                                : "border-slate-700/60 bg-slate-800/30 text-slate-600"
                            }`}
                          >
                            {value ?? "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      }
    />
  );
}
