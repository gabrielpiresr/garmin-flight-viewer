export type Notice = {
  id: string;
  title: string;
  contentMd: string;
  bannerFileId: string | null;
  bannerUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  publishedAt: string;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoticeUpsertPayload = {
  title: string;
  contentMd: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  publishedAt: string;
  isPublished: boolean;
};

export type CreateNoticePayload = NoticeUpsertPayload & {
  actorUserId: string;
  bannerFile?: File | null;
};

export type UpdateNoticePayload = NoticeUpsertPayload & {
  actorUserId: string;
  bannerFile?: File | null;
  removeBanner?: boolean;
};
