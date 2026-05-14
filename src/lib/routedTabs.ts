import { useCallback, useEffect, useState } from "react";

export type TabRoute<T extends string> = {
  id: T;
  path: string;
  aliases?: readonly string[];
};

type SetRouteOptions = {
  replace?: boolean;
  path?: string;
};

function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? "/";
  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

function currentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function findRoute<T extends string>(routes: readonly TabRoute<T>[], path: string): TabRoute<T> | undefined {
  const normalized = normalizePath(path);
  return routes.find((route) =>
    [route.path, ...(route.aliases ?? [])].some((candidate) => normalizePath(candidate) === normalized),
  );
}

function navigateToPath(path: string, replace = false): void {
  if (typeof window === "undefined") return;

  const normalized = normalizePath(path);
  if (normalizePath(window.location.pathname) === normalized) return;

  const nextUrl = `${normalized}${window.location.search}${window.location.hash}`;
  const method = replace ? "replaceState" : "pushState";
  window.history[method](null, "", nextUrl);
}

export function routeMatches<T extends string>(routes: readonly TabRoute<T>[], path = currentPath()): boolean {
  return findRoute(routes, path) !== undefined;
}

export function resolveRouteId<T extends string>(
  routes: readonly TabRoute<T>[],
  fallback: T,
  path = currentPath(),
): T {
  return findRoute(routes, path)?.id ?? fallback;
}

export function pathForRoute<T extends string>(routes: readonly TabRoute<T>[], id: T): string {
  return routes.find((route) => route.id === id)?.path ?? "/";
}

export function useOpenedTabs<T extends string>(activeTab: T): ReadonlySet<T> {
  const [openedTabs, setOpenedTabs] = useState<ReadonlySet<T>>(() => new Set([activeTab]));

  useEffect(() => {
    setOpenedTabs((previous) => {
      if (previous.has(activeTab)) return previous;
      const next = new Set(previous);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  if (openedTabs.has(activeTab)) return openedTabs;

  const nextOpenedTabs = new Set(openedTabs);
  nextOpenedTabs.add(activeTab);
  return nextOpenedTabs;
}

export function useRoutedTab<T extends string>(routes: readonly TabRoute<T>[], fallback: T) {
  const [activeTab, setActiveTab] = useState<T>(() => resolveRouteId(routes, fallback));

  const setRoutedTab = useCallback(
    (nextTab: T, options: SetRouteOptions = {}) => {
      setActiveTab(nextTab);
      navigateToPath(options.path ?? pathForRoute(routes, nextTab), options.replace);
    },
    [routes],
  );

  useEffect(() => {
    const syncFromLocation = () => {
      const hasMatchingRoute = routeMatches(routes);
      const nextTab = resolveRouteId(routes, fallback);
      setActiveTab(nextTab);

      if (!hasMatchingRoute) {
        navigateToPath(pathForRoute(routes, nextTab), true);
      }
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [fallback, routes]);

  return [activeTab, setRoutedTab] as const;
}
