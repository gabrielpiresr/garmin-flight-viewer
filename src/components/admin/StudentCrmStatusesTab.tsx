import { useEffect, useState } from "react";
import {
  archiveStudentCrmStatus,
  listStudentCrmProfiles,
  listStudentCrmStatuses,
  saveStudentCrmStatus,
  setStudentCrmProfileStatus,
} from "../../lib/studentAutomationsDb";
import type {
  StudentCrmProfile,
  StudentCrmStatus,
  StudentCrmStatusInput,
} from "../../types/studentAutomation";
import { useToast } from "../ui/ToastProvider";
import { Skeleton } from "../ui/Skeleton";

const EMPTY: StudentCrmStatusInput = {
  name: "",
  color: "#10b981",
  order: 10,
  isDefault: false,
  archived: false,
};

function StatusEditor({
  value,
  onClose,
  onSaved,
}: {
  value: StudentCrmStatus | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<StudentCrmStatusInput>(() =>
    value
      ? {
          name: value.name,
          color: value.color,
          order: value.order,
          isDefault: value.isDefault,
          archived: value.archived,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await saveStudentCrmStatus(draft, value?.id);
      showToast({ variant: "success", message: "Status CRM salvo." });
      onSaved();
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">
          {value ? "Editar status" : "Novo status"}
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_100px]">
          <label className="text-xs text-slate-400">
            Nome
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            Cor
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              className="mt-1 h-10 w-full rounded border border-slate-700 bg-slate-900 p-1"
            />
          </label>
          <label className="text-xs text-slate-400">
            Ordem
            <input
              type="number"
              value={draft.order}
              onChange={(e) =>
                setDraft({ ...draft, order: Number(e.target.value) })
              }
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) =>
                setDraft({ ...draft, isDefault: e.target.checked })
              }
              className="accent-emerald-500"
            />
            Status inicial
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-slate-400"
          >
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudentCrmStatusesTab() {
  const { showToast } = useToast();
  const [statuses, setStatuses] = useState<StudentCrmStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StudentCrmStatus | "new" | null>(null);
  const [profiles, setProfiles] = useState<StudentCrmProfile[]>([]);
  const [query, setQuery] = useState("");
  async function load() {
    setLoading(true);
    try {
      const [nextStatuses, nextProfiles] = await Promise.all([
        listStudentCrmStatuses(),
        listStudentCrmProfiles(),
      ]);
      setStatuses(nextStatuses);
      setProfiles(nextProfiles);
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Falha ao carregar status.",
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function archive(status: StudentCrmStatus) {
    if (
      !window.confirm(
        `Arquivar “${status.name}”? Alunos existentes conservarão o vínculo.`,
      )
    )
      return;
    try {
      await archiveStudentCrmStatus(status.id);
      await load();
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Falha ao arquivar.",
      });
    }
  }
  async function changeProfile(profile: StudentCrmProfile, statusId: string) {
    try {
      await setStudentCrmProfileStatus(profile.studentUserId, statusId);
      const selectedStatus = statuses.find((status) => status.id === statusId);
      setProfiles((current) =>
        current.map((item) =>
          item.studentUserId === profile.studentUserId
            ? {
                ...item,
                statusId,
                statusName: selectedStatus?.name || "Sem status",
                statusColor: selectedStatus?.color || "#64748b",
                changedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      showToast({ variant: "success", message: "Status do aluno alterado." });
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Falha ao alterar status.",
      });
    }
  }
  const visibleProfiles = profiles.filter((profile) =>
    `${profile.studentName} ${profile.email} ${profile.statusName}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Relacionamento
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Status CRM do aluno
          </h2>
          <p className="text-sm text-slate-400">
            Etapas separadas do acesso ao sistema. Alterá-las nunca bloqueia o
            login.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          Novo status
        </button>
      </section>
      {loading ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="divide-y divide-slate-800">
              {statuses.map((status) => (
                <div
                  key={status.id}
                  className={`flex items-center justify-between gap-4 bg-slate-900/45 p-4 ${status.archived ? "opacity-50" : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                    <div>
                      <p className="font-medium text-white">{status.name}</p>
                      <p className="text-xs text-slate-500">
                        Ordem {status.order}
                        {status.isDefault ? " · status inicial" : ""}
                        {status.archived ? " · arquivado" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(status)}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                    >
                      Editar
                    </button>
                    {!status.archived ? (
                      <button
                        onClick={() => void archive(status)}
                        className="rounded border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300"
                      >
                        Arquivar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Alunos por status</h3>
                <p className="text-xs text-slate-500">
                  Mudança manual também pode disparar automações.
                </p>
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar aluno"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="divide-y divide-slate-800">
              {visibleProfiles.map((profile) => (
                <div
                  key={profile.studentUserId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {profile.studentName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {profile.email}
                    </p>
                  </div>
                  <select
                    value={profile.statusId}
                    onChange={(e) =>
                      void changeProfile(profile, e.target.value)
                    }
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Sem status</option>
                    {statuses
                      .filter(
                        (status) =>
                          !status.archived || status.id === profile.statusId,
                      )
                      .map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {editing ? (
        <StatusEditor
          value={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
