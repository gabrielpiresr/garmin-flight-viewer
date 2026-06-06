import type { CSSProperties, ReactNode } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import StarterKit from "@tiptap/starter-kit";
import { generateHTML } from "@tiptap/html";
import type { Extensions } from "@tiptap/react";
import type { ManeuverRichContent } from "../types/maneuver";

type RichNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
};

function isSafeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function isVideoUrl(value: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(value);
}

function normalizeImageWidth(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `${Math.max(1, Math.min(100, value))}%`;
  if (typeof value !== "string") return "100%";
  const trimmed = value.trim();
  if (/^\d{1,3}%$/.test(trimmed)) {
    const numeric = Number(trimmed.replace("%", ""));
    return `${Math.max(1, Math.min(100, numeric))}%`;
  }
  if (/^\d{2,4}px$/.test(trimmed)) return trimmed;
  return "100%";
}

export const ManeuverImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-width") || element.style.width || element.getAttribute("width") || "100%",
        renderHTML: (attributes) => {
          const width = normalizeImageWidth(attributes.width);
          return {
            "data-width": width,
            style: `width: ${width}; max-width: 100%;`,
          };
        },
      },
    };
  },

  addNodeView() {
    return ({ editor, getPos, node }) => {
      let currentNode = node;
      let currentWidth = normalizeImageWidth(node.attrs.width);
      const container = document.createElement("span");
      const image = document.createElement("img");
      const handle = document.createElement("span");

      container.className = "maneuver-image-node";
      container.contentEditable = "false";
      handle.className = "maneuver-image-resize-handle";
      container.append(image, handle);

      function render() {
        currentWidth = normalizeImageWidth(currentNode.attrs.width);
        image.src = typeof currentNode.attrs.src === "string" ? currentNode.attrs.src : "";
        image.alt = typeof currentNode.attrs.alt === "string" ? currentNode.attrs.alt : "";
        image.title = typeof currentNode.attrs.title === "string" ? currentNode.attrs.title : "";
        image.className = "max-h-[32rem] rounded-xl border border-slate-700/60 object-contain";
        image.style.width = "100%";
        image.style.maxWidth = "100%";
        container.style.width = currentWidth;
        container.style.maxWidth = "100%";
      }

      function persistWidth(width: string) {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            width,
          }),
        );
      }

      function selectImage() {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos === "number") editor.commands.setNodeSelection(pos);
      }

      container.addEventListener("click", selectImage);
      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectImage();
        const startX = event.clientX;
        const startWidth = container.getBoundingClientRect().width;
        const parentWidth = container.parentElement?.getBoundingClientRect().width || startWidth;
        let nextWidth = currentWidth;

        function onMove(moveEvent: MouseEvent) {
          const delta = moveEvent.clientX - startX;
          const nextPixels = Math.max(80, Math.min(parentWidth, startWidth + delta));
          const nextPercent = Math.max(10, Math.min(100, Math.round((nextPixels / parentWidth) * 100)));
          nextWidth = `${nextPercent}%`;
          container.style.width = nextWidth;
        }

        function onUp() {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          persistWidth(nextWidth);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });

      render();

      return {
        dom: container,
        update(nextNode) {
          if (nextNode.type.name !== currentNode.type.name) return false;
          currentNode = nextNode;
          render();
          return true;
        },
        selectNode() {
          container.classList.add("is-selected");
        },
        deselectNode() {
          container.classList.remove("is-selected");
        },
        destroy() {
          container.removeEventListener("click", selectImage);
        },
      };
    };
  },
});

export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      title: { default: "Video" },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }, { tag: "iframe[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const src = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
    if (isVideoUrl(src)) {
      return [
        "video",
        mergeAttributes(HTMLAttributes, {
          controls: "true",
          class: "w-full rounded-xl border border-slate-700/60 bg-black",
        }),
      ];
    }
    return [
      "iframe",
      mergeAttributes(HTMLAttributes, {
        class: "aspect-video w-full rounded-xl border border-slate-700/60 bg-black",
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        allowfullscreen: "true",
      }),
    ];
  },
});

export function getManeuverEditorExtensions(placeholder = "Escreva o artigo..."): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ["http", "https"],
      validate: (href) => isSafeUrl(href),
      HTMLAttributes: {
        class: "text-sky-400 underline underline-offset-2 hover:text-sky-500",
        rel: "noreferrer",
      },
    }),
    ManeuverImage.configure({
      allowBase64: false,
      HTMLAttributes: {
        class: "max-h-[32rem] rounded-xl border border-slate-700/60 object-contain",
      },
    }),
    Youtube.configure({
      controls: true,
      nocookie: true,
      HTMLAttributes: {
        class: "aspect-video w-full rounded-xl border border-slate-700/60",
      },
    }),
    VideoEmbed,
    Placeholder.configure({ placeholder }),
  ];
}

export function createEmptyRichContent(): ManeuverRichContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function richContentToHtml(content: ManeuverRichContent): string {
  try {
    return generateHTML(content, getManeuverEditorExtensions());
  } catch {
    return "";
  }
}

function renderMarkedText(node: RichNode, key: string): ReactNode {
  let value: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") value = <strong key={`${key}-b`}>{value}</strong>;
    if (mark.type === "italic") value = <em key={`${key}-i`}>{value}</em>;
    if (mark.type === "code") value = <code key={`${key}-c`} className="rounded bg-slate-800 px-1 py-0.5 text-sky-100">{value}</code>;
    if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      value = isSafeUrl(href) ? (
        <a key={`${key}-l`} href={href} target={/^https?:\/\//i.test(href) ? "_blank" : undefined} rel="noreferrer" className="break-words text-sky-300 underline underline-offset-2 hover:text-sky-200">
          {value}
        </a>
      ) : (
        value
      );
    }
  }
  return value;
}

function renderNodes(nodes: RichNode[] | undefined, prefix: string): ReactNode[] {
  return (nodes ?? []).map((node, index) => renderNode(node, `${prefix}-${index}`));
}

function renderNode(node: RichNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return renderMarkedText(node, key);
    case "heading": {
      const level = node.attrs?.level === 2 || node.attrs?.level === 3 || node.attrs?.level === 4 ? node.attrs.level : 3;
      const className = level === 2 ? "text-xl font-semibold text-white" : level === 3 ? "text-lg font-semibold text-slate-100" : "text-base font-semibold text-slate-100";
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      const align = typeof node.attrs?.textAlign === "string" ? node.attrs.textAlign : undefined;
      return <Tag key={key} className={`${className} mt-5 first:mt-0`} style={align ? { textAlign: align as CSSProperties["textAlign"] } : undefined}>{renderNodes(node.content, key)}</Tag>;
    }
    case "paragraph": {
      const align = typeof node.attrs?.textAlign === "string" ? node.attrs.textAlign : undefined;
      return <p key={key} className="break-words leading-relaxed text-slate-200 [overflow-wrap:anywhere]" style={align ? { textAlign: align as CSSProperties["textAlign"] } : undefined}>{renderNodes(node.content, key)}</p>;
    }
    case "bulletList":
      return <ul key={key} className="list-disc space-y-1 break-words pl-5 text-slate-200 [overflow-wrap:anywhere]">{renderNodes(node.content, key)}</ul>;
    case "orderedList":
      return <ol key={key} className="list-decimal space-y-1 break-words pl-5 text-slate-200 [overflow-wrap:anywhere]">{renderNodes(node.content, key)}</ol>;
    case "listItem":
      return <li key={key}>{renderNodes(node.content, key)}</li>;
    case "blockquote":
      return <blockquote key={key} className="border-l-2 border-sky-500/60 pl-4 text-slate-300">{renderNodes(node.content, key)}</blockquote>;
    case "horizontalRule":
      return <hr key={key} className="border-slate-700" />;
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      const width = normalizeImageWidth(node.attrs?.width);
      return isSafeUrl(src) ? (
        <img
          key={key}
          src={src}
          alt={alt}
          className="max-h-[32rem] rounded-xl border border-slate-700/60 object-contain"
          style={{ width, maxWidth: "100%" }}
        />
      ) : null;
    }
    case "youtube": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      return isSafeUrl(src) ? <iframe key={key} src={src} title="Video" className="aspect-video w-full rounded-xl border border-slate-700/60 bg-black" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : null;
    }
    case "videoEmbed": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const title = typeof node.attrs?.title === "string" ? node.attrs.title : "Video";
      if (!isSafeUrl(src)) return null;
      return isVideoUrl(src) ? (
        <video key={key} src={src} controls className="w-full rounded-xl border border-slate-700/60 bg-black" />
      ) : (
        <iframe key={key} src={src} title={title} className="aspect-video w-full rounded-xl border border-slate-700/60 bg-black" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      );
    }
    default:
      return <div key={key}>{renderNodes(node.content, key)}</div>;
  }
}

export function renderRichContent(content: ManeuverRichContent): ReactNode[] {
  const root = content as RichNode;
  return renderNodes(root.content, "rich");
}

export function richContentToPlainText(content: ManeuverRichContent): string {
  const chunks: string[] = [];
  function walk(node: RichNode | undefined) {
    if (!node) return;
    if (node.text) chunks.push(node.text);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") chunks.push("\n");
    for (const child of node.content ?? []) walk(child);
  }
  walk(content as RichNode);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
