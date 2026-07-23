import { useState } from "react";
import type {
  AvailableDay,
  CrmAutomationSettings,
  CrmLeadScoreRule,
  CrmQualFollowupRule,
  CrmQualRuleField,
  CrmScoreCompareOp,
  CrmScoreDaysMatchMode,
  CrmScoreRuleField,
} from "../../../types/crm";
import {
  AVAILABLE_DAY_LABELS,
  CRM_AVAILABLE_DAYS,
  CRM_AVAILABLE_PERIOD_OPTIONS,
  CRM_COURSE_OPTIONS,
  CRM_QUAL_RULE_FIELD_LABELS,
  CRM_SCORE_COMPARE_LABELS,
  CRM_SCORE_DAYS_MATCH_LABELS,
  CRM_SCORE_RULE_FIELD_LABELS,
  CRM_START_DATE_OPTIONS,
  CRM_WEEKLY_HOURS_OPTIONS,
} from "../../../types/crm";
import { isDaysScoreField, isNumericScoreField } from "../../../lib/crmLeadScore";

type Props = {
  settings: CrmAutomationSettings;
  saving: boolean;
  onClose: () => void;
  onSave: (settings: CrmAutomationSettings) => void;
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none";

function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-1">
      <span className="block text-[11px] font-medium text-slate-300">{children}</span>
      {hint && <span className="mt-0.5 block text-[10px] text-slate-500">{hint}</span>}
    </div>
  );
}

function answerOptionsForQualField(field: CrmQualRuleField): { value: string; label: string }[] {
  switch (field) {
    case "startDate":
      return [...CRM_START_DATE_OPTIONS];
    case "desiredCourse":
      return CRM_COURSE_OPTIONS.map((c) => ({ value: c, label: c }));
    case "weeklyHours":
      return CRM_WEEKLY_HOURS_OPTIONS.map((h) => ({ value: String(h), label: `${h} h/sem` }));
    case "availablePeriod":
      return [...CRM_AVAILABLE_PERIOD_OPTIONS];
    case "theoreticalExamDone":
      return [
        { value: "true", label: "Já fez banca" },
        { value: "false", label: "Ainda não fez banca" },
      ];
    case "theoreticalStudyStatus":
      return [
        { value: "Não estudo ainda", label: "Não estudo ainda" },
        { value: "Estudo sozinho", label: "Estudo sozinho" },
        { value: "Curso presencial", label: "Curso presencial" },
        { value: "Curso online", label: "Curso online" },
      ];
    default:
      return [];
  }
}

function defaultScoreRule(field: CrmScoreRuleField): CrmLeadScoreRule {
  if (field === "weightKg") {
    return { id: crypto.randomUUID(), field, answerValue: "90", compareOp: "lt", points: 10 };
  }
  if (field === "heightCm") {
    return { id: crypto.randomUUID(), field, answerValue: "180", compareOp: "gt", points: 5 };
  }
  if (field === "availableDays") {
    return {
      id: crypto.randomUUID(),
      field,
      answerValue: "seg,ter,qua,qui,sex",
      matchMode: "all",
      points: 20,
    };
  }
  const opts = answerOptionsForQualField(field as CrmQualRuleField);
  return { id: crypto.randomUUID(), field, answerValue: opts[0]?.value ?? "", points: 10 };
}

function parseSelectedDays(value: string): AvailableDay[] {
  return value
    .split(",")
    .map((d) => d.trim())
    .filter((d): d is AvailableDay => CRM_AVAILABLE_DAYS.includes(d as AvailableDay));
}

function ScoreRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: CrmLeadScoreRule;
  onChange: (patch: Partial<CrmLeadScoreRule>) => void;
  onRemove: () => void;
}) {
  const selectedDays = parseSelectedDays(rule.answerValue);

  function toggleDay(day: AvailableDay) {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    onChange({ answerValue: next.join(",") });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-[var(--bg)] p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <FieldLabel hint="Campo da qualificação usado para pontuar">Campo</FieldLabel>
          <select
            value={rule.field}
            onChange={(e) => {
              const field = e.target.value as CrmScoreRuleField;
              onChange(defaultScoreRule(field));
            }}
            className={inputCls}
          >
            {(Object.keys(CRM_SCORE_RULE_FIELD_LABELS) as CrmScoreRuleField[]).map((f) => (
              <option key={f} value={f}>{CRM_SCORE_RULE_FIELD_LABELS[f]}</option>
            ))}
          </select>
        </label>

        <label>
          <FieldLabel hint="Pontos somados ao score quando a regra bater">Pontos</FieldLabel>
          <input
            inputMode="numeric"
            value={String(rule.points)}
            onChange={(e) => onChange({ points: Number(e.target.value) })}
            className={inputCls}
          />
        </label>
      </div>

      {isNumericScoreField(rule.field) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <FieldLabel hint="Como comparar o valor informado pelo lead">Comparador</FieldLabel>
            <select
              value={rule.compareOp ?? "eq"}
              onChange={(e) => onChange({ compareOp: e.target.value as CrmScoreCompareOp })}
              className={inputCls}
            >
              {(Object.keys(CRM_SCORE_COMPARE_LABELS) as CrmScoreCompareOp[]).map((op) => (
                <option key={op} value={op}>{CRM_SCORE_COMPARE_LABELS[op]}</option>
              ))}
            </select>
          </label>
          <label>
            <FieldLabel hint={rule.field === "weightKg" ? "Peso em quilogramas" : "Altura em centímetros"}>
              {rule.field === "weightKg" ? "Peso (kg)" : "Altura (cm)"}
            </FieldLabel>
            <input
              inputMode="decimal"
              value={rule.answerValue}
              onChange={(e) => onChange({ answerValue: e.target.value })}
              className={inputCls}
            />
          </label>
        </div>
      )}

      {isDaysScoreField(rule.field) && (
        <div className="space-y-2">
          <label>
            <FieldLabel hint="Define se o lead precisa ter todos os dias ou apenas um deles">Modo de correspondência</FieldLabel>
            <select
              value={rule.matchMode ?? "all"}
              onChange={(e) => onChange({ matchMode: e.target.value as CrmScoreDaysMatchMode })}
              className={inputCls}
            >
              {(Object.keys(CRM_SCORE_DAYS_MATCH_LABELS) as CrmScoreDaysMatchMode[]).map((mode) => (
                <option key={mode} value={mode}>{CRM_SCORE_DAYS_MATCH_LABELS[mode]}</option>
              ))}
            </select>
          </label>
          <div>
            <FieldLabel hint="Marque os dias que o lead precisa ter na disponibilidade">Dias da semana</FieldLabel>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CRM_AVAILABLE_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    selectedDays.includes(day)
                      ? "bg-sky-600 text-white"
                      : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {AVAILABLE_DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isNumericScoreField(rule.field) && !isDaysScoreField(rule.field) && (
        <label>
          <FieldLabel hint="Resposta exata que o lead precisa ter">Valor da resposta</FieldLabel>
          <select
            value={rule.answerValue}
            onChange={(e) => onChange({ answerValue: e.target.value })}
            className={inputCls}
          >
            {answerOptionsForQualField(rule.field as CrmQualRuleField).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg border border-red-900/50 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/30"
        >
          Remover regra
        </button>
      </div>
    </div>
  );
}

export function CrmAutomationSettingsModal({ settings, saving, onClose, onSave }: Props) {
  const [tab, setTab] = useState<"fups" | "score" | "perda">("fups");
  const [qualRules, setQualRules] = useState(settings.qualFollowupRules);
  const [scoreRules, setScoreRules] = useState(settings.scoreRules);
  const [lossReasons, setLossReasons] = useState(settings.lossReasons);
  const [newLossReason, setNewLossReason] = useState("");

  function addQualRule() {
    setQualRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        field: "startDate",
        answerValue: "60_dias",
        followups: [{ id: crypto.randomUUID(), title: "", days: 30 }],
      },
    ]);
  }

  function updateQualRule(id: string, patch: Partial<CrmQualFollowupRule>) {
    setQualRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addQualFollowup(ruleId: string) {
    setQualRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, followups: [...r.followups, { id: crypto.randomUUID(), title: "", days: 7 }] }
          : r,
      ),
    );
  }

  function addScoreRule() {
    setScoreRules((prev) => [...prev, defaultScoreRule("startDate")]);
  }

  function updateScoreRule(id: string, patch: Partial<CrmLeadScoreRule>) {
    setScoreRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addLossReason() {
    const label = newLossReason.trim();
    if (!label) return;
    if (lossReasons.some((item) => item.toLowerCase() === label.toLowerCase())) {
      setNewLossReason("");
      return;
    }
    setLossReasons((prev) => [...prev, label]);
    setNewLossReason("");
  }

  function submit() {
    const cleanedQual = qualRules
      .map((rule) => ({
        ...rule,
        followups: rule.followups
          .map((f) => ({ ...f, title: f.title.trim(), days: Math.max(0, Math.round(f.days)) }))
          .filter((f) => f.title),
      }))
      .filter((rule) => rule.answerValue && rule.followups.length > 0);

    const cleanedScore = scoreRules
      .map((r) => ({
        ...r,
        points: Math.round(Number(r.points) || 0),
        answerValue: r.answerValue.trim(),
      }))
      .filter((r) => r.answerValue && (isDaysScoreField(r.field) ? parseSelectedDays(r.answerValue).length > 0 : true));

    const cleanedLossReasons = lossReasons.map((item) => item.trim()).filter(Boolean);

    onSave({
      qualFollowupRules: cleanedQual,
      scoreRules: cleanedScore,
      lossReasons: cleanedLossReasons,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Automações do CRM</h2>
            <p className="mt-1 text-xs text-slate-500">FUPs, pontuação e motivos de perda</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-800 px-5 pt-3">
          {([
            ["fups", "FUPs automáticos"],
            ["score", "Lead score"],
            ["perda", "Motivos de perda"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-3 py-2 text-xs font-medium transition ${
                tab === id ? "bg-slate-800 text-sky-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "fups" ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Quando o lead preenche a qualificação, FUPs são criados com base na resposta escolhida.
                Os dias são contados a partir da data do preenchimento.
              </p>
              {qualRules.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">
                  Nenhuma regra configurada.
                </p>
              ) : (
                qualRules.map((rule) => (
                  <div key={rule.id} className="rounded-lg border border-slate-800 bg-[var(--bg)] p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label>
                        <FieldLabel hint="Pergunta da qualificação que dispara os FUPs">Campo da qualificação</FieldLabel>
                        <select
                          value={rule.field}
                          onChange={(e) => {
                            const field = e.target.value as CrmQualRuleField;
                            const opts = answerOptionsForQualField(field);
                            updateQualRule(rule.id, { field, answerValue: opts[0]?.value ?? "" });
                          }}
                          className={inputCls}
                        >
                          {(Object.keys(CRM_QUAL_RULE_FIELD_LABELS) as CrmQualRuleField[]).map((f) => (
                            <option key={f} value={f}>{CRM_QUAL_RULE_FIELD_LABELS[f]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <FieldLabel hint="Resposta que o lead precisa ter selecionado">Resposta do lead</FieldLabel>
                        <select
                          value={rule.answerValue}
                          onChange={(e) => updateQualRule(rule.id, { answerValue: e.target.value })}
                          className={inputCls}
                        >
                          {answerOptionsForQualField(rule.field).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => setQualRules((prev) => prev.filter((r) => r.id !== rule.id))}
                          className="w-full rounded-lg border border-red-900/50 px-2 py-1.5 text-xs text-red-300 hover:bg-red-950/30"
                        >
                          Remover regra
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <FieldLabel hint="Cada FUP será agendado X dias após o preenchimento da qualificação">
                        Follow-ups desta regra
                      </FieldLabel>
                      <div className="mb-1 grid grid-cols-[1fr_90px_auto] gap-2 px-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                        <span>Título do FUP</span>
                        <span>Dias depois</span>
                        <span />
                      </div>
                      {rule.followups.map((fup) => (
                        <div key={fup.id} className="grid grid-cols-[1fr_90px_auto] gap-2">
                          <input
                            value={fup.title}
                            onChange={(e) =>
                              setQualRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id
                                    ? {
                                        ...r,
                                        followups: r.followups.map((f) =>
                                          f.id === fup.id ? { ...f, title: e.target.value } : f,
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                            placeholder="Ex: Check-in meio período"
                            className={inputCls}
                          />
                          <input
                            inputMode="numeric"
                            value={String(fup.days)}
                            onChange={(e) =>
                              setQualRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id
                                    ? {
                                        ...r,
                                        followups: r.followups.map((f) =>
                                          f.id === fup.id ? { ...f, days: Number(e.target.value) } : f,
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setQualRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id
                                    ? { ...r, followups: r.followups.filter((f) => f.id !== fup.id) }
                                    : r,
                                ),
                              )
                            }
                            className="text-xs text-slate-500 hover:text-red-300"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addQualFollowup(rule.id)}
                        className="text-xs text-sky-400 hover:text-sky-300"
                      >
                        + Adicionar FUP nesta regra
                      </button>
                    </div>
                  </div>
                ))
              )}
              <button type="button" onClick={addQualRule} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                Adicionar regra de FUP
              </button>
            </div>
          ) : tab === "score" ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Configure pontos por resposta, peso, altura ou dias disponíveis. O score do lead é a soma de todas as regras que batem.
              </p>
              {scoreRules.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">
                  Nenhuma regra de pontuação.
                </p>
              ) : (
                scoreRules.map((rule) => (
                  <ScoreRuleEditor
                    key={rule.id}
                    rule={rule}
                    onChange={(patch) => updateScoreRule(rule.id, patch)}
                    onRemove={() => setScoreRules((prev) => prev.filter((r) => r.id !== rule.id))}
                  />
                ))
              )}
              <button type="button" onClick={addScoreRule} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                Adicionar regra de pontos
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Motivos padronizados exibidos ao marcar um lead como perdido. O select é obrigatório.
              </p>
              {lossReasons.length === 0 ? (
                <p className="rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">
                  Nenhum motivo configurado.
                </p>
              ) : (
                <div className="space-y-2">
                  {lossReasons.map((item, index) => (
                    <div key={`${item}-${index}`} className="flex items-center gap-2">
                      <input
                        value={item}
                        onChange={(e) => {
                          const value = e.target.value;
                          setLossReasons((prev) => prev.map((current, i) => (i === index ? value : current)));
                        }}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() => setLossReasons((prev) => prev.filter((_, i) => i !== index))}
                        className="shrink-0 rounded-lg border border-red-900/50 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/30"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newLossReason}
                  onChange={(e) => setNewLossReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLossReason();
                    }
                  }}
                  placeholder="Novo motivo de perda"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={addLossReason}
                  disabled={!newLossReason.trim()}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
