import { useEffect, useMemo, useRef, useState } from "react";
import { listAdminUserSummaries } from "../../lib/adminUsersDb";
import { findHighlightRange, searchAdminIndex, type AdminSearchEntry } from "../../lib/adminSearchIndex";
import { requestAdminUserSelection } from "../../lib/adminUserSelection";
import { scrollToAdminSection } from "../../lib/adminSectionScroll";
import { navigateToTab } from "../../lib/routedTabs";
import { usePermissions } from "../../contexts/PermissionsContext";
import type { AdminUserSummary } from "../../types/adminUsers";

const USER_SEARCH_MIN_CHARS = 2;
const USER_SEARCH_DEBOUNCE_MS = 250;
const USER_SEARCH_LIMIT = 8;

type CommandBarProps = {
  className?: string;
  /** Desativa o listener global de Ctrl+K (para não duplicar entre instâncias). */
  hotkey?: boolean;
};

function Highlighted({ text, query }: { text: string; query: string }) {
  const range = useMemo(() => findHighlightRange(text, query), [text, query]);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range.start)}
      <mark className="bg-transparent font-semibold text-sky-400">{text.slice(range.start, range.end)}</mark>
      {text.slice(range.end)}
    </>
  );
}

export function AdminCommandBar({ className = "", hotkey = true }: CommandBarProps) {
  const { canTab } = usePermissions();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [userResults, setUserResults] = useState<AdminUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const userSeqRef = useRef(0);

  const trimmed = query.trim();
  const canSearchUsers = canTab("users");
  const userSearchActive = canSearchUsers && trimmed.length >= USER_SEARCH_MIN_CHARS;

  const entryResults = useMemo(
    () => (trimmed ? searchAdminIndex(trimmed, canTab) : []),
    [trimmed, canTab],
  );

  // Busca de usuários com debounce + descarte de respostas fora de ordem.
  useEffect(() => {
    if (!userSearchActive) {
      userSeqRef.current += 1;
      setUserResults([]);
      setUsersLoading(false);
      return;
    }
    setUsersLoading(true);
    const seq = ++userSeqRef.current;
    const timer = window.setTimeout(() => {
      listAdminUserSummaries({ search: trimmed, limit: USER_SEARCH_LIMIT, offset: 0 })
        .then((page) => {
          if (seq !== userSeqRef.current) return;
          setUserResults(page.users);
          setUsersLoading(false);
        })
        .catch(() => {
          if (seq !== userSeqRef.current) return;
          setUserResults([]);
          setUsersLoading(false);
        });
    }, USER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, userSearchActive]);

  // Ctrl+K / Cmd+K foca a busca de qualquer lugar.
  useEffect(() => {
    if (!hotkey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkey]);

  // Fecha ao interagir fora do container.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const actionEntries = entryResults.filter((entry) => entry.kind === "action");
  const pageEntries = entryResults.filter((entry) => entry.kind === "page");
  // Ordem achatada da lista exibida: Ações -> Páginas -> Usuários.
  const orderedEntries = useMemo(() => [...actionEntries, ...pageEntries], [entryResults]);
  const flatCount = orderedEntries.length + userResults.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= flatCount && flatCount > 0) setActiveIndex(0);
  }, [activeIndex, flatCount]);

  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatCount]);

  function close() {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function runEntry(entry: AdminSearchEntry) {
    navigateToTab(entry.path);
    if (entry.scrollTo) scrollToAdminSection(entry.scrollTo);
    close();
  }

  function runUser(user: AdminUserSummary) {
    requestAdminUserSelection({ userId: user.userId, email: user.email, name: user.name });
    navigateToTab("/admin/usuarios");
    close();
  }

  function runIndex(index: number) {
    if (index < orderedEntries.length) {
      runEntry(orderedEntries[index]);
      return;
    }
    const user = userResults[index - orderedEntries.length];
    if (user) runUser(user);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!open || flatCount === 0) {
      if (event.key === "ArrowDown") setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % flatCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + flatCount) % flatCount);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runIndex(activeIndex);
    }
  }

  const showDropdown = open && trimmed.length > 0;
  const showEmpty = showDropdown && flatCount === 0 && !usersLoading;

  // Índice global de cada item na lista achatada (ações -> páginas -> usuários,
  // mesma ordem de entryResults = [ações..., páginas...] do searchAdminIndex).
  let renderIndex = -1;
  const nextIndex = () => {
    renderIndex += 1;
    return renderIndex;
  };

  function renderEntryOption(entry: AdminSearchEntry) {
    const index = nextIndex();
    const active = index === activeIndex;
    return (
      <button
        key={entry.id}
        type="button"
        role="option"
        aria-selected={active}
        data-active={active ? "true" : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => runEntry(entry)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          active ? "bg-sky-500/10 text-sky-300" : "text-slate-300 hover:bg-slate-800/60"
        }`}
      >
        <span className="min-w-0 truncate">
          <Highlighted text={entry.label} query={trimmed} />
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{entry.group}</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="admin-command-bar-listbox"
          aria-label="Busca global do admin"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="Buscar páginas, ações e usuários…"
          className="w-full rounded-lg border border-slate-700 bg-slate-900/80 py-1.5 pl-9 pr-16 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        {hotkey ? (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 sm:block">
            Ctrl K
          </kbd>
        ) : null}
      </div>

      {showDropdown ? (
        <div
          ref={listRef}
          id="admin-command-bar-listbox"
          role="listbox"
          className="absolute top-full z-50 mt-2 max-h-[60vh] w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
        >
          {actionEntries.length > 0 ? (
            <div>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Ações</p>
              {actionEntries.map(renderEntryOption)}
            </div>
          ) : null}
          {pageEntries.length > 0 ? (
            <div>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Páginas</p>
              {pageEntries.map(renderEntryOption)}
            </div>
          ) : null}
          {userSearchActive && (usersLoading || userResults.length > 0) ? (
            <div>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Usuários</p>
              {usersLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                  <span className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-sky-400" />
                  Buscando usuários…
                </div>
              ) : (
                userResults.map((user) => {
                  const index = nextIndex();
                  const active = index === activeIndex;
                  return (
                    <button
                      key={user.userId}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active ? "true" : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runUser(user)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        active ? "bg-sky-500/10 text-sky-300" : "text-slate-300 hover:bg-slate-800/60"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <Highlighted text={user.name || user.email} query={trimmed} />
                      </span>
                      <span className="min-w-0 shrink-0 truncate text-xs text-slate-500">{user.email}</span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
          {showEmpty ? (
            <p className="px-3 py-3 text-sm text-slate-500">Nenhum resultado para “{trimmed}”.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
