import { useCallback, useEffect, useState } from "react";

import { getReferAndEarnConfig, saveReferAndEarnConfig } from "../../lib/referAndEarnDb";

import { uploadManeuverMedia } from "../../lib/maneuversDb";

import { richContentToHtml } from "../../lib/maneuverContent";

import { normalizeReferralProgram } from "../../lib/richContentFields";

import type { ReferralProgramConfig } from "../../types/referAndEarn";

import { ManeuverRichTextEditor } from "./ManeuverRichTextEditor";

import { Skeleton } from "../ui/Skeleton";

import { useToast } from "../ui/ToastProvider";



type ProgramDraft = ReferralProgramConfig;



function emptyProgram(): ProgramDraft {

  return normalizeReferralProgram({ active: false, prize: "", requiredHours: 10 });

}



function ProgramEditor({

  title,

  draft,

  onChange,

  disabled,

}: {

  title: string;

  draft: ProgramDraft;

  onChange: (next: ProgramDraft) => void;

  disabled: boolean;

}) {

  return (

    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5">

      <div className="flex items-center justify-between gap-3">

        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>

        <label className="inline-flex items-center gap-2 text-sm text-slate-300">

          <input

            type="checkbox"

            checked={draft.active}

            disabled={disabled}

            onChange={(e) => onChange({ ...draft, active: e.target.checked })}

            className="rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/30"

          />

          Ativo

        </label>

      </div>



      <div>

        <label className="mb-1.5 block text-sm font-medium text-slate-300">Prêmio</label>

        <input

          type="text"

          value={draft.prize}

          disabled={disabled}

          onChange={(e) => onChange({ ...draft, prize: e.target.value })}

          placeholder="Ex.: 1 hora de simulador grátis"

          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"

        />

      </div>



      <div>

        <label className="mb-1.5 block text-sm font-medium text-slate-300">Horas que o indicado deve cumprir</label>

        <input

          type="number"

          min={1}

          step={1}

          value={draft.requiredHours}

          disabled={disabled}

          onChange={(e) => onChange({ ...draft, requiredHours: Math.max(1, Number(e.target.value) || 1) })}

          className="w-full max-w-xs rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"

        />

      </div>



      <div>

        <label className="mb-1.5 block text-sm font-medium text-slate-300">Regras</label>

        <ManeuverRichTextEditor

          value={draft.rulesJson}

          disabled={disabled}

          placeholder="Descreva as regras do programa..."

          onChange={(rulesJson) => onChange({ ...draft, rulesJson })}

          onUploadMedia={async (file) => {

            const { data } = await uploadManeuverMedia(file);

            return data;

          }}

        />

      </div>

    </div>

  );

}



export function ReferAndEarnSettingsPanel() {

  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [aluno, setAluno] = useState<ProgramDraft>(emptyProgram());

  const [instrutor, setInstrutor] = useState<ProgramDraft>(emptyProgram());

  const [updatedAt, setUpdatedAt] = useState<string | null>(null);



  const load = useCallback(async () => {

    setLoading(true);

    try {

      const config = await getReferAndEarnConfig();

      setAluno(normalizeReferralProgram(config.aluno));

      setInstrutor(normalizeReferralProgram(config.instrutor));

      setUpdatedAt(config.updatedAt);

    } catch (e) {

      showToast({ variant: "error", message: (e as Error).message });

    } finally {

      setLoading(false);

    }

  }, [showToast]);



  useEffect(() => {

    void load();

  }, [load]);



  async function handleSave() {

    setSaving(true);

    try {

      const payload = {

        aluno: {

          ...aluno,

          rulesHtml: richContentToHtml(aluno.rulesJson),

        },

        instrutor: {

          ...instrutor,

          rulesHtml: richContentToHtml(instrutor.rulesJson),

        },

      };

      const saved = await saveReferAndEarnConfig(payload);

      setAluno(normalizeReferralProgram(saved.aluno));

      setInstrutor(normalizeReferralProgram(saved.instrutor));

      setUpdatedAt(saved.updatedAt);

      showToast({ variant: "success", message: "Programa Indique e ganhe salvo." });

    } catch (e) {

      showToast({ variant: "error", message: (e as Error).message });

    } finally {

      setSaving(false);

    }

  }



  if (loading) {

    return (

      <div className="space-y-4">

        <Skeleton className="h-10 w-64" />

        <Skeleton className="h-64 w-full" />

      </div>

    );

  }



  return (

    <div className="space-y-6">

      <div>

        <h2 className="text-lg font-semibold text-slate-100">Indique e ganhe</h2>

        <p className="mt-1 text-sm text-slate-400">

          Configure programas separados para alunos e instrutores. A aba nos portais também depende das permissões em Roles.

        </p>

        {updatedAt ? (

          <p className="mt-2 text-xs text-slate-500">

            Última atualização: {new Date(updatedAt).toLocaleString("pt-BR")}

          </p>

        ) : (

          <p className="mt-2 text-xs text-slate-500">Ainda não salvo — usando defaults.</p>

        )}

      </div>



      <div className="grid gap-6 xl:grid-cols-2">

        <ProgramEditor title="Programa Aluno" draft={aluno} onChange={setAluno} disabled={saving} />

        <ProgramEditor title="Programa Instrutor" draft={instrutor} onChange={setInstrutor} disabled={saving} />

      </div>



      <div className="flex justify-end">

        <button

          type="button"

          onClick={() => void handleSave()}

          disabled={saving}

          className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"

        >

          {saving ? "Salvando..." : "Salvar configurações"}

        </button>

      </div>

    </div>

  );

}


