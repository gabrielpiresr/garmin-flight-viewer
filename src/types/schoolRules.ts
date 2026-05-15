import type { NotificationEventType } from "./notification";

export type StudentPortalTab =
  | "home"
  | "jornada"
  | "meus-voos"
  | "agendamento"
  | "creditos"
  | "avisos"
  | "manuais"
  | "manobras"
  | "perfil";

export type PlatformThemeRules = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
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
  updatedAt: string | null;
};

export type SchoolRulesInput = Omit<SchoolRules, "updatedAt">;

export const STUDENT_PORTAL_TAB_OPTIONS: Array<{ id: StudentPortalTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "jornada", label: "Jornada" },
  { id: "meus-voos", label: "Meus voos" },
  { id: "agendamento", label: "Agendamento" },
  { id: "creditos", label: "Creditos" },
  { id: "avisos", label: "Avisos" },
  { id: "manuais", label: "Manuais" },
  { id: "manobras", label: "Manobras" },
  { id: "perfil", label: "Perfil" },
];

export const EMAIL_NOTIFICATION_EVENT_OPTIONS: Array<{ id: NotificationEventType; label: string }> = [
  { id: "flight.scheduled", label: "Voo agendado" },
  { id: "flight.updated", label: "Voo alterado" },
  { id: "flight.cancelled", label: "Voo cancelado" },
  { id: "weeklyPlan.submitted", label: "Intenção enviada" },
  { id: "notice.published", label: "Novo aviso" },
];

export const DEFAULT_PLATFORM_THEME_RULES: PlatformThemeRules = {
  primaryColor: "#10b981",
  accentColor: "#38bdf8",
  backgroundColor: "#020617",
  surfaceColor: "#0f172a",
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
  (acc, item) => ({ ...acc, [item.id]: true }),
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
    updatedAt: raw.updatedAt ?? null,
  };
}

