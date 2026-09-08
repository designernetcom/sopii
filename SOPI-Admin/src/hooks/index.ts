import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { hasPermission } from '@/store/slices/authSlice';
import type { PermissionAction, ResourceKey } from '@/types';

/** Debounces a rapidly-changing value — used by every search box. */
export function useDebounce<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · SOPII Admin` : 'SOPII Admin';
  }, [title]);
}

/** Permission gate for menus, buttons and routes. */
export function usePermissions() {
  const user = useAppSelector((state) => state.auth.user);

  return useMemo(
    () => ({
      user,
      can: (resource: ResourceKey, action: PermissionAction = 'view') =>
        hasPermission(user, resource, action),
      isSuperAdmin: user?.roleKey === 'super_admin',
    }),
    [user],
  );
}

export interface ListQueryState {
  page: number;
  pageSize: number;
  search: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * Shared list-screen state: search, sort, pagination and arbitrary filters,
 * with page resets wired up so filtering never strands you on page 9.
 */
export function useListQuery(initial?: Partial<ListQueryState & Record<string, unknown>>) {
  const [state, setState] = useState<ListQueryState & Record<string, unknown>>({
    page: 1,
    pageSize: 10,
    search: '',
    ...initial,
  });

  const debouncedSearch = useDebounce(state.search, 320);

  const setSearch = useCallback((search: string) => {
    setState((current) => ({ ...current, search, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setState((current) => ({ ...current, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setState((current) => ({ ...current, pageSize, page: 1 }));
  }, []);

  const setSort = useCallback((sort: { by?: string; dir?: 'asc' | 'desc' }) => {
    setState((current) => ({ ...current, sortBy: sort.by, sortDir: sort.dir }));
  }, []);

  const setFilter = useCallback((key: string, value: unknown) => {
    setState((current) => ({ ...current, [key]: value, page: 1 }));
  }, []);

  const reset = useCallback(() => {
    setState({ page: 1, pageSize: 10, search: '', ...initial });
    // `initial` is a literal at every call site, so this is stable in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Params object handed straight to an RTK Query endpoint. */
  const params = useMemo(() => {
    const { search: _search, ...rest } = state;
    return { ...rest, search: debouncedSearch || undefined };
  }, [state, debouncedSearch]);

  return {
    state,
    params,
    setSearch,
    setPage,
    setPageSize,
    setSort,
    setFilter,
    reset,
    sort: { by: state.sortBy, dir: state.sortDir },
  };
}

/** Simple HTML5 drag-and-drop reordering for small admin lists. */
export function useDragReorder<T>(items: T[], onReorder: (next: T[]) => void) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handlers = useCallback(
    (index: number) => ({
      draggable: true,
      onDragStart: (event: React.DragEvent) => {
        dragIndex.current = index;
        event.dataTransfer.effectAllowed = 'move';
      },
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOverIndex(index);
      },
      onDragLeave: () => setOverIndex((current) => (current === index ? null : current)),
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        const from = dragIndex.current;
        setOverIndex(null);
        dragIndex.current = null;
        if (from === null || from === index) return;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(index, 0, moved);
        onReorder(next);
      },
      onDragEnd: () => {
        dragIndex.current = null;
        setOverIndex(null);
      },
    }),
    [items, onReorder],
  );

  /** Keyboard/touch fallback — drag events do not fire on most mobile browsers. */
  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      onReorder(next);
    },
    [items, onReorder],
  );

  return { handlers, move, overIndex };
}

/** Tracks whether a value changed, for "unsaved changes" affordances. */
export function useDirtyState<T>(value: T) {
  const initial = useRef(JSON.stringify(value));
  return JSON.stringify(value) !== initial.current;
}
