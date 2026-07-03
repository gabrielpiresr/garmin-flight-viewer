import { useState } from "react";
import { defaultOnboardingStepsForMode } from "../../lib/scheduleStudentHelpDefaults";
import { buildAllSystemFaqPreviews } from "../../lib/scheduleSystemFaqs";
import { createEmptyRichContent, richContentToPlainText } from "../../lib/maneuverContent";
import { hasRichTextContent } from "../../lib/richContentFields";
import type { FlightScheduleRules } from "../../types/schoolRules";
import type { ScheduleCustomFaq, ScheduleOnboardingStep, ScheduleStudentHelpConfig } from "../../types/scheduleStudentHelp";
import { ManeuverRichTextEditor } from "./ManeuverRichTextEditor";
import { uploadManeuverMedia } from "../../lib/maneuversDb";

type ScheduleStudentHelpSectionProps = {
  schedule: FlightScheduleRules;
  helpConfig: ScheduleStudentHelpConfig;
  onChange: (next: ScheduleStudentHelpConfig) => void;
};

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function ScheduleStudentHelpSection({ schedule, helpConfig, onChange }: ScheduleStudentHelpSectionProps) {
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [draftFaq, setDraftFaq] = useState<ScheduleCustomFaq | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [draftStep, setDraftStep] = useState<ScheduleOnboardingStep | null>(null);

  const systemPreviews = buildAllSystemFaqPreviews(schedule, helpConfig.systemFaqTitles);

  function patchHelp(patch: Partial<ScheduleStudentHelpConfig>) {
    onChange({ ...helpConfig, ...patch });
  }

  function restoreDefaultOnboarding() {
    patchHelp({ onboardingSteps: defaultOnboardingStepsForMode(schedule.mode) });
  }

  function saveStepDraft() {
    if (!draftStep || !draftStep.title.trim() || !hasRichTextContent(draftStep.descriptionJson)) return;
    const steps = [...helpConfig.onboardingSteps];
    const index = steps.findIndex((s) => s.id === draftStep.id);
    if (index >= 0) steps[index] = draftStep;
    else steps.push(draftStep);
    patchHelp({ onboardingSteps: steps.sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 5) });
    setEditingStepId(null);
    setDraftStep(null);
  }

  function removeStep(id: string) {
    patchHelp({ onboardingSteps: helpConfig.onboardingSteps.filter((s) => s.id !== id) });
  }

  function moveStep(id: string, direction: -1 | 1) {
    const steps = [...helpConfig.onboardingSteps].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = steps.findIndex((s) => s.id === id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= steps.length) return;
    const order = steps.map((s) => s.sortOrder);
    [order[index], order[swap]] = [order[swap], order[index]];
    patchHelp({
      onboardingSteps: steps.map((s, i) => ({ ...s, sortOrder: order[i] })),
    });
  }

  function saveFaqDraft() {
    if (!draftFaq || !draftFaq.title.trim() || !hasRichTextContent(draftFaq.answerJson)) return;
    const faqs = [...helpConfig.customFaqs];
    const index = faqs.findIndex((f) => f.id === draftFaq.id);
    if (index >= 0) faqs[index] = draftFaq;
    else faqs.push(draftFaq);
    patchHelp({ customFaqs: faqs.sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 10) });
    setEditingFaqId(null);
    setDraftFaq(null);
  }

  function removeFaq(id: string) {
    patchHelp({ customFaqs: helpConfig.customFaqs.filter((f) => f.id !== id) });
  }

  function moveFaq(id: string, direction: -1 | 1) {
    const faqs = [...helpConfig.customFaqs].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = faqs.findIndex((f) => f.id === id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= faqs.length) return;
    const order = faqs.map((f) => f.sortOrder);
    [order[index], order[swap]] = [order[swap], order[index]];
    patchHelp({
      customFaqs: faqs.map((f, i) => ({ ...f, sortOrder: order[i] })),
    });
  }

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-6">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Ajuda para o aluno</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Onboarding no primeiro acesso à Escala e perguntas frequentes exibidas no botão &quot;Preciso de ajuda&quot;.
        </p>
      </div>

      {/* Onboarding */}
      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={helpConfig.onboardingEnabled}
              onChange={(e) => patchHelp({ onboardingEnabled: e.target.checked })}
            />
            Ativar onboarding no primeiro acesso
          </label>
          <button
            type="button"
            onClick={restoreDefaultOnboarding}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            Restaurar conteúdo padrão
          </button>
        </div>

        <div className="space-y-2">
          {helpConfig.onboardingSteps
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((step, index, arr) => (
              <div key={step.id} className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                {editingStepId === step.id && draftStep ? (
                  <div className="space-y-3">
                    <input
                      value={draftStep.title}
                      onChange={(e) => setDraftStep({ ...draftStep, title: e.target.value })}
                      placeholder="Título do passo"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                    />
                    <ManeuverRichTextEditor
                      value={draftStep.descriptionJson}
                      placeholder="Descreva este passo..."
                      onChange={(descriptionJson) => setDraftStep({ ...draftStep, descriptionJson })}
                      onUploadMedia={async (file) => {
                        const { data } = await uploadManeuverMedia(file);
                        return data;
                      }}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={saveStepDraft} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white">
                        Salvar passo
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingStepId(null); setDraftStep(null); }}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200">{step.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {richContentToPlainText(step.descriptionJson)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" disabled={index === 0} onClick={() => moveStep(step.id, -1)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-40">↑</button>
                      <button type="button" disabled={index === arr.length - 1} onClick={() => moveStep(step.id, 1)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-40">↓</button>
                      <button
                        type="button"
                        onClick={() => { setEditingStepId(step.id); setDraftStep({ ...step }); }}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
                      >
                        Editar
                      </button>
                      <button type="button" onClick={() => removeStep(step.id)} className="rounded border border-red-900/50 px-2 py-1 text-xs text-red-400">Remover</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>

        {helpConfig.onboardingSteps.length < 5 ? (
          <button
            type="button"
            onClick={() => {
              const step: ScheduleOnboardingStep = {
                id: newId("step"),
                title: "",
                descriptionJson: createEmptyRichContent(),
                sortOrder: helpConfig.onboardingSteps.length,
              };
              setEditingStepId(step.id);
              setDraftStep(step);
            }}
            className="rounded-lg border border-dashed border-slate-600 px-3 py-2 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-300"
          >
            + Adicionar passo
          </button>
        ) : null}
      </div>

      {/* System FAQs */}
      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
        <div>
          <h4 className="text-sm font-medium text-slate-200">Perguntas automáticas</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Geradas das regras acima. Você pode personalizar o título ou desativar a pergunta.
          </p>
        </div>
        <div className="space-y-2">
          {systemPreviews.map((item) => {
            const enabled = helpConfig.systemFaqEnabled[item.id] !== false;
            const customTitle = helpConfig.systemFaqTitles[item.id] ?? "";
            const hasCustomTitle = customTitle.trim().length > 0 && customTitle.trim() !== item.defaultTitle;
            return (
              <div
                key={item.id}
                className={`rounded-lg border p-3 ${item.appliesToMode ? "border-slate-700/60 bg-slate-900/50" : "border-slate-800/60 bg-slate-950/40 opacity-60"}`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        patchHelp({
                          systemFaqEnabled: { ...helpConfig.systemFaqEnabled, [item.id]: e.target.checked },
                        })
                      }
                    />
                  </label>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-sky-950/50 px-1.5 py-0.5 text-[10px] text-sky-400">Automática</span>
                      {!item.appliesToMode ? (
                        <span className="text-[10px] text-slate-500">Não se aplica ao modo atual</span>
                      ) : null}
                    </div>
                    <label className="block text-[11px] text-slate-500">
                      Título exibido ao aluno
                      <input
                        type="text"
                        value={customTitle}
                        placeholder={item.defaultTitle}
                        onChange={(e) => {
                          const next = e.target.value;
                          const titles = { ...helpConfig.systemFaqTitles };
                          if (!next.trim() || next.trim() === item.defaultTitle) {
                            delete titles[item.id];
                          } else {
                            titles[item.id] = next;
                          }
                          patchHelp({ systemFaqTitles: titles });
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500"
                      />
                    </label>
                    {hasCustomTitle ? (
                      <p className="text-[10px] text-slate-600">Padrão: {item.defaultTitle}</p>
                    ) : null}
                    <p className="line-clamp-2 text-xs text-slate-500">{item.plainText}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom FAQs */}
      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
        <div>
          <h4 className="text-sm font-medium text-slate-200">Perguntas personalizadas</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">Conteúdo exclusivo da escola, exibido após as automáticas.</p>
        </div>

        <div className="space-y-2">
          {helpConfig.customFaqs
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((faq, index, arr) => (
              <div key={faq.id} className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                {editingFaqId === faq.id && draftFaq ? (
                  <div className="space-y-3">
                    <input
                      value={draftFaq.title}
                      onChange={(e) => setDraftFaq({ ...draftFaq, title: e.target.value })}
                      placeholder="Pergunta"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                    />
                    <ManeuverRichTextEditor
                      value={draftFaq.answerJson}
                      placeholder="Escreva a resposta..."
                      onChange={(answerJson) => setDraftFaq({ ...draftFaq, answerJson })}
                      onUploadMedia={async (file) => {
                        const { data } = await uploadManeuverMedia(file);
                        return data;
                      }}
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={draftFaq.enabled}
                        onChange={(e) => setDraftFaq({ ...draftFaq, enabled: e.target.checked })}
                      />
                      Ativa para alunos
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={saveFaqDraft} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white">
                        Salvar pergunta
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingFaqId(null); setDraftFaq(null); }}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200">
                        {faq.title}
                        {!faq.enabled ? <span className="ml-2 text-xs text-slate-500">(inativa)</span> : null}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{richContentToPlainText(faq.answerJson)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" disabled={index === 0} onClick={() => moveFaq(faq.id, -1)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-40">↑</button>
                      <button type="button" disabled={index === arr.length - 1} onClick={() => moveFaq(faq.id, 1)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-40">↓</button>
                      <button
                        type="button"
                        onClick={() => { setEditingFaqId(faq.id); setDraftFaq({ ...faq }); }}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
                      >
                        Editar
                      </button>
                      <button type="button" onClick={() => removeFaq(faq.id)} className="rounded border border-red-900/50 px-2 py-1 text-xs text-red-400">Remover</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>

        {helpConfig.customFaqs.length < 10 ? (
          <button
            type="button"
            onClick={() => {
              const faq: ScheduleCustomFaq = {
                id: newId("faq"),
                title: "",
                answerJson: createEmptyRichContent(),
                sortOrder: helpConfig.customFaqs.length,
                enabled: true,
              };
              setEditingFaqId(faq.id);
              setDraftFaq(faq);
            }}
            className="rounded-lg border border-dashed border-slate-600 px-3 py-2 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-300"
          >
            + Adicionar pergunta
          </button>
        ) : null}
      </div>
    </section>
  );
}
