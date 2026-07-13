// ============================================================
// Tipos para o sistema de roles dinâmicos por tenant
// ============================================================

/** Chaves de abas do portal admin (hierárquicas com ponto) */
export type AdminTabKey =
  | "home"
  | "schedule"
  | "schedule.voos"
  | "schedule.disponibilidades"
  | "schedule.gerador"
  | "schedule.configuracoes"
  | "students"
  | "reports"
  | "reports.all-flights"
  | "reports.relatorios"
  | "reports.assinaturas"
  | "reports.sem-telemetria"
  | "reports.alertas"
  | "fleet"
  | "fleet.avioes"
  | "fleet.modelos"
  | "fleet.programa"
  | "fleet.ordens-servico"
  | "contents"
  | "contents.manobras"
  | "contents.manuais"
  | "contents.manuais-internos"
  | "contents.ajuda"
  | "contents.ajuda-instrutor"
  | "contents.exercicios"
  | "users"
  | "import"
  | "disparos"
  | "disparos.email-mkt"
  | "disparos.avisos"
  | "logbook"
  | "fuelings"
  | "dre"
  | "receipts"
  | "crm"
  | "instructor-admission"
  | "settings"
  | "settings.regras"
  | "settings.email"
  | "settings.aparencia"
  | "settings.badges"
  | "settings.trilhas"
  | "settings.exercicios"
  | "settings.financeiro"
  | "settings.onboarding"
  | "settings.indique-ganhe"
  | "settings.roles"
  | "settings.propostas"
  | "settings.wpp"
  | "flight-review"
  | "contracts"
  | "contracts.layouts"
  | "contracts.emitidos"
  | "atualizacoes"
  | "atualizacoes.agendamentos";

/** Chaves de abas do portal instrutor */
export type InstructorTabKey =
  | "home"
  | "journey"
  | "flights"
  | "notices"
  | "manuals"
  | "manuais-internos"
  | "maneuvers"
  | "students"
  | "users"
  | "fuelings"
  | "profile"
  | "help"
  | "manual-instrutor"
  | "dre"       // Diário de bordo — opcional, desativado por padrão
  | "schedule"  // Escala — opcional, desativado por padrão
  | "schedule.voos"
  | "schedule.disponibilidades"
  | "schedule.gerador"
  | "contratos"
  | "reports"
  | "indique-ganhe";

/** Chaves de abas do portal aluno */
export type StudentTabKey =
  | "home"
  | "jornada"
  | "meus-voos"
  | "agendamento"
  | "schedule"
  | "creditos"
  | "avisos"
  | "manuais"
  | "manobras"
  | "perfil"
  | "ajuda"
  | "dre"
  | "fuelings"
  | "contratos"
  | "indique-ganhe";

/** Todas as chaves de aba possíveis */
export type AnyTabKey = AdminTabKey | InstructorTabKey | StudentTabKey;

/** Chaves de ações do sistema */
export type ActionKey =
  | "fueling.launch"    // Lançar abastecimento
  | "fueling.edit"      // Editar abastecimento
  | "os.create"         // Criar nova OS
  | "flight.create"     // Criar novo voo
  | "flight.edit"       // Editar voo
  | "flight.delete"     // Excluir voo
  | "content.edit"      // Editar conteúdo (manobras, manuais, ajuda)
  | "credit.launch"     // Lançar crédito
  | "credit.edit"       // Editar crédito
  | "credit.delete"     // Excluir crédito
  | "users.manage"      // Gerenciar usuários (criar, editar, alterar role)
  | "schedule.generate" // Gerar escala automática
  | "onboarding.edit"   // Editar apresentação de onboarding
  | "students.automations.view"
  | "students.automations.manage"
  | "students.templates.manage"
  | "students.history.view"
  | "students.statuses.manage";

/** Labels em português para cada ação */
export const ACTION_LABELS: Record<ActionKey, string> = {
  "fueling.launch": "Lançar abastecimento",
  "fueling.edit": "Editar abastecimento",
  "os.create": "Criar nova OS",
  "flight.create": "Criar novo voo",
  "flight.edit": "Editar voo",
  "flight.delete": "Excluir voo",
  "content.edit": "Editar conteúdo",
  "credit.launch": "Lançar crédito",
  "credit.edit": "Editar crédito",
  "credit.delete": "Excluir crédito",
  "users.manage": "Gerenciar usuários",
  "schedule.generate": "Gerar escala automática",
  "onboarding.edit": "Editar apresentação de onboarding",
  "students.automations.view": "Visualizar automações de alunos",
  "students.automations.manage": "Gerenciar automações de alunos",
  "students.templates.manage": "Gerenciar templates de automações",
  "students.history.view": "Visualizar histórico de automações",
  "students.statuses.manage": "Gerenciar status CRM de alunos",
};

/** Conjunto de permissões de um role */
export type RolePermissions = {
  tabs: Partial<Record<AnyTabKey, boolean>>;
  actions: Partial<Record<ActionKey, boolean>>;
};

/** Tipo do portal que o role usa */
export type PortalType = "admin" | "instrutor" | "aluno";

/** Definição completa de um role de tenant */
export type TenantRole = {
  $id: string;
  schoolId: string;
  name: string;
  slug: string;
  portalType: PortalType;
  isSystem: boolean;
  permissions: RolePermissions;
  createdAt: string;
  updatedAt: string;
};

/** Input para criar/editar um role */
export type TenantRoleInput = {
  name: string;
  slug: string;
  portalType: PortalType;
  permissions: RolePermissions;
};

/** Labels descritivos para abas do portal admin */
export const ADMIN_TAB_LABELS: Record<AdminTabKey, string> = {
  "home": "Home",
  "schedule": "Escala",
  "schedule.voos": "Escala › Voos",
  "schedule.disponibilidades": "Escala › Disponibilidades",
  "schedule.gerador": "Escala › Gerador",
  "schedule.configuracoes": "Escala › Configurações",
  "students": "Alunos",
  "reports": "Relatórios",
  "reports.all-flights": "Relatórios › Todos os Voos",
  "reports.relatorios": "Relatórios › Relatórios",
  "reports.assinaturas": "Relatórios › Assinaturas",
  "reports.sem-telemetria": "Relatórios › Flight Review",
  "reports.alertas": "Relatórios › Alertas",
  "fleet": "Frota",
  "fleet.avioes": "Frota › Aviões",
  "fleet.modelos": "Frota › Modelos",
  "fleet.programa": "Frota › Programa de Manutenção",
  "fleet.ordens-servico": "Frota › Ordens de Serviço",
  "contents": "Conteúdos",
  "contents.manobras": "Conteúdos › Manobras",
  "contents.manuais": "Conteúdos › Manuais",
  "contents.manuais-internos": "Conteúdos › Manuais Internos",
  "contents.ajuda": "Conteúdos › Central de Ajuda",
  "contents.ajuda-instrutor": "Conteúdos › Manual do Instrutor",
  "contents.exercicios": "Conteúdos › Critérios",
  "users": "Usuários",
  "import": "Import",
  "disparos": "Disparos",
  "disparos.email-mkt": "Disparos › Email MKT",
  "disparos.avisos": "Disparos › Avisos",
  "logbook": "Diário de Bordo",
  "fuelings": "Abastecimentos",
  "dre": "DRE",
  "receipts": "Recebimentos",
  "crm": "CRM",
  "instructor-admission": "Instrutores",
  "settings": "Configurações",
  "settings.regras": "Configurações › Regras",
  "settings.email": "Configurações › E-mail",
  "settings.aparencia": "Configurações › Aparência",
  "settings.badges": "Configurações › Badges",
  "settings.trilhas": "Configurações › Trilhas",
  "settings.exercicios": "Configurações › Critérios",
  "settings.financeiro": "Configurações › Financeiro",
  "settings.onboarding": "Conteúdos › Manual do Aluno",
  "settings.indique-ganhe": "Configurações › Indique e ganhe",
  "settings.roles": "Configurações › Roles",
  "settings.propostas": "Configurações › Propostas",
  "settings.wpp": "Configurações › WPP",
  "flight-review": "Flight Review",
  "contracts": "Contratos",
  "contracts.layouts": "Contratos › Layouts",
  "contracts.emitidos": "Contratos › Emitidos",
  "atualizacoes": "Atualizações",
  "atualizacoes.agendamentos": "Atualizações › Agendamentos",
};

/** Labels descritivos para abas do portal instrutor */
export const INSTRUCTOR_TAB_LABELS: Record<InstructorTabKey, string> = {
  "home": "Home",
  "journey": "Jornada",
  "flights": "Meus Voos",
  "notices": "Avisos",
  "manuals": "Manuais",
  "manuais-internos": "Manuais Internos",
  "maneuvers": "Manobras",
  "students": "Alunos",
  "users": "Usuários",
  "fuelings": "Abastecimentos",
  "profile": "Perfil",
  "help": "Ajuda",
  "manual-instrutor": "Manual do instrutor",
  "dre": "Diário de bordo",
  "schedule": "Escala",
  "schedule.voos": "Escala › Voos",
  "schedule.disponibilidades": "Escala › Disponibilidades",
  "schedule.gerador": "Escala › Gerador",
  "contratos": "Contratos",
  "reports": "Relatórios",
  "indique-ganhe": "Indique e ganhe",
};

/** Labels descritivos para abas do portal aluno */
export const STUDENT_TAB_LABELS: Record<StudentTabKey, string> = {
  "home": "Home",
  "jornada": "Jornada",
  "meus-voos": "Meus Voos",
  "agendamento": "Agendamento",
  "schedule": "Escala",
  "creditos": "Créditos",
  "avisos": "Avisos",
  "manuais": "Manuais",
  "manobras": "Manobras",
  "perfil": "Perfil",
  "ajuda": "Ajuda",
  "dre": "EDB",
  "fuelings": "Abastecimentos",
  "contratos": "Contratos",
  "indique-ganhe": "Indique e ganhe",
};
