/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT: string;
  readonly VITE_APPWRITE_PROJECT_ID: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_APPWRITE_DATABASE_ID: string;
  readonly VITE_APPWRITE_COLLECTION_ID: string;
  readonly VITE_APPWRITE_PROFILES_COLLECTION_ID: string;
  readonly VITE_APPWRITE_PROFILE_DOCUMENTS_COL_ID?: string;
  readonly VITE_APPWRITE_BUCKET_ID?: string;
  readonly VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID?: string;
  readonly VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID?: string;
  readonly VITE_WEB_PUSH_PUBLIC_KEY?: string;
  readonly VITE_APPWRITE_VIDEOS_COLLECTION_ID?: string;
  readonly VITE_APPWRITE_FLIGHT_PHOTOS_COLLECTION_ID?: string;
  readonly VITE_APPWRITE_NOTICES_COL_ID?: string;
  readonly VITE_APPWRITE_NOTICES_BUCKET_ID?: string;
  readonly VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID?: string;
  readonly VITE_APPWRITE_ONBOARDING_STEPS_COL_ID?: string;
  readonly VITE_APPWRITE_ONBOARDING_MEDIA_BUCKET_ID?: string;
  readonly VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID?: string;
  readonly VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID?: string;
  readonly VITE_APPWRITE_MANEUVER_TEMPLATES_COL_ID?: string;
  readonly VITE_APPWRITE_MANEUVER_TEMPLATE_STEPS_COL_ID?: string;
  readonly VITE_APPWRITE_FLIGHT_MANEUVERS_COL_ID?: string;
  readonly VITE_APPWRITE_FLIGHT_MANEUVER_REVIEWS_COL_ID?: string;
  readonly VITE_APPWRITE_FLIGHT_EVALUATIONS_COL_ID?: string;
  readonly VITE_APPWRITE_FLIGHT_EVALUATION_DISMISSALS_COL_ID?: string;
  readonly VITE_ADMIN_USERS_SECURITY_MODE?: "compat" | "strict";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
