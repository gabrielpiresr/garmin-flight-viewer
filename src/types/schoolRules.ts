import type { NotificationEventType } from "./notification";
import type { ScheduleStudentHelpConfig } from "./scheduleStudentHelp";
import { defaultScheduleStudentHelp } from "../lib/scheduleStudentHelpDefaults";
import { normalizeScheduleStudentHelp } from "../lib/scheduleStudentHelp";
import {
  DEFAULT_FLIGHT_EVALUATION_RULES,
  normalizeFlightEvaluationRules,
  type FlightEvaluationRules,
} from "./flightEvaluation";
import {
  DEFAULT_CAPACITY_PROJECTION_SETTINGS,
  normalizeCapacityProjectionSettings,
  type CapacityProjectionSettings,
} from "./capacityProjection";

export type FlightReviewClubLpType = "internal_public_page" | "external_url";

export const LP_FEATURE_SECTION_IDS = ["gravacao", "agenda", "premium", "parceiros", "treinamento", "marketplace", "kit"] as const;

export type FlightReviewClubFeatureSectionId = (typeof LP_FEATURE_SECTION_IDS)[number];

export type FlightReviewClubLpSectionId = FlightReviewClubFeatureSectionId | "assinar";

export type FlightReviewClubLpSection = {
  id: FlightReviewClubLpSectionId;
  navLabel: string;
  eyebrow: string;
  title: string;
  copy: string;
};

export type LpMockupId =
  | "telemetry"
  | "share"
  | "review"
  | "planning"
  | "schedule"
  | "journey"
  | "stickers"
  | "album"
  | "marketplace"
  | "webinar"
  | "partners"
  | "kit"
  | "training";

export type LpScreenshotSlotId = LpMockupId;

export type FlightReviewClubBenefitItem = {
  sectionId: FlightReviewClubFeatureSectionId;
  text: string;
  imageUrl: string;
};

export type FlightReviewClubScreenshotItem = {
  id: string;
  sectionId: FlightReviewClubFeatureSectionId;
  title: string;
  description: string;
  imageUrl: string;
  frameUrl: string;
  mockupId: LpMockupId | "";
};

export type FlightReviewClubChecklistTemplateItem = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export type FlightReviewClubTrainingLessonKind = "vimeo" | "pdf";

export type FlightReviewClubTrainingLesson = {
  id: string;
  title: string;
  description: string;
  kind: FlightReviewClubTrainingLessonKind;
  vimeoUrl: string;
  pdfUrl: string;
  durationLabel: string;
  enabled: boolean;
};

export type FlightReviewClubTrainingCourse = {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string;
  enabled: boolean;
  sortOrder: number;
  lessons: FlightReviewClubTrainingLesson[];
};

export type FlightReviewClubPricingRule = {
  id: string;
  trainingTrackId: string;
  trainingTrackName: string;
  minHours: number;
  maxHours: number | null;
  amount: number;
  discountPercent: number;
  active: boolean;
};

export type FlightReviewClubBillingMode = "legacy_one_time" | "student_subscription" | "both";

export type FlightReviewClubSubscriptionPlanKey = "monthly" | "quarterly" | "semiannual" | "annual";

export type FlightReviewClubSubscriptionPlan = {
  id: FlightReviewClubSubscriptionPlanKey;
  label: string;
  description: string;
  recurrencePeriodDays: number;
  amount: number;
  enabled: boolean;
};

export type FlightReviewClubRules = {
  enabled: boolean;
  landingPageType: FlightReviewClubLpType;
  externalUrl: string;
  showInStudentMenu: boolean;
  billingMode: FlightReviewClubBillingMode;
  caktoSubscriptionProductId: string;
  benefits: string[];
  ctaSubscriptionUrl: string;
  adhesionTermUrl: string;
  trialFlightCount: number;
  lpHeroTitle: string;
  lpHeroSubtitle: string;
  lpHeroEyebrow: string;
  lpHeroChips: string[];
  lpCoverImageUrl: string;
  lpCtaLabel: string;
  lpValueProps: string[];
  lpBenefitItems: FlightReviewClubBenefitItem[];
  lpScreenshotItems: FlightReviewClubScreenshotItem[];
  lpSections: FlightReviewClubLpSection[];
  checklistTemplate: FlightReviewClubChecklistTemplateItem[];
  pricingRules: FlightReviewClubPricingRule[];
  subscriptionPlans: FlightReviewClubSubscriptionPlan[];
  exclusiveStudentTabs: StudentPortalTab[];
  trainingCourses: FlightReviewClubTrainingCourse[];
};

export type SoloFlightAutomaticCriterionKey =
  | "recentDualCommand"
  | "minimumAge"
  | "activeEndorsement"
  | "cutoffBefore"
  | "previousDestinationNavigation"
  | "previousAlternateFlight"
  | "metarAlunoSolo";

export type SoloFlightManualCriterion = {
  id: string;
  label: string;
  enabled: boolean;
};

export type SoloFlightRules = {
  enabled: boolean;
  automaticCriteria: Record<SoloFlightAutomaticCriterionKey, boolean>;
  dualCommandWindowDays: number;
  minimumAge: number;
  cutoffBeforeTime: string;
  /** Horário de corte exclusivo para alunos do curso de piloto privado. */
  cutoffBeforeTimePrivatePilot: string;
  metarMinimumCondition: "aluno_solo";
  manualCriteria: SoloFlightManualCriterion[];
};

export type StudentPortalTab =
  | "home"
  | "jornada"
  | "meus-voos"
  | "agendamento"
  | "schedule"
  | "creditos"
  | "avisos"
  | "manuais"
  | "treinamento-frc"
  | "manobras"
  | "ajuda"
  | "endossos"
  | "perfil"
  | "indique-ganhe"
  | "aisweb"
  | "planejamento"
  | "whatsapp"
  | "album"
  | "painel"
  | "marketplace"
  | "provas"
  | "fpl-sim"
  | "dre"       // EDB — opcional, desativado por padrão
  | "fuelings"  // Abastecimentos — opcional, desativado por padrão
  | "contratos"; // Contratos — opcional, desativado por padrão

export const SCHOOL_FONT_OPTIONS = [
  { id: "", label: "Padrão do sistema" },
  { id: "Inter", label: "Inter" },
  { id: "Poppins", label: "Poppins" },
  { id: "Roboto", label: "Roboto" },
  { id: "Lato", label: "Lato" },
  { id: "Nunito", label: "Nunito" },
  { id: "Montserrat", label: "Montserrat" },
] as const;

export type SchoolFontFamily = (typeof SCHOOL_FONT_OPTIONS)[number]["id"];

export type PlatformThemeRules = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  fontFamily?: SchoolFontFamily | string;
  colorMode?: "dark" | "light";
};

export type FlightScheduleRules = {
  mode: "booking" | "view" | "closed" | "intentions";
  /** Quando true, a escala não é salva no sistema: o SAGA é o backend (leitura/edição direta dos eventos). */
  sagaOnlySchedule: boolean;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotMinutes: 15 | 30 | 45 | 60;
  scheduleStartTime: string; // HH:MM — earliest dispatch time
  minRequestHours: number;
  maxRequestHours: number;
  weekdayMinHours: number;
  weekdayMaxHours: number;
  weekendMinHours: number;
  weekendMaxHours: number;
  weekdayMaxFlightsPerDay: number | null;
  weekendMaxFlightsPerDay: number | null;
  /** Limites semanais do aluno (somente horas de voo e quantidade de voos; null = sem limite). */
  weeklyMaxFlightHours: number | null;
  weeklyMaxFlights: number | null;
  weekendMaxFlightHours: number | null;
  weekendMaxFlights: number | null;
  /** Permite 1h de voo com crédito entre 0 e -0,5h (aviso de reposição exibido ao aluno). */
  allowZeroCreditOneHour: boolean;
  allowStudentFlightIntentions: boolean;
  requireCreditsForIntentions: boolean;
  requireCreditsForBooking: boolean;
  allowNightFlights: boolean;
  nightFlightStartHour: number; // decimal hours, e.g. 18.5 = 18:30
  nightBookingWeekdays: number[];
  cancellationPenalty48hPct: number;
  cancellationPenalty24hPct: number;
  cancellationPenalty12hPct: number;
  cancellationPenalty1hPct: number;
  autoDebitCancellationPenalty: boolean;
  minBookingLeadDays: number;
  maxBookingLeadDays: number;
  maxBookingLeadDaysFrc: number;
  /** Matrículas (agendas SAGA) OCULTAS para o aluno na escala — ele não vê nem agenda nelas. */
  studentHiddenAircraftIdents: string[];
  /**
   * Agendas (SAGA) que funcionam como LISTA DE ESPERA: o aluno só consegue agendar nelas
   * quando nenhum avião real está livre no horário; a confirmação depende de ajustes/cancelamentos.
   */
  studentWaitlistAircraftIdents: string[];
  /** Exibe alerta/flag de probabilidade de parada por manutenção na escala. */
  maintenanceAlertEnabled: boolean;
  /** Impede novas marcações de alunos nos dias de risco alto (parada mais provável). */
  maintenanceBlockLikelyDowntime: boolean;
  /** Média de horas voadas por dia usada na previsão teórica de manutenção. */
  maintenanceAvgHoursPerDay: number;
};

export type EmailNotificationRule = {
  enabled: boolean;
  customNotice: string;
};

export type SchoolRules = {
  studentTabs: Record<StudentPortalTab, boolean>;
  theme: PlatformThemeRules;
  schedule: FlightScheduleRules;
  scheduleStudentHelp: ScheduleStudentHelpConfig;
  emailNotifications: Record<NotificationEventType, EmailNotificationRule>;
  flightReviewClub: FlightReviewClubRules;
  flightEvaluation: FlightEvaluationRules;
  soloFlight: SoloFlightRules;
  capacityProjection: CapacityProjectionSettings;
  updatedAt: string | null;
};

export type SchoolRulesInput = Omit<SchoolRules, "updatedAt" | "capacityProjection"> & {
  capacityProjection?: CapacityProjectionSettings;
};

export const STUDENT_PORTAL_TAB_OPTIONS: Array<{ id: StudentPortalTab; label: string; defaultEnabled?: boolean }> = [
  { id: "home", label: "Home" },
  { id: "jornada", label: "Jornada" },
  { id: "meus-voos", label: "Meus voos" },
  { id: "agendamento", label: "Agendamento" },
  { id: "schedule", label: "Escala" },
  { id: "creditos", label: "Créditos" },
  { id: "avisos", label: "Avisos" },
  { id: "manuais", label: "Manuais" },
  { id: "treinamento-frc", label: "Treinamento FRC" },
  { id: "manobras", label: "Manobras" },
  { id: "provas", label: "Provas" },
  { id: "fpl-sim", label: "Simulador FPL" },
  { id: "ajuda", label: "Ajuda" },
  { id: "endossos", label: "Endossos" },
  { id: "perfil", label: "Perfil" },
  { id: "indique-ganhe", label: "Indique e ganhe" },
  { id: "aisweb", label: "Meteorologia" },
  { id: "planejamento", label: "Planejamento", defaultEnabled: false },
  { id: "whatsapp", label: "WhatsApp", defaultEnabled: false },
  { id: "album", label: "Álbum" },
  { id: "painel", label: "Painel" },
  // Abas opcionais — desativadas por padrão, admin pode ativar por escola e/ou por role
  { id: "marketplace", label: "Marketplace", defaultEnabled: false },
  { id: "dre", label: "EDB", defaultEnabled: false },
  { id: "fuelings", label: "Abastecimentos", defaultEnabled: false },
  { id: "contratos", label: "Contratos", defaultEnabled: false },
];

export const EMAIL_NOTIFICATION_EVENT_OPTIONS: Array<{ id: NotificationEventType; label: string }> = [
  { id: "flight.scheduled", label: "Voo agendado" },
  { id: "flight.updated", label: "Voo alterado" },
  { id: "flight.reopened", label: "Voo reaberto" },
  { id: "flight.cancelled", label: "Voo cancelado" },
  { id: "flight.reminder_24h", label: "Lembrete 24h antes" },
  { id: "weeklyPlan.submitted", label: "Intenção enviada" },
  { id: "notice.published", label: "Novo aviso" },
  { id: "schedule.published", label: "Escala gerada" },
  { id: "cakto.sale_approved", label: "Venda LastLink aprovada (admins)" },
  { id: "marketplace.order_paid", label: "Compra marketplace confirmada (comprador)" },
];

export const DEFAULT_FLIGHT_REVIEW_CLUB_SUBSCRIPTION_PLANS: FlightReviewClubSubscriptionPlan[] = [
  {
    id: "monthly",
    label: "Mensal",
    description: "Cobrança mensal recorrente.",
    recurrencePeriodDays: 30,
    amount: 0,
    enabled: false,
  },
  {
    id: "quarterly",
    label: "Trimestral",
    description: "Cobrança a cada 3 meses.",
    recurrencePeriodDays: 90,
    amount: 0,
    enabled: false,
  },
  {
    id: "semiannual",
    label: "Semestral",
    description: "Cobrança a cada 6 meses.",
    recurrencePeriodDays: 180,
    amount: 0,
    enabled: false,
  },
  {
    id: "annual",
    label: "Anual",
    description: "Cobrança anual recorrente.",
    recurrencePeriodDays: 365,
    amount: 0,
    enabled: false,
  },
];

export const DEFAULT_LP_SECTIONS: FlightReviewClubLpSection[] = [
  { id: "gravacao", navLabel: "Gravação", eyebrow: "Gravação dos voos", title: "Fonia, telemetria, figurinhas, link público e fotos.", copy: "Cada voo vira um pacote completo: áudio, dados, cards para WhatsApp, página para compartilhar e o álbum de fotos." },
  { id: "agenda", navLabel: "Agenda", eyebrow: "Agendamento", title: "Reserve com 30 dias de antecedência.", copy: "Integrantes do FRC abrem a agenda além da janela dos demais alunos e chegam mais cedo na escala." },
  { id: "premium", navLabel: "Premium", eyebrow: "Plataforma premium", title: "Recursos exclusivos e 1 webinar por mês.", copy: "Além das funcionalidades premium no portal, o clube inclui um webinar exclusivo todo mês." },
  { id: "parceiros", navLabel: "Parceiros", eyebrow: "Parceiros", title: "Acesso ao Clube 360 e ao NexAtlas.", copy: "Parcerias da escola liberadas para quem assina o Flight Review Club." },
  { id: "treinamento", navLabel: "Treinamento", eyebrow: "Treinamento FRC", title: "Cursos, aulas em vídeo e e-books exclusivos.", copy: "Integrantes do clube acessam o treinamento FRC com aulas em vídeo e materiais em PDF." },
  { id: "marketplace", navLabel: "Loja", eyebrow: "Marketplace", title: "Desconto exclusivo na loja da escola.", copy: "O preço FRC aparece no card do produto para integrantes do clube." },
  { id: "kit", navLabel: "Kit", eyebrow: "Kit da escola", title: "Camisa e crachá exclusivos.", copy: "Na primeira assinatura, a escola entrega a camisa e o crachá do Flight Review Club." },
  { id: "assinar", navLabel: "Assinar", eyebrow: "Assinatura", title: "Entre, revise seus voos e acompanhe sua jornada.", copy: "O cancelamento programado mantém o acesso até o fim do período pago." },
];

export const DEFAULT_LP_SCREENSHOT_ITEMS: FlightReviewClubScreenshotItem[] = [
  { id: "telemetry", sectionId: "gravacao", title: "Telemetria", description: "Dados do voo em gráficos.", imageUrl: "", frameUrl: "epeac.app / telemetria", mockupId: "telemetry" },
  { id: "share", sectionId: "gravacao", title: "Link público", description: "Página compartilhável do Flight Review.", imageUrl: "", frameUrl: "epeac.app / share", mockupId: "share" },
  { id: "review", sectionId: "gravacao", title: "Flight Review", description: "Manobras e pontos de melhoria.", imageUrl: "", frameUrl: "epeac.app / flight-review", mockupId: "review" },
  { id: "stickers", sectionId: "gravacao", title: "Figurinhas", description: "Cards e animações do voo.", imageUrl: "", frameUrl: "epeac.app / figurinhas", mockupId: "stickers" },
  { id: "album", sectionId: "gravacao", title: "Álbum", description: "Vídeos com fonia e fotos.", imageUrl: "", frameUrl: "epeac.app / album", mockupId: "album" },
  { id: "planning", sectionId: "agenda", title: "Planejamento", description: "Rotas, aeródromos e meteorologia.", imageUrl: "", frameUrl: "epeac.app / planejamento", mockupId: "planning" },
  { id: "schedule", sectionId: "agenda", title: "Agenda", description: "Reserva com antecedência de 30 dias.", imageUrl: "", frameUrl: "epeac.app / agendamento", mockupId: "schedule" },
  { id: "journey", sectionId: "premium", title: "Portal premium", description: "Funcionalidades exclusivas da plataforma.", imageUrl: "", frameUrl: "epeac.app / jornada", mockupId: "journey" },
  { id: "webinar", sectionId: "premium", title: "Webinar", description: "Encontro exclusivo todo mês.", imageUrl: "", frameUrl: "epeac.app / webinar", mockupId: "webinar" },
  { id: "partners", sectionId: "parceiros", title: "Parceiros", description: "Clube 360 e NexAtlas.", imageUrl: "", frameUrl: "epeac.app / parceiros", mockupId: "partners" },
  { id: "training", sectionId: "treinamento", title: "Treinamento", description: "Cursos, vídeos e e-books.", imageUrl: "", frameUrl: "epeac.app / treinamento-frc", mockupId: "training" },
  { id: "marketplace", sectionId: "marketplace", title: "Marketplace", description: "Descontos exclusivos FRC.", imageUrl: "", frameUrl: "epeac.app / marketplace", mockupId: "marketplace" },
  { id: "kit", sectionId: "kit", title: "Camisa e crachá", description: "Kit da escola na primeira assinatura.", imageUrl: "", frameUrl: "epeac.app / kit", mockupId: "kit" },
];

const LEGACY_LP_SCREENSHOT_IDS = ["telemetry", "share", "planning", "journey", "album", "marketplace"];

const LP_MOCKUP_IDS: LpMockupId[] = [
  "telemetry", "share", "review", "planning", "schedule", "journey",
  "stickers", "album", "marketplace", "webinar", "partners", "kit", "training",
];

function isFeatureSectionId(value: string): value is FlightReviewClubFeatureSectionId {
  return (LP_FEATURE_SECTION_IDS as readonly string[]).includes(value);
}

export function classifyLpBenefitSection(text: string): FlightReviewClubFeatureSectionId {
  const value = text.toLowerCase();
  if (/(agenda|anteced|planej)/.test(value)) return "agenda";
  if (/(nexatlas|clube 360)/.test(value)) return "parceiros";
  if (/(treinamento frc|e-book|ebook|aula em v[ií]deo)/.test(value)) return "treinamento";
  if (/(marketplace|desconto)/.test(value)) return "marketplace";
  if (/(camiseta|camisa|crach)/.test(value)) return "kit";
  if (/(webinar|ead|curso|jornada|premium|funcionalidade)/.test(value)) return "premium";
  return "gravacao";
}

function sanitizeLpScreenshotItems(raw: unknown): FlightReviewClubScreenshotItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LP_SCREENSHOT_ITEMS.map((item) => ({ ...item }));
  if (raw.length === 0) return [];
  const defaultsById = new Map(DEFAULT_LP_SCREENSHOT_ITEMS.map((slot) => [slot.id, slot]));
  const seen = new Set<string>();
  const result: FlightReviewClubScreenshotItem[] = [];
  raw.forEach((item, index) => {
    const rawId = String(item?.id ?? "").trim() || LEGACY_LP_SCREENSHOT_IDS[index] || `shot-${index + 1}`;
    const id = rawId.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const slot = defaultsById.get(id);
    const title = String(item?.title ?? "").slice(0, 120).trim();
    const imageUrl = String(item?.imageUrl ?? "").slice(0, 4096).trim();
    const sectionId = String(item?.sectionId ?? "").trim();
    const mockupId = String(item?.mockupId ?? "").trim();
    const resolvedSection = isFeatureSectionId(sectionId) ? sectionId : slot?.sectionId;
    if (!resolvedSection) return;
    result.push({
      id,
      sectionId: resolvedSection,
      title: title || slot?.title || "Print",
      description: String(item?.description ?? "").slice(0, 400).trim() || slot?.description || "",
      imageUrl,
      frameUrl: String(item?.frameUrl ?? "").slice(0, 120).trim() || slot?.frameUrl || "epeac.app",
      mockupId: LP_MOCKUP_IDS.includes(mockupId as LpMockupId) ? mockupId as LpMockupId : (slot?.mockupId ?? ""),
    });
  });
  return ensureLpScreenshotCoverage(result).slice(0, 30);
}

export function ensureLpScreenshotCoverage(items: FlightReviewClubScreenshotItem[]): FlightReviewClubScreenshotItem[] {
  const presentSections = new Set(items.map((item) => item.sectionId));
  const extras = DEFAULT_LP_SCREENSHOT_ITEMS.filter((slot) => !presentSections.has(slot.sectionId));
  return extras.length === 0 ? items : [...items, ...extras.map((item) => ({ ...item }))];
}

function sanitizeLpSections(raw: unknown): FlightReviewClubLpSection[] {
  const list = Array.isArray(raw) ? raw : [];
  const byId = new Map<string, FlightReviewClubLpSection>();
  list.forEach((item) => {
    const id = String(item?.id ?? "").trim() as FlightReviewClubLpSectionId;
    if (!DEFAULT_LP_SECTIONS.some((section) => section.id === id)) return;
    byId.set(id, {
      id,
      navLabel: String(item?.navLabel ?? "").slice(0, 40).trim(),
      eyebrow: String(item?.eyebrow ?? "").slice(0, 80).trim(),
      title: String(item?.title ?? "").slice(0, 180).trim(),
      copy: String(item?.copy ?? "").slice(0, 600).trim(),
    });
  });
  return DEFAULT_LP_SECTIONS.map((section) => {
    const saved = byId.get(section.id);
    return {
      id: section.id,
      navLabel: saved?.navLabel || section.navLabel,
      eyebrow: saved?.eyebrow || section.eyebrow,
      title: saved?.title || section.title,
      copy: saved?.copy || section.copy,
    };
  });
}

export function ensureLpBenefitCoverage(items: FlightReviewClubBenefitItem[]): FlightReviewClubBenefitItem[] {
  if (items.some((item) => item.sectionId === "treinamento")) return items;
  const extras = DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpBenefitItems.filter((item) => item.sectionId === "treinamento");
  return [...items, ...extras.map((item) => ({ ...item }))].slice(0, 40);
}

function normalizeTrainingLessonKind(value: unknown): FlightReviewClubTrainingLessonKind {
  return value === "pdf" ? "pdf" : "vimeo";
}

export function normalizeFlightReviewClubTrainingCourses(raw: unknown): FlightReviewClubTrainingCourse[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((course, index) => {
      const id = String(course?.id || `frc-course-${index + 1}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64);
      const title = String(course?.title ?? "").trim().slice(0, 140);
      const lessons: Array<Record<string, unknown>> = Array.isArray(course?.lessons) ? course.lessons : [];
      return {
        id,
        title,
        description: String(course?.description ?? "").trim().slice(0, 800),
        coverImageUrl: String(course?.coverImageUrl ?? "").trim().slice(0, 2048),
        enabled: course?.enabled !== false,
        sortOrder: Number.isFinite(Number(course?.sortOrder)) ? Math.round(Number(course.sortOrder)) : index,
        lessons: lessons
          .map((lesson: Record<string, unknown>, lessonIndex: number) => {
            const lessonId = String(lesson?.id || `${id}-lesson-${lessonIndex + 1}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64);
            const kind = normalizeTrainingLessonKind(lesson?.kind);
            return {
              id: lessonId,
              title: String(lesson?.title ?? "").trim().slice(0, 140),
              description: String(lesson?.description ?? "").trim().slice(0, 600),
              kind,
              vimeoUrl: String(lesson?.vimeoUrl ?? "").trim().slice(0, 2048),
              pdfUrl: String(lesson?.pdfUrl ?? "").trim().slice(0, 2048),
              durationLabel: String(lesson?.durationLabel ?? "").trim().slice(0, 40),
              enabled: lesson?.enabled !== false,
            };
          })
          .filter((lesson) => lesson.id && lesson.title && (lesson.kind === "pdf" ? lesson.pdfUrl : lesson.vimeoUrl))
          .slice(0, 80),
      };
    })
    .filter((course) => course.id && course.title)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 40);
}

export const DEFAULT_FLIGHT_REVIEW_CLUB_RULES: FlightReviewClubRules = {
  enabled: true,
  landingPageType: "internal_public_page",
  externalUrl: "",
  showInStudentMenu: false,
  billingMode: "both",
  caktoSubscriptionProductId: "",
  benefits: [
    "Gravação dos voos com fonia.",
    "Telemetria de cada voo.",
    "Figurinhas e animações.",
    "Link público para compartilhar o voo.",
    "Acesso às fotos do voo.",
    "Agendamento com 30 dias de antecedência.",
    "Funcionalidades premium na plataforma.",
    "1 webinar exclusivo por mês.",
    "Acesso ao Clube 360.",
    "Acesso ao NexAtlas.",
    "Desconto no marketplace.",
    "Camisa da escola.",
    "Crachá exclusivo.",
  ],
  ctaSubscriptionUrl: "",
  adhesionTermUrl: "",
  trialFlightCount: 100,
  lpHeroTitle: "Flight Review Club",
  lpHeroSubtitle:
    "Assine o pacote premium para revisar cada voo com telemetria, vídeos, fotos, planejamento, benefícios manuais e vantagens exclusivas da escola.",
  lpHeroEyebrow: "Assinatura premium de formação",
  lpHeroChips: ["Gravação", "Agenda 30 dias", "Premium", "Parceiros", "Marketplace", "Kit"],
  lpCoverImageUrl: "",
  lpCtaLabel: "Assinar o Flight Review Club",
  lpValueProps: [
    "Revise seus voos com dados reais e chegue mais preparado para a próxima aula.",
    "Tenha acesso aos materiais, descontos e ferramentas que ajudam a manter o ritmo da formação.",
    "Acompanhe sua jornada com histórico, figurinhas e registros visuais dos seus voos.",
  ],
  lpBenefitItems: [
    { sectionId: "gravacao", text: "Gravação dos voos com fonia", imageUrl: "" },
    { sectionId: "gravacao", text: "Telemetria de cada voo", imageUrl: "" },
    { sectionId: "gravacao", text: "Figurinhas e animações", imageUrl: "" },
    { sectionId: "gravacao", text: "Link público para compartilhar o voo", imageUrl: "" },
    { sectionId: "gravacao", text: "Acesso às fotos do voo", imageUrl: "" },
    { sectionId: "agenda", text: "Agendamento com 30 dias de antecedência", imageUrl: "" },
    { sectionId: "premium", text: "Funcionalidades premium na plataforma", imageUrl: "" },
    { sectionId: "premium", text: "1 webinar exclusivo por mês", imageUrl: "" },
    { sectionId: "parceiros", text: "Acesso ao Clube 360", imageUrl: "" },
    { sectionId: "parceiros", text: "Acesso ao NexAtlas", imageUrl: "" },
    { sectionId: "treinamento", text: "Cursos exclusivos do Flight Review Club", imageUrl: "" },
    { sectionId: "treinamento", text: "Aulas em vídeo e e-books em PDF", imageUrl: "" },
    { sectionId: "marketplace", text: "Desconto no marketplace", imageUrl: "" },
    { sectionId: "kit", text: "Camisa da escola", imageUrl: "" },
    { sectionId: "kit", text: "Crachá exclusivo", imageUrl: "" },
  ],
  lpScreenshotItems: DEFAULT_LP_SCREENSHOT_ITEMS.map((item) => ({ ...item })),
  lpSections: DEFAULT_LP_SECTIONS.map((item) => ({ ...item })),
  checklistTemplate: [
    { id: "nexatlas", title: "Liberar NexAtlas", description: "Criar ou liberar o acesso gratuito do aluno ao NexAtlas.", enabled: true },
    { id: "clube-360", title: "Liberar Clube 360", description: "Criar ou liberar o acesso gratuito do aluno ao Clube 360.", enabled: true },
    { id: "curso-ead", title: "Enviar Curso EAD", description: "Enviar instruções de acesso ao Curso de Segurança de Voo EAD.", enabled: true },
    { id: "camiseta", title: "Entregar camiseta", description: "Separar e registrar a entrega da camiseta da escola.", enabled: true },
    { id: "cracha", title: "Entregar crachá", description: "Emitir e registrar a entrega do crachá exclusivo.", enabled: true },
    { id: "webinars", title: "Incluir em lista de webinars", description: "Adicionar o integrante na lista de comunicação dos webinars exclusivos.", enabled: true },
    { id: "marketplace", title: "Conferir desconto marketplace", description: "Conferir se os descontos FRC aparecem corretamente no marketplace.", enabled: true },
  ],
  pricingRules: [],
  subscriptionPlans: DEFAULT_FLIGHT_REVIEW_CLUB_SUBSCRIPTION_PLANS,
  exclusiveStudentTabs: [],
  trainingCourses: [],
};

export const DEFAULT_SOLO_FLIGHT_RULES: SoloFlightRules = {
  enabled: true,
  automaticCriteria: {
    recentDualCommand: true,
    minimumAge: true,
    activeEndorsement: true,
    cutoffBefore: true,
    previousDestinationNavigation: true,
    previousAlternateFlight: true,
    metarAlunoSolo: true,
  },
  dualCommandWindowDays: 5,
  minimumAge: 18,
  cutoffBeforeTime: "19:00",
  cutoffBeforeTimePrivatePilot: "19:00",
  metarMinimumCondition: "aluno_solo",
  manualCriteria: [
    {
      id: "endorsement_printed",
      label: "Aluno está com o endosso impresso",
      enabled: true,
    },
    {
      id: "two_positive_evaluations",
      label: "Aluno avaliado positivamente por dois instrutores ou pelo coordenador",
      enabled: true,
    },
    {
      id: "anac_board_private_pilot",
      label: "Piloto privado: aluno aprovado na Banca da ANAC",
      enabled: true,
    },
    {
      id: "critical_positions_briefing",
      label: "Briefing mencionou posições críticas da CTR Jundiaí",
      enabled: true,
    },
  ],
};

export const DEFAULT_PLATFORM_THEME_RULES: PlatformThemeRules = {
  primaryColor: "#10b981",
  accentColor: "#38bdf8",
  backgroundColor: "#020617",
  surfaceColor: "#0f172a",
  fontFamily: "",
  colorMode: "dark",
};

export const DEFAULT_FLIGHT_SCHEDULE_RULES: FlightScheduleRules = {
  mode: "intentions",
  sagaOnlySchedule: false,
  bufferBeforeMinutes: 30,
  bufferAfterMinutes: 15,
  slotMinutes: 30,
  scheduleStartTime: "06:00",
  minRequestHours: 1,
  maxRequestHours: 4,
  weekdayMinHours: 1,
  weekdayMaxHours: 4,
  weekendMinHours: 1,
  weekendMaxHours: 4,
  weekdayMaxFlightsPerDay: null,
  weekendMaxFlightsPerDay: null,
  weeklyMaxFlightHours: null,
  weeklyMaxFlights: null,
  weekendMaxFlightHours: null,
  weekendMaxFlights: null,
  allowZeroCreditOneHour: false,
  allowStudentFlightIntentions: true,
  requireCreditsForIntentions: false,
  requireCreditsForBooking: false,
  allowNightFlights: false,
  nightFlightStartHour: 18,
  nightBookingWeekdays: [],
  cancellationPenalty48hPct: 0,
  cancellationPenalty24hPct: 0,
  cancellationPenalty12hPct: 0,
  cancellationPenalty1hPct: 0,
  autoDebitCancellationPenalty: false,
  minBookingLeadDays: 0,
  maxBookingLeadDays: 365,
  maxBookingLeadDaysFrc: 365,
  studentHiddenAircraftIdents: [],
  studentWaitlistAircraftIdents: [],
  maintenanceAlertEnabled: false,
  maintenanceBlockLikelyDowntime: false,
  maintenanceAvgHoursPerDay: 5,
};

export const DEFAULT_STUDENT_TABS: Record<StudentPortalTab, boolean> = STUDENT_PORTAL_TAB_OPTIONS.reduce(
  (acc, item) => ({ ...acc, [item.id]: item.defaultEnabled ?? true }),
  {} as Record<StudentPortalTab, boolean>,
);

export const DEFAULT_EMAIL_NOTIFICATION_RULES: Record<NotificationEventType, EmailNotificationRule> =
  EMAIL_NOTIFICATION_EVENT_OPTIONS.reduce(
    (acc, item) => ({
      ...acc,
      [item.id]: {
        enabled: true,
        customNotice: "",
      },
    }),
    {} as Record<NotificationEventType, EmailNotificationRule>,
  );

export const DEFAULT_SCHEDULE_STUDENT_HELP: ScheduleStudentHelpConfig = defaultScheduleStudentHelp(
  DEFAULT_FLIGHT_SCHEDULE_RULES.mode,
);

export const DEFAULT_SCHOOL_RULES: SchoolRules = {
  studentTabs: DEFAULT_STUDENT_TABS,
  theme: DEFAULT_PLATFORM_THEME_RULES,
  schedule: DEFAULT_FLIGHT_SCHEDULE_RULES,
  scheduleStudentHelp: DEFAULT_SCHEDULE_STUDENT_HELP,
  emailNotifications: DEFAULT_EMAIL_NOTIFICATION_RULES,
  flightReviewClub: DEFAULT_FLIGHT_REVIEW_CLUB_RULES,
  flightEvaluation: DEFAULT_FLIGHT_EVALUATION_RULES,
  soloFlight: DEFAULT_SOLO_FLIGHT_RULES,
  capacityProjection: DEFAULT_CAPACITY_PROJECTION_SETTINGS,
  updatedAt: null,
};

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function normalizeHours(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed * 2) / 2;
}

function normalizePositiveHours(value: unknown, fallback: number): number {
  return Math.max(0.25, normalizeHours(value, fallback));
}

function normalizeInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeNullableLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeNullableHours(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 2) / 2 : null;
}

function normalizeMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

function normalizeTime(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function normalizeSoloFlightRules(input: unknown): SoloFlightRules {
  const raw = input && typeof input === "object" ? (input as Partial<SoloFlightRules>) : {};
  const defaults = DEFAULT_SOLO_FLIGHT_RULES;
  const rawAuto: Partial<Record<SoloFlightAutomaticCriterionKey, boolean>> =
    raw.automaticCriteria && typeof raw.automaticCriteria === "object" ? raw.automaticCriteria : {};
  const automaticCriteria = (Object.keys(defaults.automaticCriteria) as SoloFlightAutomaticCriterionKey[]).reduce(
    (acc, key) => ({
      ...acc,
      [key]: rawAuto[key] ?? defaults.automaticCriteria[key],
    }),
    {} as Record<SoloFlightAutomaticCriterionKey, boolean>,
  );
  const manualCriteria = (Array.isArray(raw.manualCriteria) ? raw.manualCriteria : defaults.manualCriteria)
    .map((item, index) => ({
      id: String(item?.id || `manual_${index + 1}`).replace(/[^a-z0-9_:-]/gi, "_").slice(0, 64),
      label: String(item?.label || "").trim().slice(0, 240),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => item.id && item.label)
    .slice(0, 20);
  const cutoffBeforeTime = normalizeTime(raw.cutoffBeforeTime, defaults.cutoffBeforeTime);
  const cutoffBeforeTimePrivatePilot = normalizeTime(
    raw.cutoffBeforeTimePrivatePilot,
    defaults.cutoffBeforeTimePrivatePilot,
  );
  return {
    enabled: raw.enabled !== false,
    automaticCriteria,
    dualCommandWindowDays: normalizeInteger(raw.dualCommandWindowDays, 1, 30, defaults.dualCommandWindowDays),
    minimumAge: normalizeInteger(raw.minimumAge, 14, 80, defaults.minimumAge),
    cutoffBeforeTime: cutoffBeforeTime === "16:00" ? "19:00" : cutoffBeforeTime,
    cutoffBeforeTimePrivatePilot,
    metarMinimumCondition: "aluno_solo",
    manualCriteria: manualCriteria.length ? manualCriteria : defaults.manualCriteria,
  };
}

export function soloFlightCutoffLimitTime(rules: Pick<SoloFlightRules, "cutoffBeforeTime" | "cutoffBeforeTimePrivatePilot">, isPrivatePilotStudent: boolean): string {
  if (isPrivatePilotStudent) {
    return rules.cutoffBeforeTimePrivatePilot || rules.cutoffBeforeTime;
  }
  return rules.cutoffBeforeTime;
}

export function normalizeSchoolRules(input: unknown): SchoolRules {
  const raw = input && typeof input === "object" ? (input as Partial<SchoolRules>) : {};
  const minRequestHours = Math.max(
    0.5,
    normalizeHours(raw.schedule?.minRequestHours, DEFAULT_FLIGHT_SCHEDULE_RULES.minRequestHours),
  );
  const maxRequestHours = Math.max(
    minRequestHours,
    normalizeHours(raw.schedule?.maxRequestHours, DEFAULT_FLIGHT_SCHEDULE_RULES.maxRequestHours),
  );

  return {
    studentTabs: STUDENT_PORTAL_TAB_OPTIONS.reduce(
      (acc, item) => ({
        ...acc,
        [item.id]: raw.studentTabs?.[item.id] ?? DEFAULT_STUDENT_TABS[item.id],
      }),
      {} as Record<StudentPortalTab, boolean>,
    ),
    theme: {
      primaryColor: isHexColor(raw.theme?.primaryColor)
        ? raw.theme.primaryColor
        : DEFAULT_PLATFORM_THEME_RULES.primaryColor,
      accentColor: isHexColor(raw.theme?.accentColor)
        ? raw.theme.accentColor
        : DEFAULT_PLATFORM_THEME_RULES.accentColor,
      backgroundColor: isHexColor(raw.theme?.backgroundColor)
        ? raw.theme.backgroundColor
        : DEFAULT_PLATFORM_THEME_RULES.backgroundColor,
      surfaceColor: isHexColor(raw.theme?.surfaceColor)
        ? raw.theme.surfaceColor
        : DEFAULT_PLATFORM_THEME_RULES.surfaceColor,
      fontFamily: typeof raw.theme?.fontFamily === "string" ? raw.theme.fontFamily : "",
      colorMode: raw.theme?.colorMode === "light" ? "light" : "dark",
    },
    schedule: {
      mode: ["booking", "view", "closed", "intentions"].includes(String(raw.schedule?.mode))
        ? raw.schedule!.mode
        : DEFAULT_FLIGHT_SCHEDULE_RULES.mode,
      sagaOnlySchedule: Boolean(raw.schedule?.sagaOnlySchedule),
      bufferBeforeMinutes: normalizeInteger(raw.schedule?.bufferBeforeMinutes, 0, 360, 30),
      bufferAfterMinutes: normalizeInteger(raw.schedule?.bufferAfterMinutes, 0, 360, 15),
      slotMinutes: ([15, 30, 45, 60].includes(Number(raw.schedule?.slotMinutes))
        ? Number(raw.schedule?.slotMinutes)
        : 30) as 15 | 30 | 45 | 60,
      scheduleStartTime: /^\d{2}:\d{2}$/.test(String(raw.schedule?.scheduleStartTime ?? ""))
        ? String(raw.schedule!.scheduleStartTime)
        : DEFAULT_FLIGHT_SCHEDULE_RULES.scheduleStartTime,
      minRequestHours,
      maxRequestHours,
      weekdayMinHours: normalizePositiveHours(raw.schedule?.weekdayMinHours, minRequestHours),
      weekdayMaxHours: normalizePositiveHours(raw.schedule?.weekdayMaxHours, maxRequestHours),
      weekendMinHours: normalizePositiveHours(raw.schedule?.weekendMinHours, minRequestHours),
      weekendMaxHours: normalizePositiveHours(raw.schedule?.weekendMaxHours, maxRequestHours),
      weekdayMaxFlightsPerDay: normalizeNullableLimit(raw.schedule?.weekdayMaxFlightsPerDay),
      weekendMaxFlightsPerDay: normalizeNullableLimit(raw.schedule?.weekendMaxFlightsPerDay),
      weeklyMaxFlightHours: normalizeNullableHours(raw.schedule?.weeklyMaxFlightHours),
      weeklyMaxFlights: normalizeNullableLimit(raw.schedule?.weeklyMaxFlights),
      weekendMaxFlightHours: normalizeNullableHours(raw.schedule?.weekendMaxFlightHours),
      weekendMaxFlights: normalizeNullableLimit(raw.schedule?.weekendMaxFlights),
      allowZeroCreditOneHour: Boolean(raw.schedule?.allowZeroCreditOneHour),
      allowStudentFlightIntentions:
        raw.schedule?.allowStudentFlightIntentions ?? DEFAULT_FLIGHT_SCHEDULE_RULES.allowStudentFlightIntentions,
      requireCreditsForIntentions:
        raw.schedule?.requireCreditsForIntentions ?? DEFAULT_FLIGHT_SCHEDULE_RULES.requireCreditsForIntentions,
      requireCreditsForBooking:
        raw.schedule?.requireCreditsForBooking ?? raw.schedule?.requireCreditsForIntentions ?? false,
      allowNightFlights:
        raw.schedule?.allowNightFlights ?? DEFAULT_FLIGHT_SCHEDULE_RULES.allowNightFlights,
      nightFlightStartHour: (() => {
        const h = Number(raw.schedule?.nightFlightStartHour);
        return Number.isFinite(h) && h >= 0 && h < 24 ? h : DEFAULT_FLIGHT_SCHEDULE_RULES.nightFlightStartHour;
      })(),
      nightBookingWeekdays: Array.isArray(raw.schedule?.nightBookingWeekdays)
        ? [...new Set(raw.schedule.nightBookingWeekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
        : [],
      cancellationPenalty48hPct: normalizeInteger(raw.schedule?.cancellationPenalty48hPct, 0, 100, 0),
      cancellationPenalty24hPct: normalizeInteger(raw.schedule?.cancellationPenalty24hPct, 0, 100, 0),
      cancellationPenalty12hPct: normalizeInteger(raw.schedule?.cancellationPenalty12hPct, 0, 100, 0),
      cancellationPenalty1hPct: normalizeInteger(raw.schedule?.cancellationPenalty1hPct, 0, 100, 0),
      autoDebitCancellationPenalty: Boolean(raw.schedule?.autoDebitCancellationPenalty),
      minBookingLeadDays: normalizeInteger(raw.schedule?.minBookingLeadDays, 0, 3650, 0),
      maxBookingLeadDays: normalizeInteger(raw.schedule?.maxBookingLeadDays, 0, 3650, 365),
      maxBookingLeadDaysFrc: normalizeInteger(
        raw.schedule?.maxBookingLeadDaysFrc,
        0,
        3650,
        normalizeInteger(raw.schedule?.maxBookingLeadDays, 0, 3650, 365),
      ),
      studentHiddenAircraftIdents: Array.isArray(raw.schedule?.studentHiddenAircraftIdents)
        ? [...new Set(raw.schedule.studentHiddenAircraftIdents.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
        : [],
      studentWaitlistAircraftIdents: Array.isArray(raw.schedule?.studentWaitlistAircraftIdents)
        ? [...new Set(raw.schedule.studentWaitlistAircraftIdents.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
        : [],
      maintenanceAlertEnabled: Boolean(raw.schedule?.maintenanceAlertEnabled),
      maintenanceBlockLikelyDowntime: Boolean(raw.schedule?.maintenanceBlockLikelyDowntime),
      maintenanceAvgHoursPerDay: Math.max(
        0.25,
        normalizeHours(raw.schedule?.maintenanceAvgHoursPerDay, DEFAULT_FLIGHT_SCHEDULE_RULES.maintenanceAvgHoursPerDay),
      ),
    },
    scheduleStudentHelp: normalizeScheduleStudentHelp(
      raw.scheduleStudentHelp,
      ["booking", "view", "closed", "intentions"].includes(String(raw.schedule?.mode))
        ? (raw.schedule!.mode as FlightScheduleRules["mode"])
        : DEFAULT_FLIGHT_SCHEDULE_RULES.mode,
    ),
    emailNotifications: EMAIL_NOTIFICATION_EVENT_OPTIONS.reduce(
      (acc, item) => ({
        ...acc,
        [item.id]: {
          enabled: raw.emailNotifications?.[item.id]?.enabled ?? true,
          customNotice: String(raw.emailNotifications?.[item.id]?.customNotice ?? "").slice(0, 500),
        },
      }),
      {} as Record<NotificationEventType, EmailNotificationRule>,
    ),
    flightReviewClub: (() => {
      const club = raw.flightReviewClub;
      const lpType = club?.landingPageType;
      return {
        enabled: Boolean(club?.enabled ?? false),
        landingPageType: lpType === "external_url" ? "external_url" : "internal_public_page",
        externalUrl: typeof club?.externalUrl === "string" ? club.externalUrl.slice(0, 2048) : "",
        showInStudentMenu: Boolean(club?.showInStudentMenu ?? false),
        billingMode: (
          club?.billingMode === "legacy_one_time" ||
          club?.billingMode === "student_subscription" ||
          club?.billingMode === "both"
        ) ? club.billingMode : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.billingMode,
        caktoSubscriptionProductId: typeof club?.caktoSubscriptionProductId === "string"
          ? club.caktoSubscriptionProductId.slice(0, 128)
          : "",
        benefits: Array.isArray(club?.benefits)
          ? club.benefits.map((b) => String(b).slice(0, 500)).filter(Boolean).slice(0, 40)
          : [],
        ctaSubscriptionUrl: typeof club?.ctaSubscriptionUrl === "string" ? club.ctaSubscriptionUrl.slice(0, 2048) : "",
        adhesionTermUrl: typeof club?.adhesionTermUrl === "string" ? club.adhesionTermUrl.slice(0, 2048) : "",
        trialFlightCount: (() => { const n = Number(club?.trialFlightCount ?? 0); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; })(),
        lpHeroTitle: typeof club?.lpHeroTitle === "string" && club.lpHeroTitle.trim()
          ? club.lpHeroTitle.slice(0, 180)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroTitle,
        lpHeroSubtitle: typeof club?.lpHeroSubtitle === "string" && club.lpHeroSubtitle.trim()
          ? club.lpHeroSubtitle.slice(0, 600)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroSubtitle,
        lpHeroEyebrow: typeof club?.lpHeroEyebrow === "string" && club.lpHeroEyebrow.trim()
          ? club.lpHeroEyebrow.slice(0, 80)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroEyebrow,
        lpHeroChips: Array.isArray(club?.lpHeroChips)
          ? club.lpHeroChips.map((chip) => String(chip).slice(0, 40).trim()).filter(Boolean).slice(0, 12)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroChips,
        lpCoverImageUrl: typeof club?.lpCoverImageUrl === "string" ? club.lpCoverImageUrl.slice(0, 2048) : "",
        lpCtaLabel: typeof club?.lpCtaLabel === "string" && club.lpCtaLabel.trim()
          ? club.lpCtaLabel.slice(0, 80)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpCtaLabel,
        lpValueProps: Array.isArray(club?.lpValueProps)
          ? club.lpValueProps.map((b) => String(b).slice(0, 500)).filter(Boolean).slice(0, 12)
          : [],
        lpBenefitItems: ensureLpBenefitCoverage(
          Array.isArray(club?.lpBenefitItems)
            ? club.lpBenefitItems
                .map((item) => {
                  const text = String(item?.text ?? "").slice(0, 500).trim();
                  const sectionId = String(item?.sectionId ?? "").trim();
                  return {
                    sectionId: isFeatureSectionId(sectionId) ? sectionId : classifyLpBenefitSection(text),
                    text,
                    imageUrl: String(item?.imageUrl ?? "").slice(0, 2048).trim(),
                  };
                })
                .filter((item) => item.text)
                .slice(0, 40)
            : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpBenefitItems.map((item) => ({ ...item })),
        ),
        lpScreenshotItems: sanitizeLpScreenshotItems(club?.lpScreenshotItems),
        lpSections: sanitizeLpSections(club?.lpSections),
        checklistTemplate: Array.isArray(club?.checklistTemplate)
          ? club.checklistTemplate
              .map((item, index) => ({
                id: String(item?.id || `frc-task-${index + 1}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64),
                title: String(item?.title ?? "").slice(0, 140).trim(),
                description: String(item?.description ?? "").slice(0, 500).trim(),
                enabled: item?.enabled !== false,
              }))
              .filter((item) => item.id && item.title)
              .slice(0, 30)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.checklistTemplate,
        pricingRules: Array.isArray(club?.pricingRules)
          ? club.pricingRules
              .map((rule, index) => {
                const minHours = Math.max(0, Number(rule?.minHours) || 0);
                const rawMax = rule?.maxHours === null || rule?.maxHours === undefined
                  ? null
                  : Number(rule.maxHours);
                const maxHours = Number.isFinite(rawMax) && rawMax !== null ? Math.max(minHours, rawMax) : null;
                return {
                  id: String(rule?.id || `frc-price-${index + 1}`).slice(0, 64),
                  trainingTrackId: String(rule?.trainingTrackId ?? "").slice(0, 128),
                  trainingTrackName: String(rule?.trainingTrackName ?? "").slice(0, 160),
                  minHours: Math.round(minHours * 10) / 10,
                  maxHours: maxHours === null ? null : Math.round(maxHours * 10) / 10,
                  amount: normalizeMoney(rule?.amount),
                  discountPercent: (() => {
                    const n = Number(rule?.discountPercent ?? 0);
                    return Number.isFinite(n) ? Math.min(95, Math.max(0, Math.round(n))) : 0;
                  })(),
                  active: rule?.active !== false,
                };
              })
              .filter((rule) => rule.trainingTrackId && rule.amount > 0)
              .slice(0, 50)
          : [],
        subscriptionPlans: DEFAULT_FLIGHT_REVIEW_CLUB_SUBSCRIPTION_PLANS.map((defaultPlan) => {
          const rawPlan = Array.isArray(club?.subscriptionPlans)
            ? club.subscriptionPlans.find((plan) => plan?.id === defaultPlan.id)
            : null;
          return {
            id: defaultPlan.id,
            label: String(rawPlan?.label || defaultPlan.label).trim().slice(0, 80) || defaultPlan.label,
            description: String(rawPlan?.description || defaultPlan.description).trim().slice(0, 240),
            recurrencePeriodDays: defaultPlan.recurrencePeriodDays,
            amount: normalizeMoney(rawPlan?.amount),
            enabled: Boolean(rawPlan?.enabled ?? defaultPlan.enabled),
          };
        }),
        exclusiveStudentTabs: Array.isArray(club?.exclusiveStudentTabs)
          ? [...new Set(
              club.exclusiveStudentTabs.filter((tab): tab is StudentPortalTab =>
                STUDENT_PORTAL_TAB_OPTIONS.some((item) => item.id === tab),
              ),
            )]
          : [],
        trainingCourses: normalizeFlightReviewClubTrainingCourses(club?.trainingCourses),
      };
    })(),
    flightEvaluation: normalizeFlightEvaluationRules(raw.flightEvaluation),
    soloFlight: normalizeSoloFlightRules(raw.soloFlight),
    capacityProjection: normalizeCapacityProjectionSettings(
      raw.capacityProjection,
      raw.schedule?.maintenanceAvgHoursPerDay ?? DEFAULT_FLIGHT_SCHEDULE_RULES.maintenanceAvgHoursPerDay,
    ),
    updatedAt: raw.updatedAt ?? null,
  };
}

