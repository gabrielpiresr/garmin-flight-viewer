// Índice estático da busca global do admin (AdminCommandBar).
// Os paths espelham ADMIN_ROUTES / *_ROUTES em AdminLayout.tsx — ao criar ou
// mover uma seção/sub-aba, atualizar também as entradas abaixo.

import type { AdminTabKey } from "../types/rolePermissions";

export type AdminSearchEntry = {
  id: string;
  kind: "page" | "action";
  label: string;
  group: string;
  path: string;
  requiredTab: AdminTabKey;
  keywords: string[];
  /** Título de seção (h1–h4) ou data-search-anchor para rolar após navegar. */
  scrollTo?: string;
};

const PAGE_ENTRIES: AdminSearchEntry[] = [
  { id: "page-home", kind: "page", label: "Home", group: "Operação", path: "/admin", requiredTab: "home", keywords: ["dashboard", "inicio", "painel", "visao geral"] },
  { id: "page-schedule-flights", kind: "page", label: "Escala · Voos", group: "Escala", path: "/admin/escala/voos", requiredTab: "schedule.voos", keywords: ["agenda", "agendamentos", "marcacao", "calendario", "voos agendados"] },
  { id: "page-schedule-weekly", kind: "page", label: "Escala · Disponibilidades", group: "Escala", path: "/admin/escala/disponibilidades", requiredTab: "schedule.disponibilidades", keywords: ["disponibilidade", "horarios", "semana"] },
  { id: "page-schedule-generator", kind: "page", label: "Escala · Gerador", group: "Escala", path: "/admin/escala/gerador", requiredTab: "schedule.gerador", keywords: ["gerar escala", "automatico"] },
  { id: "page-schedule-settings", kind: "page", label: "Escala · Configurações", group: "Escala", path: "/admin/escala/configuracoes", requiredTab: "schedule.configuracoes", keywords: ["regras de escala", "limites", "antecedencia"] },
  { id: "page-atualizacoes", kind: "page", label: "Atualizações", group: "Operação", path: "/admin/atualizacoes/agendamentos", requiredTab: "atualizacoes", keywords: ["saga", "sincronizacao", "sync"] },
  { id: "page-reports-all-flights", kind: "page", label: "Todos os voos", group: "Relatórios", path: "/admin/todos-os-voos", requiredTab: "reports.all-flights", keywords: ["historico de voos", "telemetria", "voos executados"] },
  { id: "page-reports-flight-reports", kind: "page", label: "Relatórios de voo", group: "Relatórios", path: "/admin/relatorios", requiredTab: "reports.relatorios", keywords: ["relatorio", "debrief", "ficha"] },
  { id: "page-reports-signatures", kind: "page", label: "Assinaturas", group: "Relatórios", path: "/admin/assinaturas", requiredTab: "reports.assinaturas", keywords: ["assinar", "pendencias", "pendente"] },
  { id: "page-reports-no-telemetry", kind: "page", label: "Flight Review", group: "Relatórios", path: "/admin/sem-telemetria", requiredTab: "reports.sem-telemetria", keywords: ["sem dados", "voo manual", "telemetria", "video", "flight review"] },
  { id: "page-reports-alerts", kind: "page", label: "Alertas", group: "Relatórios", path: "/admin/alertas", requiredTab: "reports.alertas", keywords: ["excedencia", "alerta de telemetria"] },
  { id: "page-contents-maneuvers", kind: "page", label: "Manobras", group: "Conteúdos", path: "/admin/conteudos/manobras", requiredTab: "contents.manobras", keywords: ["manobra", "secoes", "artigos"] },
  { id: "page-contents-manuals", kind: "page", label: "Manuais", group: "Conteúdos", path: "/admin/conteudos/manuais", requiredTab: "contents.manuais", keywords: ["apostila", "documento", "pdf"] },
  { id: "page-contents-manuais-internos", kind: "page", label: "Manuais internos", group: "Conteúdos", path: "/admin/conteudos/manuais-internos", requiredTab: "contents.manuais-internos", keywords: ["procedimentos", "interno"] },
  { id: "page-contents-help", kind: "page", label: "Central de Ajuda", group: "Conteúdos", path: "/admin/conteudos/central-ajuda", requiredTab: "contents.ajuda", keywords: ["faq", "suporte", "duvidas", "ajuda", "aluno"] },
  { id: "page-contents-instructor-help", kind: "page", label: "Manual do Instrutor", group: "Conteúdos", path: "/admin/conteudos/manual-instrutor", requiredTab: "contents.ajuda-instrutor", keywords: ["manual do instrutor", "guia do instrutor", "inva", "procedimentos instrutor", "rotina instrutor"] },
  { id: "page-contents-student-manual", kind: "page", label: "Manual do Aluno", group: "Conteúdos", path: "/admin/conteudos/manual-aluno", requiredTab: "settings.onboarding", keywords: ["manual do aluno", "onboarding", "boas-vindas", "primeiros passos", "apresentacao"] },
  { id: "page-contents-exercises", kind: "page", label: "Critérios", group: "Conteúdos", path: "/admin/conteudos/exercicios", requiredTab: "contents.exercicios", keywords: ["criterios de avaliacao", "exercicios", "notas"] },
  { id: "page-flight-review", kind: "page", label: "Flight Review", group: "Conteúdos", path: "/admin/conteudos/flight-review", requiredTab: "flight-review", keywords: ["revisao de voo", "avaliacao"] },
  { id: "page-students", kind: "page", label: "Alunos", group: "Operação", path: "/admin/alunos", requiredTab: "students", keywords: ["aluno", "evolucao", "ritmo de voo", "estudante", "turma"] },
  { id: "page-users", kind: "page", label: "Usuários", group: "Operação", path: "/admin/usuarios", requiredTab: "users", keywords: ["usuario", "perfil", "permissoes", "conta", "cadastro", "membros"] },
  { id: "page-fleet-aircraft", kind: "page", label: "Frota · Aviões", group: "Frota", path: "/admin/frota/avioes", requiredTab: "fleet.avioes", keywords: ["aeronave", "aviao", "prefixo", "matricula"] },
  { id: "page-fleet-models", kind: "page", label: "Frota · Modelos", group: "Frota", path: "/admin/frota/modelos", requiredTab: "fleet.modelos", keywords: ["modelo de aeronave"] },
  { id: "page-fleet-program", kind: "page", label: "Frota · Programa", group: "Frota", path: "/admin/frota/programa-manutencao", requiredTab: "fleet.programa", keywords: ["programa de manutencao", "inspecao", "horas"] },
  { id: "page-fleet-work-orders", kind: "page", label: "Ordens de Serviço", group: "Frota", path: "/admin/frota/ordens-servico", requiredTab: "fleet.ordens-servico", keywords: ["os", "manutencao", "oficina", "mecanico"] },
  { id: "page-fuelings", kind: "page", label: "Abastecimentos", group: "Frota", path: "/admin/abastecimentos", requiredTab: "fuelings", keywords: ["combustivel", "gasolina", "avgas", "litros", "abastecer"] },
  { id: "page-logbook", kind: "page", label: "Diário de bordo", group: "Frota", path: "/admin/diario-de-bordo", requiredTab: "logbook", keywords: ["anac", "caderneta", "registros de voo"] },
  { id: "page-crm", kind: "page", label: "CRM", group: "Comercial & Financeiro", path: "/admin/crm", requiredTab: "crm", keywords: ["funil", "lead", "prospeccao", "pipeline", "qualificacao"] },
  { id: "page-receipts", kind: "page", label: "Recebimentos", group: "Comercial & Financeiro", path: "/admin/recebimentos", requiredTab: "receipts", keywords: ["pagamento", "cakto", "cobranca", "venda", "pix", "recebido", "credito"] },
  { id: "page-dre", kind: "page", label: "DRE", group: "Comercial & Financeiro", path: "/admin/dre", requiredTab: "dre", keywords: ["financeiro", "resultado", "demonstrativo", "receita", "despesa", "lucro"] },
  { id: "page-contracts", kind: "page", label: "Contratos", group: "Comercial & Financeiro", path: "/admin/contratos", requiredTab: "contracts", keywords: ["contrato", "template", "emitidos", "minuta"] },
  { id: "page-disparos-email", kind: "page", label: "Disparos · Email MKT", group: "Comercial & Financeiro", path: "/admin/disparos/email-mkt", requiredTab: "disparos.email-mkt", keywords: ["email marketing", "campanha", "newsletter", "disparo"] },
  { id: "page-disparos-notices", kind: "page", label: "Disparos · Avisos", group: "Comercial & Financeiro", path: "/admin/disparos/avisos", requiredTab: "disparos.avisos", keywords: ["aviso", "comunicado", "notificacao"] },
  { id: "page-settings-rules", kind: "page", label: "Configurações · Regras", group: "Configurações", path: "/admin/configuracoes", requiredTab: "settings.regras", keywords: ["regras", "configuracao geral"] },
  { id: "page-settings-email", kind: "page", label: "Configurações · E-mail", group: "Configurações", path: "/admin/configuracoes/email", requiredTab: "settings.email", keywords: ["smtp", "templates de email", "notificacoes por email"] },
  { id: "page-settings-brand", kind: "page", label: "Configurações · Aparência", group: "Configurações", path: "/admin/configuracoes/aparencia", requiredTab: "settings.aparencia", keywords: ["marca", "logo", "branding", "cores"] },
  { id: "page-settings-badges", kind: "page", label: "Configurações · Badges", group: "Configurações", path: "/admin/configuracoes/badges", requiredTab: "settings.badges", keywords: ["conquistas", "badge"] },
  { id: "page-settings-tracks", kind: "page", label: "Configurações · Trilhas", group: "Configurações", path: "/admin/configuracoes/trilhas", requiredTab: "settings.trilhas", keywords: ["trilha", "curso", "treinamento", "missao", "missoes"] },
  { id: "page-settings-financeiro", kind: "page", label: "Configurações · Financeiro", group: "Configurações", path: "/admin/configuracoes/financeiro", requiredTab: "settings.financeiro", keywords: ["custos", "produtos", "pacotes de creditos", "precos", "valores"] },
  { id: "page-settings-indique", kind: "page", label: "Configurações · Indique e ganhe", group: "Configurações", path: "/admin/configuracoes/indique-ganhe", requiredTab: "settings.indique-ganhe", keywords: ["indicacao", "referral", "recompensa"] },
  { id: "page-settings-roles", kind: "page", label: "Configurações · Roles", group: "Configurações", path: "/admin/configuracoes/roles", requiredTab: "settings.roles", keywords: ["perfis de acesso", "permissao", "cargo"] },
  { id: "page-settings-propostas", kind: "page", label: "Configurações · Propostas", group: "Configurações", path: "/admin/configuracoes/propostas", requiredTab: "settings.propostas", keywords: ["proposta", "orcamento"] },
  { id: "page-settings-wpp", kind: "page", label: "Configurações · WPP", group: "Configurações", path: "/admin/configuracoes/wpp", requiredTab: "settings.wpp", keywords: ["whatsapp", "zap", "mensagens"] },
  { id: "page-settings-importacoes", kind: "page", label: "Configurações · Importações", group: "Configurações", path: "/admin/configuracoes/importacoes", requiredTab: "import", keywords: ["importar", "csv", "saga", "migracao"] },
];

const ACTION_ENTRIES: AdminSearchEntry[] = [
  // Escala / voos
  { id: "action-book-flight", kind: "action", label: "Agendar voo", group: "Ações", path: "/admin/escala/voos", requiredTab: "schedule.voos", keywords: ["marcar voo", "novo voo", "novo agendamento", "solicitar voo", "encaixar voo"] },
  { id: "action-cancel-flight", kind: "action", label: "Cancelar voo", group: "Ações", path: "/admin/escala/voos", requiredTab: "schedule.voos", keywords: ["cancelar voo", "cancelamento", "desmarcar voo", "multa de cancelamento", "cancelar agendamento"] },
  { id: "action-reschedule-flight", kind: "action", label: "Remarcar voo", group: "Ações", path: "/admin/escala/voos", requiredTab: "schedule.voos", keywords: ["remarcar", "reagendar", "alterar voo", "mudar horario", "trocar horario", "adiar voo"] },
  { id: "action-confirm-flight", kind: "action", label: "Confirmar voo", group: "Ações", path: "/admin/escala/voos", requiredTab: "schedule.voos", keywords: ["confirmar voo", "confirmacao", "voo pendente"] },
  { id: "action-today-flights", kind: "action", label: "Ver voos de hoje", group: "Ações", path: "/admin/escala/voos", requiredTab: "schedule.voos", keywords: ["voos de hoje", "agenda de hoje", "quem voa hoje", "escala do dia"] },
  { id: "action-generate-schedule", kind: "action", label: "Gerar escala", group: "Ações", path: "/admin/escala/gerador", requiredTab: "schedule.gerador", keywords: ["escala automatica", "montar escala"] },
  { id: "action-instructor-availability", kind: "action", label: "Definir disponibilidade de instrutor", group: "Ações", path: "/admin/escala/disponibilidades", requiredTab: "schedule.disponibilidades", keywords: ["disponibilidade do instrutor", "folga", "horario do instrutor", "agenda do instrutor"] },
  { id: "action-schedule-rules", kind: "action", label: "Configurar regras de agendamento", group: "Ações", path: "/admin/escala/configuracoes", requiredTab: "schedule.configuracoes", keywords: ["antecedencia", "horario noturno", "regras da escala", "modo da escala"] },
  { id: "action-cancel-fee", kind: "action", label: "Configurar multas de cancelamento", group: "Ações", path: "/admin/escala/configuracoes", requiredTab: "schedule.configuracoes", scrollTo: "Cancelamento", keywords: ["multa", "multa de cancelamento", "taxa de cancelamento", "penalidade"] },
  { id: "action-student-limits", kind: "action", label: "Configurar limites do aluno", group: "Ações", path: "/admin/escala/configuracoes", requiredTab: "schedule.configuracoes", scrollTo: "Limites do aluno", keywords: ["limite semanal", "limite diario", "maximo de voos", "limite de horas"] },
  { id: "action-slot-config", kind: "action", label: "Configurar horários e slots", group: "Ações", path: "/admin/escala/configuracoes", requiredTab: "schedule.configuracoes", scrollTo: "Horários e slots", keywords: ["grade de horarios", "slots", "buffer", "briefing", "debriefing", "tempo de solo"] },
  { id: "action-flight-duration", kind: "action", label: "Configurar duração dos voos", group: "Ações", path: "/admin/escala/configuracoes", requiredTab: "schedule.configuracoes", scrollTo: "Duração dos voos", keywords: ["duracao minima", "duracao maxima", "duracao do voo"] },
  { id: "action-credit-requirement", kind: "action", label: "Configurar exigência de créditos", group: "Ações", path: "/admin/escala/configuracoes", requiredTab: "schedule.configuracoes", scrollTo: "Créditos", keywords: ["saldo para agendar", "credito para marcar", "exigencia de saldo", "saldo negativo"] },
  // Usuários / alunos
  { id: "action-create-user", kind: "action", label: "Cadastrar novo usuário", group: "Ações", path: "/admin/usuarios", requiredTab: "users", keywords: ["novo usuario", "criar usuario", "novo aluno", "matricular", "matricula", "cadastrar aluno", "novo instrutor"] },
  { id: "action-approve-student", kind: "action", label: "Aprovar acesso de aluno", group: "Ações", path: "/admin/usuarios", requiredTab: "users", keywords: ["aprovar aluno", "aprovacao", "acesso pendente", "liberar acesso", "aprovar cadastro"] },
  { id: "action-reset-password", kind: "action", label: "Redefinir senha de usuário", group: "Ações", path: "/admin/usuarios", requiredTab: "users", keywords: ["resetar senha", "trocar senha", "recuperar senha", "senha do aluno"] },
  { id: "action-deactivate-user", kind: "action", label: "Desativar ou excluir usuário", group: "Ações", path: "/admin/usuarios", requiredTab: "users", keywords: ["desativar usuario", "bloquear", "inativar", "excluir usuario", "apagar usuario", "remover aluno"] },
  { id: "action-student-progress", kind: "action", label: "Ver evolução de aluno", group: "Ações", path: "/admin/alunos", requiredTab: "students", keywords: ["evolucao do aluno", "progresso", "ritmo de voo", "horas do aluno", "desempenho"] },
  // Financeiro / comercial
  { id: "action-add-credit", kind: "action", label: "Adicionar crédito", group: "Ações", path: "/admin/recebimentos", requiredTab: "receipts", keywords: ["credito", "creditos", "recarga", "saldo", "pagamento manual", "lancar pagamento", "horas para aluno"] },
  { id: "action-payment-link", kind: "action", label: "Gerar link de pagamento", group: "Ações", path: "/admin/recebimentos", requiredTab: "receipts", keywords: ["link de pagamento", "cobrar aluno", "gerar cobranca", "enviar cobranca"] },
  { id: "action-credit-packages", kind: "action", label: "Configurar pacotes de horas de voo", group: "Ações", path: "/admin/configuracoes/financeiro", requiredTab: "settings.financeiro", scrollTo: "Pacotes de horas de voo", keywords: ["pacote de creditos", "pacote de horas", "preco da hora", "valor da hora de voo", "tabela de precos"] },
  { id: "action-config-taxes", kind: "action", label: "Configurar impostos", group: "Ações", path: "/admin/configuracoes/financeiro", requiredTab: "settings.financeiro", scrollTo: "Impostos", keywords: ["imposto", "aliquota", "tributos", "simples nacional"] },
  { id: "action-manual-cost", kind: "action", label: "Lançar custo manual", group: "Ações", path: "/admin/configuracoes/financeiro", requiredTab: "settings.financeiro", scrollTo: "Lancamento manual", keywords: ["lancar custo", "despesa manual", "custo avulso", "lancamento"] },
  { id: "action-payment-costs", kind: "action", label: "Configurar custos por forma de pagamento", group: "Ações", path: "/admin/configuracoes/financeiro", requiredTab: "settings.financeiro", scrollTo: "Custos por forma de pagamento", keywords: ["taxa do cartao", "taxa do pix", "forma de pagamento", "custo de matricula"] },
  { id: "action-products", kind: "action", label: "Configurar produtos e serviços", group: "Ações", path: "/admin/configuracoes/financeiro", requiredTab: "settings.financeiro", scrollTo: "Produtos e Serviços", keywords: ["produtos", "servicos", "item de venda", "taxa de matricula"] },
  { id: "action-cakto-integration", kind: "action", label: "Configurar integração Cakto", group: "Ações", path: "/admin/configuracoes/financeiro", requiredTab: "settings.financeiro", scrollTo: "Integração Cakto", keywords: ["cakto", "checkout", "webhook de pagamento"] },
  { id: "action-month-result", kind: "action", label: "Ver resultado do mês", group: "Ações", path: "/admin/dre", requiredTab: "dre", keywords: ["resultado do mes", "faturamento", "balanco", "quanto entrou", "receitas e despesas"] },
  { id: "action-add-lead", kind: "action", label: "Cadastrar lead", group: "Ações", path: "/admin/crm", requiredTab: "crm", keywords: ["novo lead", "adicionar lead", "novo contato", "interessado", "prospecto"] },
  { id: "action-generate-proposal", kind: "action", label: "Gerar proposta", group: "Ações", path: "/admin/crm", requiredTab: "crm", keywords: ["proposta comercial", "nova proposta", "orcamento para lead", "enviar proposta"] },
  { id: "action-issue-contract", kind: "action", label: "Emitir contrato", group: "Ações", path: "/admin/contratos", requiredTab: "contracts", keywords: ["novo contrato", "gerar contrato", "contrato do aluno"] },
  { id: "action-contract-template", kind: "action", label: "Editar modelo de contrato", group: "Ações", path: "/admin/contratos", requiredTab: "contracts", keywords: ["modelo de contrato", "template de contrato", "layout de contrato", "minuta"] },
  // Frota / manutenção
  { id: "action-add-aircraft", kind: "action", label: "Cadastrar aeronave", group: "Ações", path: "/admin/frota/avioes", requiredTab: "fleet.avioes", keywords: ["nova aeronave", "adicionar aviao", "cadastrar aviao", "novo prefixo"] },
  { id: "action-aircraft-hours", kind: "action", label: "Ver horas das aeronaves", group: "Ações", path: "/admin/frota/avioes", requiredTab: "fleet.avioes", keywords: ["horimetro", "ttaf", "horas de celula", "horas voadas", "horas do aviao"] },
  { id: "action-open-work-order", kind: "action", label: "Abrir ordem de serviço", group: "Ações", path: "/admin/frota/ordens-servico", requiredTab: "fleet.ordens-servico", keywords: ["nova os", "abrir os", "registrar manutencao", "lancar manutencao", "pane", "aviao parado", "discrepancia"] },
  { id: "action-maintenance-due", kind: "action", label: "Ver vencimentos de manutenção", group: "Ações", path: "/admin/frota/programa-manutencao", requiredTab: "fleet.programa", keywords: ["vencimento", "proxima inspecao", "50 horas", "100 horas", "revisao do aviao", "quando vence"] },
  { id: "action-add-fueling", kind: "action", label: "Registrar abastecimento", group: "Ações", path: "/admin/abastecimentos", requiredTab: "fuelings", keywords: ["novo abastecimento", "lancar combustivel", "abastecer aviao"] },
  { id: "action-logbook-entry", kind: "action", label: "Lançar diário de bordo", group: "Ações", path: "/admin/diario-de-bordo", requiredTab: "logbook", keywords: ["lancar diario", "registro anac", "preencher caderneta", "horas na caderneta"] },
  // Voos executados / relatórios
  { id: "action-upload-telemetry", kind: "action", label: "Enviar telemetria de voo", group: "Ações", path: "/admin/todos-os-voos", requiredTab: "reports.all-flights", keywords: ["upload de telemetria", "subir telemetria", "g1000", "csv do garmin", "log de voo", "dados do voo"] },
  { id: "action-sign-reports", kind: "action", label: "Assinar fichas pendentes", group: "Ações", path: "/admin/assinaturas", requiredTab: "reports.assinaturas", keywords: ["assinar ficha", "fichas pendentes", "pendencias de assinatura", "assinatura do instrutor"] },
  // Conteúdos
  { id: "action-edit-maneuver", kind: "action", label: "Editar manobra", group: "Ações", path: "/admin/conteudos/manobras", requiredTab: "contents.manobras", keywords: ["editar manobra", "artigo de manobra", "nova manobra", "secao de manobra"] },
  { id: "action-edit-help", kind: "action", label: "Editar central de ajuda", group: "Ações", path: "/admin/conteudos/central-ajuda", requiredTab: "contents.ajuda", keywords: ["editar faq", "artigo de ajuda", "nova pergunta"] },
  { id: "action-edit-instructor-help", kind: "action", label: "Editar manual do instrutor", group: "Ações", path: "/admin/conteudos/manual-instrutor", requiredTab: "contents.ajuda-instrutor", keywords: ["editar manual instrutor", "artigo instrutor", "guia inva", "procedimento instrutor"] },
  { id: "action-edit-student-manual", kind: "action", label: "Editar manual do aluno", group: "Ações", path: "/admin/conteudos/manual-aluno", requiredTab: "settings.onboarding", keywords: ["editar manual aluno", "editar onboarding", "slides aluno", "apresentacao aluno"] },
  { id: "action-edit-track", kind: "action", label: "Criar ou editar trilha", group: "Ações", path: "/admin/configuracoes/trilhas", requiredTab: "settings.trilhas", keywords: ["nova trilha", "editar trilha", "nova missao", "criar missao", "fases da trilha", "curso do aluno"] },
  // Comunicação
  { id: "action-send-notice", kind: "action", label: "Enviar aviso", group: "Ações", path: "/admin/disparos/avisos", requiredTab: "disparos.avisos", keywords: ["novo aviso", "publicar comunicado", "avisar alunos", "mural"] },
  { id: "action-create-campaign", kind: "action", label: "Criar campanha de email", group: "Ações", path: "/admin/disparos/email-mkt", requiredTab: "disparos.email-mkt", keywords: ["nova campanha", "enviar email em massa", "email marketing"] },
  { id: "action-config-whatsapp", kind: "action", label: "Configurar WhatsApp", group: "Ações", path: "/admin/configuracoes/wpp", requiredTab: "settings.wpp", keywords: ["conectar whatsapp", "mensagens automaticas", "zap"] },
  { id: "action-test-email", kind: "action", label: "Configurar e-mails da plataforma", group: "Ações", path: "/admin/configuracoes/email", requiredTab: "settings.email", scrollTo: "Configuração de email", keywords: ["email de teste", "template de email", "notificacoes por email", "remetente"] },
  { id: "action-google-calendar", kind: "action", label: "Conectar Google Calendar", group: "Ações", path: "/admin/configuracoes/email", requiredTab: "settings.email", scrollTo: "Google Calendar", keywords: ["google calendar", "agenda google", "convite de voo", "google agenda"] },
  // Permissões / sistema
  { id: "action-edit-roles", kind: "action", label: "Editar permissões e roles", group: "Ações", path: "/admin/configuracoes/roles", requiredTab: "settings.roles", keywords: ["criar role", "editar permissoes", "perfil de acesso", "quem pode ver", "restringir acesso"] },
  { id: "action-import-saga", kind: "action", label: "Importar dados do SAGA", group: "Ações", path: "/admin/configuracoes/importacoes", requiredTab: "import", keywords: ["importar saga", "importacao", "trazer voos do saga", "migrar dados"] },
  { id: "action-sync-saga", kind: "action", label: "Sincronizar com o SAGA", group: "Ações", path: "/admin/atualizacoes/agendamentos", requiredTab: "atualizacoes", keywords: ["sincronizar", "atualizar dados do saga", "sync", "agendamentos do saga"] },
  { id: "action-create-badge", kind: "action", label: "Criar badge", group: "Ações", path: "/admin/configuracoes/badges", requiredTab: "settings.badges", keywords: ["nova badge", "conquista", "premiacao"] },
  { id: "action-flight-review-club", kind: "action", label: "Configurar Flight Review Club", group: "Ações", path: "/admin/configuracoes", requiredTab: "settings.regras", scrollTo: "Flight Review Club", keywords: ["clube de flight review", "assinatura do clube", "clube"] },
  { id: "action-alerts-triggered", kind: "action", label: "Ver alertas disparados", group: "Ações", path: "/admin/alertas", requiredTab: "reports.alertas", scrollTo: "Alertas disparados", keywords: ["alertas disparados", "excedencias recentes", "ocorrencias"] },
];

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type IndexedEntry = {
  entry: AdminSearchEntry;
  normLabel: string;
  normKeywords: string[];
};

const INDEX: IndexedEntry[] = [...ACTION_ENTRIES, ...PAGE_ENTRIES].map((entry) => ({
  entry,
  normLabel: normalizeSearchText(entry.label),
  normKeywords: entry.keywords.map(normalizeSearchText),
}));

// Palavras vazias em pt-BR ignoradas no matching ("cancelar um voo" == "cancelar voo").
// Se a query só tiver stopwords, elas são usadas mesmo assim (ex.: "os" = Ordem de Serviço).
const STOPWORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "para", "pra", "pro", "por", "com", "sem", "e", "ou", "que",
  "meu", "minha", "meus", "minhas", "como", "onde", "quero", "preciso", "gostaria",
]);

function tokenizeQuery(query: string): string[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((token) => !STOPWORDS.has(token));
  return meaningful.length > 0 ? meaningful : tokens;
}

const ACTION_VERBS = new Set([
  "adicionar", "criar", "novo", "nova", "gerar", "emitir", "registrar", "enviar", "cadastrar",
  "abrir", "importar", "lancar", "marcar", "agendar", "cancelar", "remarcar", "reagendar",
  "alterar", "mudar", "trocar", "confirmar", "aprovar", "assinar", "resetar", "redefinir",
  "configurar", "editar", "excluir", "apagar", "remover", "desativar", "bloquear", "liberar",
  "desmarcar", "publicar", "sincronizar", "atualizar", "subir", "cobrar", "definir", "ver", "consultar",
]);

function isFuzzySubsequence(token: string, target: string): boolean {
  let i = 0;
  for (const char of target) {
    if (char === token[i]) i += 1;
    if (i >= token.length) return true;
  }
  return false;
}

function scoreToken(token: string, item: IndexedEntry): number {
  const { normLabel, normKeywords } = item;
  if (normLabel === token) return 120;
  if (normKeywords.includes(token)) return 90;
  if (normLabel.startsWith(token)) return 100;
  if (normLabel.split(/[^a-z0-9]+/).some((word) => word.startsWith(token))) return 80;
  if (normLabel.includes(token)) return 60;
  let keywordScore = 0;
  for (const keyword of normKeywords) {
    if (keyword.startsWith(token) || keyword.split(/[^a-z0-9]+/).some((word) => word.startsWith(token))) {
      keywordScore = Math.max(keywordScore, 50);
    } else if (keyword.includes(token)) {
      keywordScore = Math.max(keywordScore, 40);
    }
  }
  if (keywordScore > 0) return keywordScore;
  if (token.length >= 3 && isFuzzySubsequence(token, normLabel)) return 15;
  return 0;
}

const MAX_RESULTS = 8;

export function searchAdminIndex(
  query: string,
  canTab: (key: AdminTabKey) => boolean,
): AdminSearchEntry[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const hasVerb = tokens.some((token) => ACTION_VERBS.has(token));
  // Queries curtas exigem todos os tokens; longas toleram tokens sem match
  // ("remarcar o voo de um aluno" acha "Remarcar voo"). Quem casa mais tokens
  // ranqueia acima.
  const minMatched = Math.max(1, Math.ceil(tokens.length * 0.6));
  const scored: Array<{ entry: AdminSearchEntry; matched: number; score: number }> = [];

  for (const item of INDEX) {
    if (!canTab(item.entry.requiredTab)) continue;
    let total = 0;
    let matched = 0;
    for (const token of tokens) {
      const score = scoreToken(token, item);
      if (score > 0) {
        matched += 1;
        total += score;
      }
    }
    if (matched < minMatched) continue;
    if (hasVerb && item.entry.kind === "action") total += 10;
    scored.push({ entry: item.entry, matched, score: total });
  }

  // Empates mantêm a ordem do índice (mesma ordem do menu) — sort é estável.
  return scored
    .sort((a, b) => b.matched - a.matched || b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((row) => row.entry);
}

/**
 * Encontra o primeiro trecho do texto original que casa (ignorando acentos e
 * caixa) com algum token da query — para highlight no dropdown. Retorna
 * índices no texto ORIGINAL ou null quando nenhum token casa por substring.
 */
export function findHighlightRange(text: string, query: string): { start: number; end: number } | null {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return null;

  // Mapa índice normalizado -> índice original (a normalização NFD remove
  // combining marks, então cada char normalizado veio de um char original).
  const normChars: string[] = [];
  const originIndex: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const normalized = text[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const char of normalized) {
      normChars.push(char);
      originIndex.push(i);
    }
  }
  const normText = normChars.join("");

  for (const token of tokens) {
    const at = normText.indexOf(token);
    if (at < 0) continue;
    const start = originIndex[at];
    const endNorm = at + token.length - 1;
    const end = (originIndex[endNorm] ?? text.length - 1) + 1;
    return { start, end };
  }
  return null;
}
