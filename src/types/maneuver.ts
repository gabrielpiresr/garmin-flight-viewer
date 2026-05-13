export type ManeuverRichContent = Record<string, unknown>;

export type ManeuverSection = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ManeuverSubsection = {
  id: string;
  sectionId: string;
  title: string;
  description: string | null;
  order: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ManeuverArticle = {
  id: string;
  sectionId: string;
  subsectionId: string | null;
  title: string;
  summary: string | null;
  contentJson: ManeuverRichContent;
  contentHtml: string;
  plainText: string;
  tags: string[];
  order: number;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManeuverCatalog = {
  sections: ManeuverSection[];
  subsections: ManeuverSubsection[];
  articles: ManeuverArticle[];
};

export type ManeuverSectionPayload = {
  title: string;
  description?: string | null;
  order: number;
  isPublished: boolean;
};

export type ManeuverSubsectionPayload = {
  sectionId: string;
  title: string;
  description?: string | null;
  order: number;
  isPublished: boolean;
};

export type ManeuverArticlePayload = {
  sectionId: string;
  subsectionId?: string | null;
  title: string;
  summary?: string | null;
  contentJson: ManeuverRichContent;
  contentHtml: string;
  plainText: string;
  tags?: string[];
  order: number;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  isPublished: boolean;
  actorUserId?: string | null;
};

export type ManeuverMediaUpload = {
  fileId: string;
  url: string;
  name: string;
  mimeType: string;
};
