import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { executeAnacSync } from "../lib/anacSync";
import { BUCKET_ID, storage } from "../lib/appwrite";
import { getProfile, updateProfileFields, type PilotProfile } from "../lib/rbac";
import { Skeleton } from "./ui/Skeleton";
import { PilotProfilePanel } from "./PilotProfilePanel";
import { useToast } from "./ui/ToastProvider";

type EditForm = { phone: string; weight_kg: string; height_cm: string };

export function AlunoProfileDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ phone: "", weight_kg: "", height_cm: "" });
  const [saving, setSaving] = useState(false);

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

  function openEdit() {
    if (!profile) return;
    setEditForm({
      phone: profile.phone ?? "",
      weight_kg: profile.weightKg != null ? String(profile.weightKg) : "",
      height_cm: profile.heightCm != null ? String(profile.heightCm) : "",
    });
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!user?.id) return;
    setSaving(true);
    const kg = Number(editForm.weight_kg.replace(",", "."));
    const cm = Number(editForm.height_cm.replace(",", "."));
    const { data, error } = await updateProfileFields(user.id, {
      phone: editForm.phone.trim() || undefined,
      weight_kg: Number.isFinite(kg) && kg > 0 ? kg : undefined,
      height_cm: Number.isFinite(cm) && cm > 0 ? cm : undefined,
    });
    if (error) {
      showToast({ variant: "error", message: error.message });
    } else {
      if (data) setProfile(data);
      setEditing(false);
      showToast({ variant: "success", message: "Dados atualizados com sucesso." });
    }
    setSaving(false);
  }

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
    <div className="space-y-4">
      {editing && (
        <div className="rounded-xl border border-sky-700/40 bg-sky-950/30 p-4">
          <p className="mb-3 text-sm font-semibold text-sky-300">Editar dados pessoais</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-slate-400">
              Telefone
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Peso (kg)
              <input
                type="number"
                min={30}
                max={200}
                step={0.1}
                value={editForm.weight_kg}
                onChange={(e) => setEditForm((f) => ({ ...f, weight_kg: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Altura (cm)
              <input
                type="number"
                min={100}
                max={250}
                step={1}
                value={editForm.height_cm}
                onChange={(e) => setEditForm((f) => ({ ...f, height_cm: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSaveEdit()}
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <PilotProfilePanel
        profile={profile}
        photoUrl={photoUrl}
        photoAlt="Foto do aluno ANAC"
        eyebrow="Perfil"
        title="Dados do aluno"
        description="Dados cadastrais e informações importadas da ANAC."
        onProfileUpdated={setProfile}
        childrenBeforeAnac={
          !editing ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openEdit}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Editar dados pessoais
              </button>
            </div>
          ) : undefined
        }
        action={{
          label: "Atualizar da ANAC",
          loadingLabel: "Atualizando...",
          loading: syncing,
          onClick: () => void syncNow(),
        }}
      />
    </div>
  );
}
