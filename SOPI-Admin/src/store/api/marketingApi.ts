import type {
  Announcement,
  Banner,
  Coupon,
  FeaturedCollectionSection,
  HomeSection,
  ListParams,
  MediaAsset,
  Paginated,
  Review,
} from '@/types';
import { baseApi } from './baseApi';

export interface ReviewCounts {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
  averageRating: number;
}

export interface MediaStats {
  total: number;
  size: number;
  byFolder: Record<string, number>;
}

/* -------------------------------- uploads ---------------------------------- */

/** One image on its way to Cloudinary, as a base64 data URI. */
export interface UploadCandidate {
  data: string;
  name?: string;
  alt?: string;
}

/** What Cloudinary answered with — the pair a record stores. */
export interface UploadedImage {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  name?: string;
  alt?: string;
}

export interface UploadImagesRequest {
  /**
   * Decides the Cloudinary folder: a product's images are filed under
   * `sopii/products/{ownerId}`, a banner's under `sopii/banners/{ownerId}`,
   * and anything else under the library folder.
   */
  scope: 'product' | 'banner' | 'library';
  /** The product or banner id. Absent for a record being created. */
  ownerId?: string;
  /** Library folder name, for `scope: 'library'`. */
  folder?: string;
  images: UploadCandidate[];
}

export interface UploadImagesResponse {
  images: UploadedImage[];
  /** Whatever did not land, so a partial batch can say which one and why. */
  failed: { name?: string; message: string }[];
}

export interface UploadStatus {
  configured: boolean;
  maxBytes: number;
  provider: string;
}

export const marketingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /* --------------------------------- coupons ------------------------------- */

    getCoupons: builder.query<Paginated<Coupon>, ListParams | void>({
      query: (params) => ({ url: '/coupons', params: params ?? {} }),
      providesTags: [{ type: 'Coupon', id: 'LIST' }],
    }),

    getCoupon: builder.query<Coupon, string>({
      query: (id) => `/coupons/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Coupon', id }],
    }),

    createCoupon: builder.mutation<Coupon, Partial<Coupon>>({
      query: (body) => ({ url: '/coupons', method: 'POST', body }),
      invalidatesTags: [{ type: 'Coupon', id: 'LIST' }],
    }),

    updateCoupon: builder.mutation<Coupon, { id: string; body: Partial<Coupon> }>({
      query: ({ id, body }) => ({ url: `/coupons/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Coupon', id },
        { type: 'Coupon', id: 'LIST' },
      ],
    }),

    deleteCoupon: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/coupons/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Coupon', id: 'LIST' }],
    }),

    /* --------------------------------- reviews ------------------------------- */

    getReviews: builder.query<Paginated<Review>, ListParams | void>({
      query: (params) => ({ url: '/reviews', params: params ?? {} }),
      providesTags: [{ type: 'Review', id: 'LIST' }],
    }),

    getReviewCounts: builder.query<ReviewCounts, void>({
      query: () => '/reviews/counts',
      providesTags: [{ type: 'Review', id: 'COUNTS' }],
    }),

    updateReviewStatus: builder.mutation<Review, { id: string; status: Review['status'] }>({
      query: ({ id, status }) => ({ url: `/reviews/${id}/status`, method: 'PUT', body: { status } }),
      invalidatesTags: [
        { type: 'Review', id: 'LIST' },
        { type: 'Review', id: 'COUNTS' },
      ],
    }),

    replyToReview: builder.mutation<Review, { id: string; reply: string; by?: string }>({
      query: ({ id, ...body }) => ({ url: `/reviews/${id}/reply`, method: 'POST', body }),
      invalidatesTags: [{ type: 'Review', id: 'LIST' }],
    }),

    bulkReviewAction: builder.mutation<
      { affected: number },
      { action: 'status' | 'delete'; ids: string[]; status?: Review['status'] }
    >({
      query: (body) => ({ url: '/reviews/bulk', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Review', id: 'LIST' },
        { type: 'Review', id: 'COUNTS' },
      ],
    }),

    deleteReview: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/reviews/${id}`, method: 'DELETE' }),
      invalidatesTags: [
        { type: 'Review', id: 'LIST' },
        { type: 'Review', id: 'COUNTS' },
      ],
    }),

    /* -------------------------------- homepage ------------------------------- */

    getBanners: builder.query<Banner[], void>({
      query: () => '/homepage/banners',
      providesTags: [{ type: 'Banner', id: 'LIST' }],
    }),

    createBanner: builder.mutation<Banner, Partial<Banner>>({
      query: (body) => ({ url: '/homepage/banners', method: 'POST', body }),
      invalidatesTags: [{ type: 'Banner', id: 'LIST' }],
    }),

    updateBanner: builder.mutation<Banner, { id: string; body: Partial<Banner> }>({
      query: ({ id, body }) => ({ url: `/homepage/banners/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Banner', id: 'LIST' }],
    }),

    deleteBanner: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/homepage/banners/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Banner', id: 'LIST' }],
    }),

    reorderBanners: builder.mutation<Banner[], string[]>({
      query: (ids) => ({ url: '/homepage/banners/reorder', method: 'PUT', body: { ids } }),
      invalidatesTags: [{ type: 'Banner', id: 'LIST' }],
    }),

    getHomeSections: builder.query<HomeSection[], void>({
      query: () => '/homepage/sections',
      providesTags: [{ type: 'HomeSection', id: 'LIST' }],
    }),

    updateHomeSection: builder.mutation<HomeSection, { id: string; body: Partial<HomeSection> }>({
      query: ({ id, body }) => ({ url: `/homepage/sections/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'HomeSection', id: 'LIST' }],
    }),

    reorderHomeSections: builder.mutation<HomeSection[], string[]>({
      query: (ids) => ({ url: '/homepage/sections/reorder', method: 'PUT', body: { ids } }),
      invalidatesTags: [{ type: 'HomeSection', id: 'LIST' }],
    }),

    getAnnouncements: builder.query<Announcement[], void>({
      query: () => '/homepage/announcements',
      providesTags: [{ type: 'Announcement', id: 'LIST' }],
    }),

    createAnnouncement: builder.mutation<Announcement, Partial<Announcement>>({
      query: (body) => ({ url: '/homepage/announcements', method: 'POST', body }),
      invalidatesTags: [{ type: 'Announcement', id: 'LIST' }],
    }),

    updateAnnouncement: builder.mutation<
      Announcement,
      { id: string; body: Partial<Announcement> }
    >({
      query: ({ id, body }) => ({ url: `/homepage/announcements/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Announcement', id: 'LIST' }],
    }),

    deleteAnnouncement: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/homepage/announcements/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Announcement', id: 'LIST' }],
    }),

    /* The home page's split image/copy section — one document, saved whole or in part. */
    getFeaturedCollection: builder.query<FeaturedCollectionSection, void>({
      query: () => '/homepage/featured-collection',
      providesTags: ['FeaturedCollection'],
    }),

    updateFeaturedCollection: builder.mutation<
      FeaturedCollectionSection,
      Partial<FeaturedCollectionSection>
    >({
      query: (body) => ({ url: '/homepage/featured-collection', method: 'PUT', body }),
      invalidatesTags: ['FeaturedCollection'],
    }),

    /* --------------------------------- uploads ------------------------------- */

    /*
     * Image bytes go browser → API → Cloudinary, and what comes back is a URL
     * and a public id. The panel never signs a Cloudinary request itself: that
     * would need the API secret in the bundle, where anyone reading it could
     * write to — and delete from — the account.
     */

    getUploadStatus: builder.query<UploadStatus, void>({
      query: () => '/uploads/status',
    }),

    uploadImages: builder.mutation<UploadImagesResponse, UploadImagesRequest>({
      query: (body) => ({ url: '/uploads/image', method: 'POST', body }),
    }),

    /**
     * Discards an asset that was uploaded and then abandoned before the record
     * referencing it was saved. Images on a saved record are cleaned up by the
     * server when that record changes, which is the only place that knows what
     * it still points at.
     */
    discardUpload: builder.mutation<{ publicId: string; removed: boolean }, string>({
      query: (publicId) => ({
        url: '/uploads/image',
        method: 'DELETE',
        params: { publicId },
      }),
    }),

    /* ---------------------------------- media -------------------------------- */

    getMedia: builder.query<Paginated<MediaAsset>, ListParams | void>({
      query: (params) => ({ url: '/media', params: params ?? {} }),
      providesTags: [{ type: 'Media', id: 'LIST' }],
    }),

    getMediaStats: builder.query<MediaStats, void>({
      query: () => '/media/stats',
      providesTags: [{ type: 'Media', id: 'STATS' }],
    }),

    uploadMedia: builder.mutation<MediaAsset | MediaAsset[], { files: Partial<MediaAsset>[] }>({
      query: (body) => ({ url: '/media', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Media', id: 'LIST' },
        { type: 'Media', id: 'STATS' },
      ],
    }),

    updateMedia: builder.mutation<MediaAsset, { id: string; body: Partial<MediaAsset> }>({
      query: ({ id, body }) => ({ url: `/media/${id}`, method: 'PUT', body }),
      invalidatesTags: [{ type: 'Media', id: 'LIST' }],
    }),

    deleteMedia: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/media/${id}`, method: 'DELETE' }),
      invalidatesTags: [
        { type: 'Media', id: 'LIST' },
        { type: 'Media', id: 'STATS' },
      ],
    }),

    bulkDeleteMedia: builder.mutation<{ affected: number }, string[]>({
      query: (ids) => ({ url: '/media/bulk-delete', method: 'POST', body: { ids } }),
      invalidatesTags: [
        { type: 'Media', id: 'LIST' },
        { type: 'Media', id: 'STATS' },
      ],
    }),
  }),
});

export const {
  useGetCouponsQuery,
  useGetCouponQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useDeleteCouponMutation,
  useGetReviewsQuery,
  useGetReviewCountsQuery,
  useUpdateReviewStatusMutation,
  useReplyToReviewMutation,
  useBulkReviewActionMutation,
  useDeleteReviewMutation,
  useGetBannersQuery,
  useCreateBannerMutation,
  useUpdateBannerMutation,
  useDeleteBannerMutation,
  useReorderBannersMutation,
  useGetHomeSectionsQuery,
  useUpdateHomeSectionMutation,
  useReorderHomeSectionsMutation,
  useGetAnnouncementsQuery,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useGetFeaturedCollectionQuery,
  useUpdateFeaturedCollectionMutation,
  useGetUploadStatusQuery,
  useUploadImagesMutation,
  useDiscardUploadMutation,
  useGetMediaQuery,
  useGetMediaStatsQuery,
  useUploadMediaMutation,
  useUpdateMediaMutation,
  useDeleteMediaMutation,
  useBulkDeleteMediaMutation,
} = marketingApi;
