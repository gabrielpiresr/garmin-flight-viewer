/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT: string;
  readonly VITE_APPWRITE_PROJECT_ID: string;
  readonly VITE_APPWRITE_DATABASE_ID: string;
  readonly VITE_APPWRITE_COLLECTION_ID: string;
  readonly VITE_APPWRITE_PROFILES_COLLECTION_ID: string;
  readonly VITE_APPWRITE_BUCKET_ID?: string;
  readonly VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID?: string;
  readonly VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID?: string;
  readonly VITE_APPWRITE_VIDEOS_COLLECTION_ID?: string;
  readonly VITE_APPWRITE_NOTICES_COL_ID?: string;
  readonly VITE_APPWRITE_NOTICES_BUCKET_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
