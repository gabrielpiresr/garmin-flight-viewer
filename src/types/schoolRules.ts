import type { NotificationEventType } from "./notification";
import type { ScheduleStudentHelpConfig } from "./scheduleStudentHelp";
import { defaultScheduleStudentHelp } from "../lib/scheduleStudentHelpDefaults";
import { normalizeScheduleStudentHelp } from "../lib/scheduleStudentHelp";
import {
  DEFAULT_FLIGHT_EVALUATION_RULES,
  normalizeFlightEvaluationRules,
  type FlightEvaluationRules,
} from "./flightEvaluation";

export type FlightReviewClubLpType = "internal_public_page" | "external_url";

export type FlightReviewClubBenefitItem = {
  text: string;
  imageUrl: string;
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

export type FlightReviewClubRules = {
  enabled: boolean;
  landingPageType: FlightReviewClubLpType;
  externalUrl: string;
  showInStudentMenu: boolean;
  benefits: string[];
  ctaSubscriptionUrl: string;
  adhesionTermUrl: string;
  trialFlightCount: number;
  lpHeroTitle: string;
  lpHeroSubtitle: string;
  lpCoverImageUrl: string;
  lpCtaLabel: string;
  lpValueProps: string[];
  lpBenefitItems: FlightReviewClubBenefitItem[];
  pricingRules: FlightReviewClubPricingRule[];
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
  | "manobras"
  | "ajuda"
  | "endossos"
  | "perfil"
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
  updatedAt: string | null;
};

export type SchoolRulesInput = Omit<SchoolRules, "updatedAt">;

export const STUDENT_PORTAL_TAB_OPTIONS: Array<{ id: StudentPortalTab; label: string; defaultEnabled?: boolean }> = [
  { id: "home", label: "Home" },
  { id: "jornada", label: "Jornada" },
  { id: "meus-voos", label: "Meus voos" },
  { id: "agendamento", label: "Agendamento" },
  { id: "schedule", label: "Escala" },
  { id: "creditos", label: "Créditos" },
  { id: "avisos", label: "Avisos" },
  { id: "manuais", label: "Manuais" },
  { id: "manobras", label: "Manobras" },
  { id: "ajuda", label: "Ajuda" },
  { id: "endossos", label: "Endossos" },
  { id: "perfil", label: "Perfil" },
  // Abas opcionais — desativadas por padrão, admin pode ativar por escola e/ou por role
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
  { id: "cakto.sale_approved", label: "Venda Cakto aprovada (admins)" },
];

export const DEFAULT_FLIGHT_REVIEW_CLUB_RULES: FlightReviewClubRules = {
  enabled: false,
  landingPageType: "internal_public_page",
  externalUrl: "",
  showInStudentMenu: false,
  benefits: [],
  ctaSubscriptionUrl: "",
  adhesionTermUrl: "",
  trialFlightCount: 0,
  lpHeroTitle: "Flight Review Club",
  lpHeroSubtitle:
    "Revise seus voos com telemetria, videos, fotos e dados reais para evoluir com mais clareza em cada etapa da formacao.",
  lpCoverImageUrl: "",
  lpCtaLabel: "Assinar o Flight Review Club",
  lpValueProps: [],
  lpBenefitItems: [],
  pricingRules: [],
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
  return {
    enabled: raw.enabled !== false,
    automaticCriteria,
    dualCommandWindowDays: normalizeInteger(raw.dualCommandWindowDays, 1, 30, defaults.dualCommandWindowDays),
    minimumAge: normalizeInteger(raw.minimumAge, 14, 80, defaults.minimumAge),
    cutoffBeforeTime: cutoffBeforeTime === "16:00" ? "19:00" : cutoffBeforeTime,
    metarMinimumCondition: "aluno_solo",
    manualCriteria: manualCriteria.length ? manualCriteria : defaults.manualCriteria,
  };
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
        benefits: Array.isArray(club?.benefits)
          ? club.benefits.map((b) => String(b).slice(0, 500)).filter(Boolean).slice(0, 20)
          : [],
        ctaSubscriptionUrl: typeof club?.ctaSubscriptionUrl === "string" ? club.ctaSubscriptionUrl.slice(0, 2048) : "",
        adhesionTermUrl: typeof club?.adhesionTermUrl === "string" ? club.adhesionTermUrl.slice(0, 2048) : "",
        trialFlightCount: (() => { const n = Number(club?.trialFlightCount ?? 0); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; })(),
        lpHeroTitle: typeof club?.lpHeroTitle === "string" && club.lpHeroTitle.trim()
          ? club.lpHeroTitle.slice(0, 120)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroTitle,
        lpHeroSubtitle: typeof club?.lpHeroSubtitle === "string" && club.lpHeroSubtitle.trim()
          ? club.lpHeroSubtitle.slice(0, 500)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpHeroSubtitle,
        lpCoverImageUrl: typeof club?.lpCoverImageUrl === "string" ? club.lpCoverImageUrl.slice(0, 2048) : "",
        lpCtaLabel: typeof club?.lpCtaLabel === "string" && club.lpCtaLabel.trim()
          ? club.lpCtaLabel.slice(0, 80)
          : DEFAULT_FLIGHT_REVIEW_CLUB_RULES.lpCtaLabel,
        lpValueProps: Array.isArray(club?.lpValueProps)
          ? club.lpValueProps.map((b) => String(b).slice(0, 500)).filter(Boolean).slice(0, 12)
          : [],
        lpBenefitItems: Array.isArray(club?.lpBenefitItems)
          ? club.lpBenefitItems
              .map((item) => ({
                text: String(item?.text ?? "").slice(0, 500).trim(),
                imageUrl: String(item?.imageUrl ?? "").slice(0, 2048).trim(),
              }))
              .filter((item) => item.text)
              .slice(0, 20)
          : [],
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
      };
    })(),
    flightEvaluation: normalizeFlightEvaluationRules(raw.flightEvaluation),
    soloFlight: normalizeSoloFlightRules(raw.soloFlight),
    updatedAt: raw.updatedAt ?? null,
  };
}

