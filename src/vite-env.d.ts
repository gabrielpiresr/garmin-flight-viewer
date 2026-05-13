/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT: string;
  readonly VITE_APPWRITE_PROJECT_ID: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_APPWRITE_DATABASE_ID: string;
  readonly VITE_APPWRITE_COLLECTION_ID: string;
  readonly VITE_APPWRITE_PROFILES_COLLECTION_ID: string;
  readonly VITE_APPWRITE_BUCKET_ID?: string;
  readonly VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID?: string;
  readonly VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID?: string;
  readonly VITE_WEB_PUSH_PUBLIC_KEY?: string;
  readonly VITE_APPWRITE_VIDEOS_COLLECTION_ID?: string;
  readonly VITE_APPWRITE_NOTICES_COL_ID?: string;
  readonly VITE_APPWRITE_NOTICES_BUCKET_ID?: string;
  readonly VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID?: string;
  readonly VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID?: string;
  readonly VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
