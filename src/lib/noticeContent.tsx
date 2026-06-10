import type { ReactNode } from "react";
import { renderMarkdownBlocks } from "./markdown";
import { renderRichContent, richContentToPlainText } from "./maneuverContent";
import { legacyPlainTextToRichDoc, parseStoredRichJson } from "./richContentFields";
import type { ManeuverRichContent } from "../types/maneuver";

/**
 * O campo `content_md` dos avisos guarda markdown (legado) ou JSON TipTap
 * (avisos salvos pelo editor de texto rico). Estes helpers tratam os dois.
 */

export function noticeContentToRich(contentMd: string): ManeuverRichContent {
  return parseStoredRichJson(contentMd) ?? legacyPlainTextToRichDoc(contentMd);
}

export function renderNoticeContent(contentMd: string): ReactNode {
  const rich = parseStoredRichJson(contentMd);
  if (rich) return renderRichContent(rich);
  return renderMarkdownBlocks(contentMd);
}

export function noticeContentToPlainText(contentMd: string): string {
  const rich = parseStoredRichJson(contentMd);
  if (rich) return richContentToPlainText(rich);
  return contentMd;
}
