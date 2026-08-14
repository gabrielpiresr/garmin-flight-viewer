import { Query } from "appwrite";
import { ADMIN_USERS_FUNCTION_ID, databases, functions, PLATFORM_SETTINGS_COL_ID } from "./appwrite";
import { getEmailBrandSettings } from "./notificationsDb";
import { DEFAULT_SCHOOL_RULES, normalizeSchoolRules, type SchoolRules, type SchoolRulesInput } from "../types/schoolRules";

const RULES_CACHE_KEY = "gfv:schoolRules";
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const SCHOOL_RULES_SETTING_KEY = "schoolRules";

function cacheSchoolRules(rules: SchoolRules): void {
  try {
    window.localStorage.setItem(RULES_CACHE_KEY, JSON.stringify(rules));
  } catch {
    // best effort
  }
}

export function getCachedSchoolRules(): SchoolRules | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(RULES_CACHE_KEY) : null;
    return raw ? normalizeSchoolRules(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function injectGoogleFont(fontFamily: string): void {
  const id = "google-font-dynamic";
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700&display=swap`;
  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function setFavicon(url: string): void {
  const id = "dynamic-favicon";
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export type BrandApplyOptions = {
  schoolName?: string | null;
  faviconUrl?: string | null;
};

type SchoolRulesResponse = {
  ok?: boolean;
  message?: string;
  schoolRules?: SchoolRules;
};

function parseResponse(body: string | undefined): SchoolRulesResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as SchoolRulesResponse;
  } catch {
    return {};
  }
}

async function executeSchoolRules(payload: Record<string, unknown>): Promise<SchoolRulesResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar função de regras.");
  }
  return response;
}

export async function getSchoolRules(): Promise<SchoolRules> {
  const response = await executeSchoolRules({ action: "getSchoolRules" });
  let rules = normalizeSchoolRules(response.schoolRules ?? DEFAULT_SCHOOL_RULES);
  if (!hasScheduleField(response.schoolRules, "maxBookingLeadDaysFrc")) {
    rules = await getSchoolRulesDirectFallback().catch(() => rules);
  }
  cacheSchoolRules(rules);
  return rules;
}

export async function saveSchoolRules(rules: SchoolRulesInput): Promise<SchoolRules> {
  const response = await executeSchoolRules({ action: "saveSchoolRules", rules });
  if (!response.schoolRules) throw new Error(response.message || "Regras da escola não retornadas.");
  let saved = normalizeSchoolRules(response.schoolRules);
  const intendedFrcLeadDays = Number(rules.schedule?.maxBookingLeadDaysFrc);
  if (
    Number.isFinite(intendedFrcLeadDays) &&
    saved.schedule.maxBookingLeadDaysFrc !== Math.round(intendedFrcLeadDays)
  ) {
    saved = await saveSchoolRulesDirectFallback(rules);
  }
  cacheSchoolRules(saved);
  applySchoolTheme(saved);
  return saved;
}

async function saveSchoolRulesDirectFallback(rules: SchoolRulesInput): Promise<SchoolRules> {
  if (!databases || !DB_ID || !PLATFORM_SETTINGS_COL_ID) {
    throw new Error("A funcao administrativa nao salvou a antecedencia FRC e o fallback direto nao esta configurado.");
  }
  const normalized = normalizeSchoolRules({ ...rules, updatedAt: null });
  const { updatedAt: _updatedAt, ...settings } = normalized;
  const current = await getSchoolRulesSettingsDoc();
  if (!current) {
    throw new Error("Documento de regras da escola nao encontrado para aplicar fallback.");
  }
  const doc = await databases.updateDocument(DB_ID, PLATFORM_SETTINGS_COL_ID, current.$id, {
    key: SCHOOL_RULES_SETTING_KEY,
    settings_json: JSON.stringify(settings),
  });
  return normalizeSchoolRules({ ...settings, updatedAt: doc.$updatedAt ?? null });
}

function hasScheduleField(rules: SchoolRules | undefined, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(rules?.schedule ?? {}, key);
}

async function getSchoolRulesDirectFallback(): Promise<SchoolRules> {
  const doc = await getSchoolRulesSettingsDoc();
  if (!doc) return DEFAULT_SCHOOL_RULES;
  const raw = typeof doc.settings_json === "string" ? JSON.parse(doc.settings_json || "{}") : {};
  return normalizeSchoolRules({ ...raw, updatedAt: doc.$updatedAt ?? null });
}

async function getSchoolRulesSettingsDoc() {
  if (!databases || !DB_ID || !PLATFORM_SETTINGS_COL_ID) return null;
  const result = await databases.listDocuments(DB_ID, PLATFORM_SETTINGS_COL_ID, [
    Query.equal("key", [SCHOOL_RULES_SETTING_KEY]),
    Query.limit(1),
  ]);
  return result.documents[0] ?? null;
}

export function applySchoolTheme(
  rules: Pick<SchoolRules, "theme"> | SchoolRules["theme"],
  brand?: BrandApplyOptions,
): void {
  if (typeof document === "undefined") return;
  const theme = "theme" in rules ? rules.theme : rules;
  const root = document.documentElement;

  // Brand colors (primary/accent are always from admin config)
  root.style.setProperty("--school-primary", theme.primaryColor);
  root.style.setProperty("--school-accent", theme.accentColor);
  // --school-bg and --school-surface are intentionally NOT set here:
  // they are derived automatically from [data-theme] in index.css so that
  // switching colorMode correctly changes background/surface colors.

  // Color mode (dark / light) — triggers CSS [data-theme] overrides
  root.dataset.theme = theme.colorMode === "light" ? "light" : "dark";

  // Font family
  if (theme.fontFamily) {
    injectGoogleFont(theme.fontFamily);
    root.style.setProperty("--school-font", `'${theme.fontFamily}', system-ui, 'Segoe UI', Roboto, sans-serif`);
  } else {
    root.style.removeProperty("--school-font");
  }

  // Brand overrides
  if (brand?.schoolName) document.title = brand.schoolName;
  if (brand?.faviconUrl) setFavicon(brand.faviconUrl);
}

/** Reads cached brand data from localStorage and applies it synchronously.
 *  Call this before ReactDOM.render to eliminate FOUC. */
export function preloadBranding(): void {
  if (typeof window === "undefined") return;
  const cachedRules = getCachedSchoolRules();
  let schoolName: string | null = null;
  let faviconUrl: string | null = null;
  try {
    const rawBrand = window.localStorage.getItem("gfv:emailBrandSettings");
    if (rawBrand) {
      const parsed = JSON.parse(rawBrand) as Record<string, unknown>;
      schoolName = typeof parsed.schoolName === "string" ? parsed.schoolName : null;
      faviconUrl = typeof parsed.faviconUrl === "string" ? parsed.faviconUrl : null;
    }
  } catch {
    // ignore
  }
  if (cachedRules) {
    applySchoolTheme(cachedRules, { schoolName, faviconUrl });
  } else if (schoolName) {
    document.title = schoolName;
  }
}

/** Fetches fresh school rules, caches them, and applies the theme.
 *  Should be called after login (fire-and-forget is fine). */
export async function refreshBrandCache(): Promise<void> {
  try {
    const [rules, brand] = await Promise.all([
      getSchoolRules(),
      getEmailBrandSettings().catch(() => null),
    ]);
    cacheSchoolRules(rules);
    applySchoolTheme(rules, brand ? { schoolName: brand.schoolName, faviconUrl: brand.faviconUrl } : undefined);
  } catch {
    // Non-critical — theme already applied from cache
  }
}

