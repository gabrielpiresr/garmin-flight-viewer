export type GoproSettings = {
  email: string;
  passwordConfigured: boolean;
  accessTokenConfigured: boolean;
  updatedAt: string | null;
  lastSyncAt: string | null;
  lastError: string;
};

export type GoproSettingsInput = {
  email: string;
  password?: string;
  accessToken?: string;
};

export type GoproPublicLinkSource = "gopro" | "cached" | "created" | "missing";

export type GoproMediaLink = {
  id: string;
  filename: string;
  title: string;
  type: string;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  fileExtension: string;
  fileSize: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  cameraModel: string;
  cameraName: string;
  cameraIdentifier: string;
  thumbnailAvailable: boolean;
  token: string;
  onPublicProfile: boolean;
  publicUrl: string;
  linkedFlightIds: string[];
  source: GoproPublicLinkSource;
};

export type GoproPublicLinksResult = {
  media: GoproMediaLink[];
  links: GoproMediaLink[];
  missing: GoproMediaLink[];
  errors: Array<{ mediaId: string; filename: string; message: string }>;
  totalItems: number;
  totalPages: number;
  updatedAt: string;
};
