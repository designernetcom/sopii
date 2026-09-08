import type { SeoMeta, SeoPage, SeoPageType, SeoSettings } from '@/types';
import { baseApi } from './baseApi';

/**
 * One catalogue record as the SEO overview lists it — enough to show which
 * records still have no metadata, without pulling whole products down.
 */
export interface SeoCatalogRow {
  id: string;
  label: string;
  /** Where the record renders on the shop front. */
  path: string;
  status?: string;
  seo: SeoMeta;
}

export type SeoCatalogKind = 'products' | 'categories' | 'collections';

export const seoApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /* -------------------------------- settings ------------------------------- */

    getSeoSettings: builder.query<SeoSettings, void>({
      query: () => '/seo/settings',
      providesTags: [{ type: 'Seo', id: 'SETTINGS' }],
    }),

    updateSeoSettings: builder.mutation<SeoSettings, Partial<SeoSettings>>({
      query: (body) => ({ url: '/seo/settings', method: 'PUT', body }),
      invalidatesTags: [{ type: 'Seo', id: 'SETTINGS' }],
    }),

    /* --------------------------------- pages --------------------------------- */

    getSeoPages: builder.query<SeoPage[], { pageType?: SeoPageType } | void>({
      query: (params) => ({ url: '/seo/pages', params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Seo' as const, id })),
              { type: 'Seo' as const, id: 'PAGES' },
            ]
          : [{ type: 'Seo' as const, id: 'PAGES' }],
    }),

    createSeoPage: builder.mutation<SeoPage, Partial<SeoPage>>({
      query: (body) => ({ url: '/seo/pages', method: 'POST', body }),
      invalidatesTags: [{ type: 'Seo', id: 'PAGES' }],
    }),

    updateSeoPage: builder.mutation<SeoPage, { id: string; body: Partial<SeoPage> }>({
      query: ({ id, body }) => ({ url: `/seo/pages/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Seo', id },
        { type: 'Seo', id: 'PAGES' },
      ],
    }),

    deleteSeoPage: builder.mutation<void, string>({
      query: (id) => ({ url: `/seo/pages/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Seo', id: 'PAGES' }],
    }),

    /* ------------------------------- catalogue -------------------------------- */

    getSeoCatalog: builder.query<SeoCatalogRow[], SeoCatalogKind>({
      query: (kind) => `/seo/catalog/${kind}`,
      providesTags: (_result, _error, kind) => [{ type: 'Seo', id: `CATALOG_${kind}` }],
    }),

    /**
     * Saves one record's SEO block. Invalidates that record's own catalogue tag
     * too, so the product/category screen shows the change without a reload.
     */
    updateSeoCatalog: builder.mutation<
      { id: string; seo: SeoMeta },
      { kind: SeoCatalogKind; id: string; body: SeoMeta }
    >({
      query: ({ kind, id, body }) => ({
        url: `/seo/catalog/${kind}/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { kind, id }) => [
        { type: 'Seo', id: `CATALOG_${kind}` },
        kind === 'products'
          ? { type: 'Product' as const, id }
          : kind === 'categories'
            ? { type: 'Category' as const, id }
            : { type: 'Collection' as const, id },
      ],
    }),
  }),
});

export const {
  useGetSeoSettingsQuery,
  useUpdateSeoSettingsMutation,
  useGetSeoPagesQuery,
  useCreateSeoPageMutation,
  useUpdateSeoPageMutation,
  useDeleteSeoPageMutation,
  useGetSeoCatalogQuery,
  useUpdateSeoCatalogMutation,
} = seoApi;
