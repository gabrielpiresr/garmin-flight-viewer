import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { executeAnacSync } from "../lib/anacSync";
import { BUCKET_ID, storage } from "../lib/appwrite";
import { getProfile, type PilotProfile } from "../lib/rbac";
import { Skeleton } from "./ui/Skeleton";
import { PilotProfilePanel } from "./PilotProfilePanel";
import { useToast } from "./ui/ToastProvider";

export function AlunoProfileDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await getProfile(user.id);
    if (error) {
      showToast({ variant: "error", message: error.message });
      setProfile(null);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }, [showToast, user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const photoUrl = useMemo(() => {
    if (!profile?.anacPhotoFileId || !storage || !BUCKET_ID) return "";
    return storage.getFileView(BUCKET_ID, profile.anacPhotoFileId).toString();
  }, [profile?.anacPhotoFileId]);

  const syncNow = async () => {
    if (!profile) return;
    if (!profile.cpf || !profile.anacCode) {
      showToast({ variant: "warning", message: "CPF e código ANAC são obrigatórios para sincronizar." });
      return;
    }
    setSyncing(true);
    const result = await executeAnacSync({
      cpf: profile.cpf,
      anacCode: profile.anacCode,
      birthDate: profile.birthDate,
    });
    showToast({ variant: result.error ? "error" : result.pending ? "warning" : "success", message: result.message });
    await loadProfile();
    setSyncing(false);
  };

  if (loading) {
    return (
      <section className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Skeleton className="h-36 w-28 rounded-lg" />
            <div className="space-y-2 pt-1">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4 space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
        <p className="text-sm text-amber-300">Perfil do aluno ainda não foi encontrado.</p>
      </section>
    );
  }

  return (
    <PilotProfilePanel
      profile={profile}
      photoUrl={photoUrl}
      photoAlt="Foto do aluno ANAC"
      eyebrow="Perfil"
      title="Dados do aluno"
      description="Dados cadastrais e informações importadas da ANAC."
      onProfileUpdated={setProfile}
      action={{
        label: "Atualizar da ANAC",
        loadingLabel: "Atualizando...",
        loading: syncing,
        onClick: () => void syncNow(),
      }}
    />
  );
}
