import type { NotificationEventType } from "./notification";
import type { ScheduleStudentHelpConfig } from "./scheduleStudentHelp";
import { defaultScheduleStudentHelp } from "../lib/scheduleStudentHelpDefaults";
import { normalizeScheduleStudentHelp } from "../lib/scheduleStudentHelp";

export type FlightReviewClubLpType = "internal_public_page" | "external_url";

export type FlightReviewClubRules = {
  enabled: boolean;
  landingPageType: FlightReviewClubLpType;
  externalUrl: string;
  showInStudentMenu: boolean;
  benefits: string[];
  ctaSubscriptionUrl: string;
  trialFlightCount: number;
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
  trialFlightCount: 0,
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
        trialFlightCount: (() => { const n = Number(club?.trialFlightCount ?? 0); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; })(),
      };
    })(),
    updatedAt: raw.updatedAt ?? null,
  };
}

