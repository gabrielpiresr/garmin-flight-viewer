function addDaysIso(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toISOString();
}

function normalizeCrmStatus(value) {
  const valid = new Set([
    "novo_lead",
    "aguardando_qualificacao",
    "aguardando_proposta",
    "proposta_enviada",
    "registro_enviado",
    "registro_preenchido",
    "aguardando_transferencia",
    "matricula_enviada",
    "aguardando_assinatura_pagamento",
    "ground_agendado",
    "cadastro_anac",
    "aluno_pronto",
    "lead_perdido",
  ]);
  const migrations = {
    qualificacao: "aguardando_qualificacao",
    orcamento_enviado: "proposta_enviada",
    matricula: "registro_enviado",
    proposta_aceita: "registro_enviado",
    aguardando_assinatura: "aguardando_assinatura_pagamento",
    aguardando_pagamento: "aguardando_assinatura_pagamento",
  };
  const raw = String(value || "").trim();
  if (migrations[raw]) return migrations[raw];
  return valid.has(raw) ? raw : "novo_lead";
}

function parseStatusFollowups(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const title = String(item?.title || "").trim();
        const days = Math.max(0, Math.round(Number(item?.days) || 0));
        if (!title) return null;
        return { title, days };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getStatusSetting(settings, status) {
  const normalized = normalizeCrmStatus(status);
  const found = settings.find((item) => normalizeCrmStatus(item.status) === normalized);
  return found || { status: normalized, followups: [], expirationDays: null };
}

function buildFollowupsForStatus(status, enteredAt, templates) {
  const normalized = normalizeCrmStatus(status);
  return templates.map((template) => ({
    id: crypto.randomUUID(),
    status: normalized,
    title: template.title,
    triggeredAt: addDaysIso(enteredAt, template.days),
    completedAt: null,
  }));
}

function parseLeadFollowups(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const id = String(item?.id || "").trim();
        const title = String(item?.title || "").trim();
        const triggeredAt = String(item?.triggeredAt || "").trim();
        if (!id || !title || !triggeredAt) return null;
        return {
          id,
          status: normalizeCrmStatus(item?.status),
          title,
          triggeredAt,
          completedAt: item?.completedAt ? String(item.completedAt) : null,
          manual: Boolean(item?.manual),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildLeadStatusMove(lead, targetStatus, settings, options = {}) {
  const enteredAt = options.enteredAt || new Date().toISOString();
  const normalizedTarget = normalizeCrmStatus(targetStatus);
  const setting = getStatusSetting(settings, normalizedTarget);
  const existingFollowups = parseLeadFollowups(lead.followups_json);
  const manualFollowups = existingFollowups.filter((item) => item.manual);
  return {
    crm_status: normalizedTarget,
    status_entered_at: enteredAt,
    funnel_entered_at: lead.funnel_entered_at || lead.funnelEnteredAt || enteredAt,
    followups_json: JSON.stringify([
      ...buildFollowupsForStatus(normalizedTarget, enteredAt, setting.followups || []),
      ...manualFollowups,
    ]),
  };
}

function toStatusSettingFromDoc(doc) {
  return {
    status: normalizeCrmStatus(doc.status),
    followups: parseStatusFollowups(doc.followups_json),
    expirationDays:
      typeof doc.expiration_days === "number" && doc.expiration_days >= 0
        ? Math.round(doc.expiration_days)
        : null,
  };
}

module.exports = {
  addDaysIso,
  normalizeCrmStatus,
  parseStatusFollowups,
  getStatusSetting,
  buildFollowupsForStatus,
  buildLeadStatusMove,
  toStatusSettingFromDoc,
};
