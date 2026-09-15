import type { FooterConfig, FooterSection } from '@/types';
import { baseApi } from './baseApi';

type FooterSectionBody = Partial<Omit<FooterSection, 'id'>>;

/*
 * The storefront footer.
 *
 * Injected in two steps so the mutations can write into the query's cache
 * through a fully typed `util` — referencing the slice from inside its own
 * definition leaves TypeScript nothing to infer the type from.
 */
const footerQueryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFooter: builder.query<FooterConfig, void>({
      query: () => '/footer',
      providesTags: [{ type: 'Footer', id: 'CONFIG' }],
    }),
  }),
});

type Dispatch = (action: unknown) => unknown;

/**
 * Every write answers with the whole footer, so the response goes straight into
 * the cache instead of refetching — one round trip per click. A failed write
 * drops the cached copy instead, so the screen reloads the truth rather than
 * keeping a list the server refused.
 */
async function syncCache(
  dispatch: Dispatch,
  queryFulfilled: Promise<{ data: FooterConfig }>,
  rollback?: () => void,
) {
  try {
    const { data } = await queryFulfilled;
    dispatch(footerQueryApi.util.upsertQueryData('getFooter', undefined, data));
  } catch {
    rollback?.();
    dispatch(footerQueryApi.util.invalidateTags([{ type: 'Footer', id: 'CONFIG' }]));
  }
}

export const footerApi = footerQueryApi.injectEndpoints({
  endpoints: (builder) => ({
    createFooterSection: builder.mutation<FooterConfig, FooterSectionBody>({
      query: (body) => ({ url: '/footer/sections', method: 'POST', body }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => syncCache(dispatch, queryFulfilled),
    }),

    updateFooterSection: builder.mutation<FooterConfig, { id: string; body: FooterSectionBody }>({
      query: ({ id, body }) => ({ url: `/footer/sections/${id}`, method: 'PUT', body }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => syncCache(dispatch, queryFulfilled),
    }),

    deleteFooterSection: builder.mutation<FooterConfig, string>({
      query: (id) => ({ url: `/footer/sections/${id}`, method: 'DELETE' }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => syncCache(dispatch, queryFulfilled),
    }),

    /* Applied to the cache before the request, so a dragged row stays where it
       was dropped instead of snapping back while the save is in flight. */
    reorderFooterSections: builder.mutation<FooterConfig, string[]>({
      query: (ids) => ({ url: '/footer/sections/reorder', method: 'PUT', body: { ids } }),
      onQueryStarted: (ids, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
          footerQueryApi.util.updateQueryData('getFooter', undefined, (draft) => {
            const byId = new Map(draft.sections.map((section) => [section.id, section]));
            if (ids.length !== draft.sections.length || ids.some((id) => !byId.has(id))) return;
            draft.sections = ids.map((id) => byId.get(id)!);
          }),
        );
        return syncCache(dispatch, queryFulfilled, patch.undo);
      },
    }),

    resetFooter: builder.mutation<FooterConfig, void>({
      query: () => ({ url: '/footer/reset', method: 'POST' }),
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) => syncCache(dispatch, queryFulfilled),
    }),
  }),
});

export const { useGetFooterQuery } = footerQueryApi;

export const {
  useCreateFooterSectionMutation,
  useUpdateFooterSectionMutation,
  useDeleteFooterSectionMutation,
  useReorderFooterSectionsMutation,
  useResetFooterMutation,
} = footerApi;
