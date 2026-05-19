export type HelpRichContent = Record<string, unknown>;

export type HelpSection = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HelpSubsection = {
  id: string;
  sectionId: string;
  title: string;
  description: string | null;
  order: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HelpArticle = {
  id: string;
  sectionId: string;
  subsectionId: string | null;
  title: string;
  summary: string | null;
  contentJson: HelpRichContent;
  contentHtml: string;
  plainText: string;
  tags: string[];
  order: number;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HelpCatalog = {
  sections: HelpSection[];
  subsections: HelpSubsection[];
  articles: HelpArticle[];
};

export type HelpSectionPayload = {
  title: string;
  description?: string | null;
  order: number;
  isPublished: boolean;
};

export type HelpSubsectionPayload = {
  sectionId: string;
  title: string;
  description?: string | null;
  order: number;
  isPublished: boolean;
};

export type HelpArticlePayload = {
  sectionId: string;
  subsectionId?: string | null;
  title: string;
  summary?: string | null;
  contentJson: HelpRichContent;
  contentHtml: string;
  plainText: string;
  tags?: string[];
  order: number;
  isPublished: boolean;
  actorUserId?: string | null;
};

export type HelpMediaUpload = {
  fileId: string;
  url: string;
  name: string;
  mimeType: string;
};
