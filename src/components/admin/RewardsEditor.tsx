import { useCallback, useEffect, useMemo, useState } from "react";
import { SCHOOL_ID } from "../../lib/appwrite";
import { DEFAULT_REWARD_ICON_ID, REWARD_ICONS } from "../../lib/rewardIcons";
import {
  defaultRewardInput,
  deleteJourneyReward,
  listJourneyRewards,
  saveJourneyReward,
  uploadRewardImage,
} from "../../lib/rewardsDb";
import type {
  JourneyReward,
  JourneyRewardInput,
  RewardCondition,
  RewardKind,
  RewardMetric,
  RewardOperator,
  RewardVisual,
} from "../../types/rewards";
import { RewardIcon } from "../rewards/RewardIcon";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const schoolId = SCHOOL_ID ?? "escola_principal";

const METRIC_LABELS: Record<RewardMetric, string> = {
  flight_count: "Quantidade de voos",
  total_hours: "Horas totais",
  total_distance_nm: "Distância total (NM)",
  total_landings: "Quantidade de pousos",
  smooth_landings: "Pousos suaves",
  smooth_landing_rate: "% pousos suaves",
  smooth_landing_streak: "Sequência de pousos suaves",
  weekly_streak: "Semanas consecutivas",
  longest_flight_distance_nm: "Maior voo em distância (NM)",
  longest_flight_duration_min: "Maior voo em tempo (min)",
  solo_flight_count: "Voos solo",
  solo_hours: "Horas solo",
  night_hours: "Horas noturnas",
  ifr_hours: "Horas IFR",
  navigation_hours: "Horas de navegação",
  navigation_distance_nm: "Distância de navegação (NM)",
  navigation_flight_count: "Voos de navegação",
  mission_completed_count: "Missões concluídas",
  stage_completed_count: "Etapas concluídas",
};

const METRICS = Object.keys(METRIC_LABELS) as RewardMetric[];
const OPERATORS: Array<{ id: RewardOperator; label: string }> = [
  { id: "gte", label: "maior ou igual" },
  { id: "lte", label: "menor ou igual" },
  { id: "eq", label: "igual" },
];

function emptyCondition(): RewardCondition {
  return { metric: "flight_count", operator: "gte", value: 1 };
}

function inputFromReward(reward: JourneyReward | null, kind: RewardKind, trackId: string | null): JourneyRewardInput {
  if (!reward) return defaultRewardInput(kind, trackId);
  return {
    schoolId: reward.schoolId,
    kind: reward.kind,
    trackId: reward.trackId,
    title: reward.title,
    description: reward.description,
    visual: reward.visual,
    rules: reward.rules,
    isActive: reward.isActive,
    order: reward.order,
  };
}

function normalizeVisual(visual: RewardVisual): RewardVisual {
  if (visual.type === "uploadedImage") return visual;
  return {
    type: "libraryIcon",
    iconId: visual.iconId || DEFAULT_REWARD_ICON_ID,
    colorMode: visual.colorMode ?? "school",
    color: visual.color,
  };
}

function libraryVisual(iconId: string, colorMode: "school" | "custom" = "school", color?: string): RewardVisual {
  return { type: "libraryIcon", iconId: iconId || DEFAULT_REWARD_ICON_ID, colorMode, color };
}

type Props = {
  kind: RewardKind;
  trackId?: string | null;
  title: string;
  subtitle: string;
  schoolColor?: string;
};

export function RewardsEditor({ kind, trackId = null, title, subtitle, schoolColor = "#10b981" }: Props) {
  const { showToast } = useToast();
  const [items, setItems] = useState<JourneyReward[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JourneyRewardInput>(() => defaultRewardInput(kind, trackId));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listJourneyRewards({ kind, trackId, includeInactive: true, schoolId });
    if (result.error) {
      setError(result.error.message);
      setItems([]);
    } else {
      setItems(result.data);
      if (selectedId && !result.data.some((item) => item.id === selectedId)) {
        setSelectedId(null);
        setEditing(false);
      }
    }
    setLoading(false);
  }, [kind, selectedId, trackId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedId(null);
    setDraft(defaultRewardInput(kind, trackId));
    setEditing(false);
  }, [kind, trackId]);

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  function startNew() {
    setSelectedId(null);
    setDraft(defaultRewardInput(kind, trackId));
    setEditing(true);
  }

  function startEdit(item: JourneyReward) {
    setSelectedId(item.id);
    setDraft(inputFromReward(item, kind, trackId));
    setEditing(true);
  }

  async function save() {
    if (!draft.title.trim()) {
      setError("Informe o título.");
      return;
    }
    if (draft.rules.conditions.length === 0) {
      setError("Adicione ao menos uma regra.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveJourneyReward(selected?.id ?? null, {
      ...draft,
      schoolId,
      kind,
      trackId: kind === "achievement" ? trackId : null,
      visual: normalizeVisual(draft.visual),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: kind === "badge" ? "Badge salvo." : "Conquista salva." });
    setSelectedId(result.data?.id ?? null);
    setEditing(false);
    await load();
  }

  async function remove() {
    if (!selected) return;
    const result = await deleteJourneyReward(selected.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    showToast({ variant: "success", message: kind === "badge" ? "Badge removido." : "Conquista removida." });
    setSelectedId(null);
    setDraft(defaultRewardInput(kind, trackId));
    setEditing(false);
    await load();
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    const result = await uploadRewardImage(file);
    setUploading(false);
    if (result.error || !result.visual) {
      setError(result.error?.message ?? "Falha no upload.");
      return;
    }
    setDraft((prev) => ({ ...prev, visual: result.visual! }));
  }

  function updateCondition(index: number, patch: Partial<RewardCondition>) {
    setDraft((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        conditions: prev.rules.conditions.map((condition, idx) => (idx === index ? { ...condition, ...patch } : condition)),
      },
    }));
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-56 rounded-xl" />
      </section>
    );
  }

  const visual = draft.visual;
  const isLibrary = visual.type === "libraryIcon";
  const itemLabel = kind === "badge" ? "badge" : "conquista";

  return (
    <section className="space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <button type="button" onClick={startNew} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
          + Adicionar {itemLabel}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
                  <RewardIcon visual={item.visual} schoolColor={schoolColor} className="h-8 w-8" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-100">{item.title}</h4>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${item.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>
                      {item.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{item.description || "Sem descrição."}</p>
                </div>
              </div>
              <button type="button" onClick={() => startEdit(item)} className="rounded-lg border border-cyan-600/60 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/10">
                Ver / editar
              </button>
            </div>
          </article>
        ))}
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/30 p-4 text-sm text-slate-400">
            Nenhum item cadastrado. Use o botão acima para criar o primeiro.
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-4 rounded-xl border border-cyan-500/30 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-cyan-100">
              {selected ? `Editar ${itemLabel}` : `Novo ${itemLabel}`}
            </h4>
            <div className="flex gap-2">
              {selected ? (
                <button type="button" onClick={() => void remove()} className="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40">
                  Remover
                </button>
              ) : null}
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                Fechar
              </button>
              <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_10rem]">
            <label className="text-xs text-slate-400">
              Título
              <input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
            </label>
            <label className="text-xs text-slate-400">
              Ordem
              <input type="number" value={draft.order} onChange={(e) => setDraft((prev) => ({ ...prev, order: Number(e.target.value) || 0 }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.checked }))} />
              Ativo
            </label>
            <label className="text-xs text-slate-400 lg:col-span-3">
              Descrição
              <textarea value={draft.description} onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500" />
            </label>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
              <div className="mb-3 flex w-full max-w-sm rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs">
                <button type="button" onClick={() => setDraft((prev) => ({ ...prev, visual: libraryVisual(DEFAULT_REWARD_ICON_ID) }))} className={`flex-1 rounded-md px-3 py-1.5 ${isLibrary ? "bg-cyan-600 text-white" : "text-slate-400"}`}>
                  Biblioteca
                </button>
                <label className={`flex flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-1.5 ${!isLibrary ? "bg-cyan-600 text-white" : "text-slate-400"}`}>
                  {uploading ? "Enviando..." : "Upload"}
                  <input type="file" accept="image/*" onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)} className="hidden" />
                </label>
              </div>

              {isLibrary ? (
                <>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-7">
                    {REWARD_ICONS.map((icon) => (
                      <button
                        key={icon.id}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            visual: libraryVisual(icon.id, visual.type === "libraryIcon" ? visual.colorMode : "school", visual.type === "libraryIcon" ? visual.color : undefined),
                          }))
                        }
                        className={`rounded-lg border p-2 text-center text-xs ${
                          visual.type === "libraryIcon" && visual.iconId === icon.id
                            ? "border-cyan-400 bg-cyan-500/10 text-cyan-100"
                            : "border-slate-700 bg-slate-950/60 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <RewardIcon visual={{ type: "libraryIcon", iconId: icon.id, colorMode: "school" }} schoolColor={schoolColor} className="mx-auto h-7 w-7" />
                        <span className="mt-1 block truncate">{icon.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/50 p-3 text-sm text-slate-300">
                      <input
                        type="radio"
                        checked={visual.type === "libraryIcon" && visual.colorMode !== "custom"}
                        onChange={() => setDraft((prev) => ({ ...prev, visual: libraryVisual(visual.type === "libraryIcon" ? visual.iconId : DEFAULT_REWARD_ICON_ID) }))}
                      />
                      Cor da escola
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/50 p-3 text-sm text-slate-300">
                      <input
                        type="radio"
                        checked={visual.type === "libraryIcon" && visual.colorMode === "custom"}
                        onChange={() =>
                          setDraft((prev) => ({
                            ...prev,
                            visual: libraryVisual(visual.type === "libraryIcon" ? visual.iconId : DEFAULT_REWARD_ICON_ID, "custom", visual.type === "libraryIcon" ? visual.color ?? schoolColor : schoolColor),
                          }))
                        }
                      />
                      Cor customizada
                      <input
                        type="color"
                        value={visual.type === "libraryIcon" ? visual.color ?? schoolColor : schoolColor}
                        onChange={(e) => setDraft((prev) => ({ ...prev, visual: libraryVisual(visual.type === "libraryIcon" ? visual.iconId : DEFAULT_REWARD_ICON_ID, "custom", e.target.value) }))}
                        className="ml-auto h-7 w-9 rounded border border-slate-700 bg-transparent"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">
                  Imagem importada selecionada. Para trocar, envie outro arquivo.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Preview</p>
              <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
                <RewardIcon visual={draft.visual} schoolColor={schoolColor} className="h-12 w-12" />
                <p className="mt-3 font-semibold text-slate-100">{draft.title || "Título"}</p>
                <p className="mt-1 text-xs text-slate-400">{draft.description || "Descrição da recompensa."}</p>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 opacity-70">
                <RewardIcon visual={draft.visual} achieved={false} schoolColor={schoolColor} className="h-12 w-12" />
                <p className="mt-3 font-semibold text-slate-500">{draft.title || "Bloqueado"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Regras</h4>
                <p className="text-xs text-slate-500">Combine condições com lógica E/OU.</p>
              </div>
              <select
                value={draft.rules.mode}
                onChange={(e) => setDraft((prev) => ({ ...prev, rules: { ...prev.rules, mode: e.target.value === "any" ? "any" : "all" } }))}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="all">Todas as regras</option>
                <option value="any">Qualquer regra</option>
              </select>
            </div>
            <div className="mt-3 space-y-2">
              {draft.rules.conditions.map((condition, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2 lg:grid-cols-[minmax(16rem,1fr)_12rem_8rem_auto]">
                  <select value={condition.metric} onChange={(e) => updateCondition(index, { metric: e.target.value as RewardMetric })} className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100">
                    {METRICS.map((metric) => <option key={metric} value={metric}>{METRIC_LABELS[metric]}</option>)}
                  </select>
                  <select value={condition.operator} onChange={(e) => updateCondition(index, { operator: e.target.value as RewardOperator })} className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100">
                    {OPERATORS.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
                  </select>
                  <input type="number" value={condition.value} onChange={(e) => updateCondition(index, { value: Number(e.target.value) || 0 })} className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100" />
                  <button type="button" onClick={() => setDraft((prev) => ({ ...prev, rules: { ...prev.rules, conditions: prev.rules.conditions.filter((_, idx) => idx !== index) } }))} className="rounded border border-red-900/60 px-2 py-1.5 text-xs text-red-300 hover:bg-red-950/40">
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, rules: { ...prev.rules, conditions: [...prev.rules.conditions, emptyCondition()] } }))} className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
              Adicionar regra
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
