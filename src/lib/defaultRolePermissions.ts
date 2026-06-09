import type {
  ActionKey,
  AdminTabKey,
  InstructorTabKey,
  RolePermissions,
  StudentTabKey,
} from "../types/rolePermissions";

// ─── Admin: acesso total ──────────────────────────────────────────────────────

const ALL_ADMIN_TABS: AdminTabKey[] = [
  "home",
  "schedule", "schedule.voos", "schedule.disponibilidades", "schedule.gerador", "schedule.configuracoes",
  "students",
  "reports", "reports.all-flights", "reports.relatorios", "reports.assinaturas", "reports.sem-telemetria", "reports.alertas",
  "fleet", "fleet.avioes", "fleet.modelos", "fleet.programa", "fleet.ordens-servico",
  "contents", "contents.manobras", "contents.manuais", "contents.manuais-internos", "contents.ajuda",
  "users",
  "import",
  "disparos", "disparos.email-mkt", "disparos.avisos",
  "logbook",
  "fuelings",
  "dre",
  "receipts",
  "flight-review",
  "settings", "settings.regras", "settings.email", "settings.aparencia",
  "settings.badges", "settings.trilhas", "settings.exercicios", "settings.financeiro", "settings.onboarding", "settings.indique-ganhe", "settings.roles", "settings.propostas",
  "atualizacoes", "atualizacoes.agendamentos",
];

const ALL_ACTIONS: ActionKey[] = [
  "fueling.launch", "fueling.edit", "os.create", "flight.create", "flight.edit", "flight.delete",
  "content.edit", "credit.launch", "credit.edit", "credit.delete",
  "users.manage", "schedule.generate", "onboarding.edit",
];

export const DEFAULT_ADMIN_PERMISSIONS: RolePermissions = {
  tabs: Object.fromEntries(ALL_ADMIN_TABS.map((k) => [k, true])) as Record<AdminTabKey, boolean>,
  actions: Object.fromEntries(ALL_ACTIONS.map((k) => [k, true])) as Record<ActionKey, boolean>,
};

// ─── Instrutor: abas do portal instrutor + ações operacionais ─────────────────

/**
 * Todas as chaves de aba do portal instrutor.
 * Abas opcionais (dre, schedule) estão incluídas mas desativadas por padrão.
 */
const ALL_INSTRUCTOR_TAB_KEYS: InstructorTabKey[] = [
  "home", "journey", "flights", "notices", "manuals", "manuais-internos", "maneuvers", "students", "fuelings", "profile", "help",
  "dre", "schedule", "schedule.voos", "schedule.disponibilidades", "schedule.gerador", "contratos", "reports", "indique-ganhe",
];

/** Abas ativadas por padrão para o instrutor */
const INSTRUCTOR_DEFAULT_ON_TABS: Set<InstructorTabKey> = new Set([
  "home", "journey", "flights", "notices", "manuals", "manuais-internos", "maneuvers", "students", "fuelings", "profile", "help", "reports",
]);

/** Ações habilitadas por padrão para o instrutor */
const INSTRUCTOR_DEFAULT_ACTIONS: Set<ActionKey> = new Set([
  "fueling.launch", "fueling.edit", "os.create",
]);

export const DEFAULT_INSTRUTOR_PERMISSIONS: RolePermissions = {
  // Todas as abas declaradas explicitamente (true = habilitada por padrão, false = opcional/desabilitada)
  tabs: Object.fromEntries(
    ALL_INSTRUCTOR_TAB_KEYS.map((k) => [k, INSTRUCTOR_DEFAULT_ON_TABS.has(k)]),
  ) as Record<InstructorTabKey, boolean>,
  // Todas as ações declaradas explicitamente (evita o bug "0 ações" vs modal mostrando tudo marcado)
  actions: Object.fromEntries(
    ALL_ACTIONS.map((k) => [k, INSTRUCTOR_DEFAULT_ACTIONS.has(k)]),
  ) as Record<ActionKey, boolean>,
};

// ─── Aluno: abas do portal aluno, sem ações administrativas ──────────────────

/**
 * Todas as chaves de aba do portal aluno.
 * Abas opcionais (dre, fuelings) estão incluídas mas desativadas por padrão.
 */
const ALL_STUDENT_TAB_KEYS: StudentTabKey[] = [
  "home", "jornada", "meus-voos", "agendamento", "schedule", "creditos", "avisos", "manuais", "manobras", "perfil", "ajuda",
  "dre", "fuelings", "contratos", "indique-ganhe",
];

/** Abas ativadas por padrão para o aluno */
const STUDENT_DEFAULT_ON_TABS: Set<StudentTabKey> = new Set([
  "home", "jornada", "meus-voos", "agendamento", "schedule", "creditos", "avisos", "manuais", "manobras", "perfil", "ajuda",
]);

export const DEFAULT_ALUNO_PERMISSIONS: RolePermissions = {
  // Todas as abas declaradas explicitamente
  tabs: Object.fromEntries(
    ALL_STUDENT_TAB_KEYS.map((k) => [k, STUDENT_DEFAULT_ON_TABS.has(k)]),
  ) as Record<StudentTabKey, boolean>,
  // Todas as ações explicitamente false (aluno não tem ações administrativas)
  actions: Object.fromEntries(
    ALL_ACTIONS.map((k) => [k, false]),
  ) as Record<ActionKey, boolean>,
};

// ─── Helper: retorna defaults por portal ─────────────────────────────────────

export function getDefaultPermissionsForPortal(portalType: "admin" | "instrutor" | "aluno"): RolePermissions {
  switch (portalType) {
    case "admin": return DEFAULT_ADMIN_PERMISSIONS;
    case "instrutor": return DEFAULT_INSTRUTOR_PERMISSIONS;
    case "aluno": return DEFAULT_ALUNO_PERMISSIONS;
  }
}

/**
 * Mescla permissões salvas com defaults: chaves ausentes herdam o valor padrão.
 * Garante que mesmo com roles antigos sem todas as chaves o sistema funcione.
 * Com defaults agora totalmente explícitos (sem undefined), card e modal sempre coincidem.
 */
export function mergeWithDefaults(saved: RolePermissions, portalType: "admin" | "instrutor" | "aluno"): RolePermissions {
  const defaults = getDefaultPermissionsForPortal(portalType);
  return {
    tabs: { ...defaults.tabs, ...saved.tabs },
    actions: { ...defaults.actions, ...saved.actions },
  };
}
