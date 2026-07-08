import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { buildHelpArticleHref } from "../../lib/helpArticleLink";
import type { HelpArticle, HelpSection } from "../../types/helpCenter";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

type HelpArticleLinkToolProps = {
  editor: Editor | null;
  articles: HelpArticle[];
  sections: HelpSection[];
  currentArticleId: string | null;
};

/** Botão da barra do editor que insere um link para outro artigo do manual. */
export function HelpArticleLinkTool({ editor, articles, sections, currentArticleId }: HelpArticleLinkToolProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sectionTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) map.set(section.id, section.title);
    return map;
  }, [sections]);

  const options = useMemo(() => {
    const term = normalize(search.trim());
    return articles
      .filter((article) => article.id !== currentArticleId)
      .filter((article) => {
        if (!term) return true;
        return normalize(`${article.title} ${sectionTitleById.get(article.sectionId) ?? ""}`).includes(term);
      })
      .sort((a, b) => {
        const sa = sectionTitleById.get(a.sectionId) ?? "";
        const sb = sectionTitleById.get(b.sectionId) ?? "";
        return sa.localeCompare(sb, "pt-BR") || a.order - b.order || a.title.localeCompare(b.title, "pt-BR");
      });
  }, [articles, currentArticleId, search, sectionTitleById]);

  function insert(article: HelpArticle) {
    if (!editor) return;
    const href = buildHelpArticleHref(article.id);
    const { from, to } = editor.state.selection;
    if (from !== to) {
      // Aplica o link ao texto selecionado.
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      // Sem seleção: insere o título do artigo como link + espaço (encerra a marca).
      editor
        .chain()
        .focus()
        .insertContent([
          { type: "text", text: article.title, marks: [{ type: "link", attrs: { href } }] },
          { type: "text", text: " " },
        ])
        .run();
    }
    setOpen(false);
    setSearch("");
  }

  const buttonClass = "rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!editor}
        onClick={() => setOpen((prev) => !prev)}
        className={`${buttonClass} ${open ? "border-sky-500/60 bg-sky-500/10 text-sky-200" : ""}`}
        title="Inserir link para outro artigo"
      >
        Citar artigo
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl shadow-black/40">
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar artigo..."
              className="mb-2 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500"
            />
            <div className="max-h-64 overflow-y-auto">
              {options.length ? (
                options.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => insert(article)}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <span className="block truncate font-medium">{article.title}</span>
                    <span className="block truncate text-[10px] uppercase tracking-wide text-slate-500">
                      {sectionTitleById.get(article.sectionId) ?? "Seção"}
                      {article.isPublished ? "" : " · rascunho"}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-3 text-center text-xs text-slate-500">Nenhum outro artigo.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
