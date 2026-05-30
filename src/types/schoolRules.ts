import type { NotificationEventType } from "./notification";

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
  minRequestHours: number;
  maxRequestHours: number;
  allowStudentFlightIntentions: boolean;
  requireCreditsForIntentions: boolean;
  allowNightFlights: boolean;
  nightFlightStartHour: number;
};

export type EmailNotificationRule = {
  enabled: boolean;
  customNotice: string;
};

export type SchoolRules = {
  studentTabs: Record<StudentPortalTab, boolean>;
  theme: PlatformThemeRules;
  schedule: FlightScheduleRules;
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
  minRequestHours: 1,
  maxRequestHours: 4,
  allowStudentFlightIntentions: true,
  requireCreditsForIntentions: false,
  allowNightFlights: false,
  nightFlightStartHour: 18,
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

export const DEFAULT_SCHOOL_RULES: SchoolRules = {
  studentTabs: DEFAULT_STUDENT_TABS,
  theme: DEFAULT_PLATFORM_THEME_RULES,
  schedule: DEFAULT_FLIGHT_SCHEDULE_RULES,
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
      minRequestHours,
      maxRequestHours,
      allowStudentFlightIntentions:
        raw.schedule?.allowStudentFlightIntentions ?? DEFAULT_FLIGHT_SCHEDULE_RULES.allowStudentFlightIntentions,
      requireCreditsForIntentions:
        raw.schedule?.requireCreditsForIntentions ?? DEFAULT_FLIGHT_SCHEDULE_RULES.requireCreditsForIntentions,
      allowNightFlights:
        raw.schedule?.allowNightFlights ?? DEFAULT_FLIGHT_SCHEDULE_RULES.allowNightFlights,
      nightFlightStartHour: (() => {
        const h = Number(raw.schedule?.nightFlightStartHour);
        return Number.isFinite(h) && h >= 0 && h <= 23 ? Math.round(h) : DEFAULT_FLIGHT_SCHEDULE_RULES.nightFlightStartHour;
      })(),
    },
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

