import type {
  Category,
  CategoryNode,
  Collection,
  ListParams,
  Paginated,
  Product,
} from '@/types';
import { baseApi } from './baseApi';

export interface ProductListParams extends ListParams {
  categoryId?: string | string[];
  status?: string | string[];
  stockStatus?: string | string[];
  collectionId?: string;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
}

export type CollectionWithProducts = Collection & { products: Product[] };

export const catalogApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /* -------------------------------- products ------------------------------- */

    getProducts: builder.query<Paginated<Product>, ProductListParams | void>({
      query: (params) => ({ url: '/products', params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Product' as const, id })),
              { type: 'Product' as const, id: 'LIST' },
            ]
          : [{ type: 'Product' as const, id: 'LIST' }],
    }),

    getProduct: builder.query<Product, string>({
      query: (id) => `/products/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),

    createProduct: builder.mutation<Product, Partial<Product>>({
      query: (body) => ({ url: '/products', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Product', id: 'LIST' },
        'Inventory',
        'Category',
        'Dashboard',
      ],
    }),

    updateProduct: builder.mutation<Product, { id: string; body: Partial<Product> }>({
      query: ({ id, body }) => ({ url: `/products/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Product', id },
        { type: 'Product', id: 'LIST' },
        'Inventory',
        'Dashboard',
      ],
    }),

    deleteProduct: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/products/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Product', id: 'LIST' }, 'Inventory', 'Category', 'Dashboard'],
    }),

    duplicateProduct: builder.mutation<Product, string>({
      query: (id) => ({ url: `/products/${id}/duplicate`, method: 'POST' }),
      invalidatesTags: [{ type: 'Product', id: 'LIST' }, 'Inventory'],
    }),

    bulkProductAction: builder.mutation<
      { affected: number },
      { action: 'delete' | 'status' | 'feature' | 'unfeature'; ids: string[]; status?: Product['status'] }
    >({
      query: (body) => ({ url: '/products/bulk', method: 'POST', body }),
      invalidatesTags: [{ type: 'Product', id: 'LIST' }, 'Inventory', 'Dashboard'],
    }),

    /* ------------------------------- categories ------------------------------ */

    getCategories: builder.query<Category[], ListParams | void>({
      query: (params) => ({ url: '/categories', params: params ?? {} }),
      providesTags: [{ type: 'Category', id: 'LIST' }],
    }),

    getCategoryTree: builder.query<CategoryNode[], void>({
      query: () => ({ url: '/categories', params: { tree: true } }),
      providesTags: [{ type: 'Category', id: 'TREE' }],
    }),

    createCategory: builder.mutation<Category, Partial<Category>>({
      query: (body) => ({ url: '/categories', method: 'POST', body }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, { type: 'Category', id: 'TREE' }],
    }),

    updateCategory: builder.mutation<Category, { id: string; body: Partial<Category> }>({
      query: ({ id, body }) => ({ url: `/categories/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, { type: 'Category', id: 'TREE' }],
    }),

    deleteCategory: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, { type: 'Category', id: 'TREE' }],
    }),

    reorderCategories: builder.mutation<CategoryNode[], string[]>({
      query: (ids) => ({ url: '/categories/reorder', method: 'PUT', body: { ids } }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, { type: 'Category', id: 'TREE' }],
    }),

    /* ------------------------------ collections ------------------------------ */

    getCollections: builder.query<Collection[], ListParams | void>({
      query: (params) => ({ url: '/collections', params: params ?? {} }),
      providesTags: [{ type: 'Collection', id: 'LIST' }],
    }),

    getCollection: builder.query<CollectionWithProducts, string>({
      query: (id) => `/collections/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Collection', id }],
    }),

    createCollection: builder.mutation<Collection, Partial<Collection>>({
      query: (body) => ({ url: '/collections', method: 'POST', body }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }],
    }),

    updateCollection: builder.mutation<Collection, { id: string; body: Partial<Collection> }>({
      query: ({ id, body }) => ({ url: `/collections/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Collection', id },
        { type: 'Collection', id: 'LIST' },
        { type: 'Product', id: 'LIST' },
      ],
    }),

    deleteCollection: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/collections/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }, { type: 'Product', id: 'LIST' }],
    }),

    reorderCollections: builder.mutation<Collection[], string[]>({
      query: (ids) => ({ url: '/collections/reorder', method: 'PUT', body: { ids } }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useDuplicateProductMutation,
  useBulkProductActionMutation,
  useGetCategoriesQuery,
  useGetCategoryTreeQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useReorderCategoriesMutation,
  useGetCollectionsQuery,
  useGetCollectionQuery,
  useCreateCollectionMutation,
  useUpdateCollectionMutation,
  useDeleteCollectionMutation,
  useReorderCollectionsMutation,
} = catalogApi;
