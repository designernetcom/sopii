import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  Copy,
  IndianRupee,
  Layers,
  Pencil,
  ShoppingBag,
  Star,
  Trash2,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, usePermissions } from '@/hooks';
import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import {
  useDeleteProductMutation,
  useDuplicateProductMutation,
  useGetCategoriesQuery,
  useGetCollectionsQuery,
  useGetProductQuery,
} from '@/store/api/catalogApi';
import { useGetReviewsQuery } from '@/store/api/marketingApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody, CardHeader, DetailRow } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge, StatusBadge } from '@/components/common/Badge';
import { AppImage } from '@/components/common/AppImage';
import { Tabs } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/States';
import { ImagePreviewModal } from '@/components/modals/ImagePreviewModal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { PRODUCT_STATUS, REVIEW_STATUS, STOCK_STATUS } from '@/utils/constants';
import { discountPercent, formatCurrency, formatDate, formatNumber } from '@/utils/format';

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            'h-3.5 w-3.5',
            index < Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-ink-300 dark:text-ink-600',
          )}
        />
      ))}
    </span>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const [tab, setTab] = useState('overview');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: product, isLoading, isError, refetch } = useGetProductQuery(id!);
  const { data: categories } = useGetCategoriesQuery();
  const { data: collections } = useGetCollectionsQuery();
  const { data: reviews } = useGetReviewsQuery({ productId: id, pageSize: 20 }, { skip: !id });

  const [deleteProduct, { isLoading: deleting }] = useDeleteProductMutation();
  const [duplicateProduct, { isLoading: duplicating }] = useDuplicateProductMutation();

  useDocumentTitle(product?.name ?? 'Product');
  useBreadcrumbLabel(product?.name);

  if (isLoading) return <PageLoader />;

  if (isError || !product) {
    return (
      <Card>
        <ErrorState
          title="We could not load this product"
          description="It may have been deleted, or the request failed."
          onRetry={refetch}
        />
      </Card>
    );
  }

  const category = categories?.find((c) => c.id === product.categoryId);
  const parentCategory = category?.parentId
    ? categories?.find((c) => c.id === category.parentId)
    : undefined;

  const stockStatus =
    product.stock <= 0
      ? 'out_of_stock'
      : product.stock <= product.lowStockThreshold
        ? 'low_stock'
        : 'in_stock';

  const productCollections = (collections ?? []).filter((collection) =>
    product.collectionIds.includes(collection.id),
  );

  const handleDelete = async () => {
    try {
      await deleteProduct(product.id).unwrap();
      toast.success('Product deleted successfully.', product.name);
      navigate('/admin/products');
    } catch (error) {
      toast.error('Could not delete product', errorMessage(error));
    }
  };

  const handleDuplicate = async () => {
    try {
      const copy = await duplicateProduct(product.id).unwrap();
      toast.success('Product duplicated', 'The copy was created as a draft.');
      navigate(`/admin/products/${copy.id}/edit`);
    } catch (error) {
      toast.error('Could not duplicate product', errorMessage(error));
    }
  };

  const stats = [
    {
      label: 'Units sold',
      value: formatNumber(product.unitsSold),
      icon: ShoppingBag,
      tone: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
    },
    {
      label: 'Revenue',
      value: formatCurrency(product.revenue),
      icon: IndianRupee,
      tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    {
      label: 'In stock',
      value: formatNumber(product.stock),
      icon: Boxes,
      tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    },
    {
      label: 'Variants',
      value: formatNumber(product.variants.length),
      icon: Layers,
      tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <button
            type="button"
            onClick={() => navigate('/admin/products')}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to products
          </button>
        }
        title={product.name}
        description={product.shortDescription}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={PRODUCT_STATUS[product.status]} size="md" />
            <StatusBadge tone={STOCK_STATUS[stockStatus]} size="md" />
            {product.featured && (
              <Badge
                className="bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400"
                size="md"
              >
                Featured
              </Badge>
            )}
          </div>
        }
        actions={
          <>
            {can('products', 'create') && (
              <Button
                variant="secondary"
                icon={<Copy className="h-4 w-4" />}
                loading={duplicating}
                onClick={handleDuplicate}
              >
                Duplicate
              </Button>
            )}
            {can('products', 'delete') && (
              <Button
                variant="secondary"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            )}
            {can('products', 'edit') && (
              <Button
                variant="primary"
                icon={<Pencil className="h-4 w-4" />}
                to={`/admin/products/${product.id}/edit`}
              >
                Edit product
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', stat.tone)}>
                <stat.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-2xs text-ink-500 dark:text-ink-400">{stat.label}</p>
                <p className="truncate text-base font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                  {stat.value}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Gallery */}
        <Card className="lg:col-span-1">
          <CardHeader title="Gallery" description={`${product.images.length} images`} />
          <CardBody className="space-y-3">
            {product.images.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setPreviewIndex(0)}
                  className="block w-full overflow-hidden rounded-xl"
                >
                  <AppImage
                    src={product.images[0].url}
                    alt={product.name}
                    seed={product.images[0].id}
                    wrapperClassName="aspect-square w-full"
                  />
                </button>
                {product.images.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {product.images.slice(1, 5).map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setPreviewIndex(index + 1)}
                        className="overflow-hidden rounded-lg ring-1 ring-ink-200 transition-shadow hover:ring-brand-400 dark:ring-ink-700"
                      >
                        <AppImage
                          src={image.url}
                          alt={image.alt ?? product.name}
                          seed={image.id}
                          wrapperClassName="aspect-square w-full"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <EmptyState compact title="No images" description="Add images from the edit screen." />
            )}
          </CardBody>
        </Card>

        {/* Details */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <Tabs
              className="px-4 pt-1"
              items={[
                { key: 'overview', label: 'Overview' },
                { key: 'variants', label: 'Variants', count: product.variants.length },
                { key: 'seo', label: 'SEO' },
                { key: 'reviews', label: 'Reviews', count: reviews?.total ?? 0 },
              ]}
              active={tab}
              onChange={setTab}
            />

            <CardBody>
              {tab === 'overview' && (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Pricing
                    </h4>
                    <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                      <DetailRow label="Selling price">{formatCurrency(product.price)}</DetailRow>
                      <DetailRow label="MRP">{formatCurrency(product.mrp)}</DetailRow>
                      <DetailRow label="Discount">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {discountPercent(product.mrp, product.price)}%
                        </span>
                      </DetailRow>
                      <DetailRow label="Cost price">
                        {product.costPrice ? formatCurrency(product.costPrice) : '—'}
                      </DetailRow>
                      <DetailRow label="GST">{product.taxRate}%</DetailRow>
                    </dl>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Inventory
                    </h4>
                    <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                      <DetailRow label="SKU">
                        <span className="font-mono text-xs">{product.sku}</span>
                      </DetailRow>
                      <DetailRow label="Barcode">
                        <span className="font-mono text-xs">{product.barcode ?? '—'}</span>
                      </DetailRow>
                      <DetailRow label="In stock">{formatNumber(product.stock)}</DetailRow>
                      <DetailRow label="Reserved">{formatNumber(product.reserved)}</DetailRow>
                      <DetailRow label="Low stock at">{product.lowStockThreshold}</DetailRow>
                      <DetailRow label="Backorders">
                        {product.allowBackorders ? 'Allowed' : 'Not allowed'}
                      </DetailRow>
                    </dl>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Organisation
                    </h4>
                    <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                      <DetailRow label="Category">
                        {parentCategory ? `${parentCategory.name} › ${category?.name}` : category?.name ?? '—'}
                      </DetailRow>
                      <DetailRow label="Brand">{product.brand ?? '—'}</DetailRow>
                      <DetailRow label="Created">{formatDate(product.createdAt)}</DetailRow>
                      <DetailRow label="Updated">{formatDate(product.updatedAt, true)}</DetailRow>
                    </dl>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Specification
                    </h4>
                    <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                      <DetailRow label="Fabric">{product.details.fabric ?? '—'}</DetailRow>
                      <DetailRow label="Pattern">{product.details.pattern ?? '—'}</DetailRow>
                      <DetailRow label="Occasion">{product.details.occasion ?? '—'}</DetailRow>
                      <DetailRow label="Fit">{product.details.fit ?? '—'}</DetailRow>
                      <DetailRow label="Origin">{product.details.countryOfOrigin ?? '—'}</DetailRow>
                    </dl>
                  </div>

                  {product.description && (
                    <div className="sm:col-span-2">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                        Description
                      </h4>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-400">
                        {product.description}
                      </p>
                    </div>
                  )}

                  {product.details.careInstructions && (
                    <div className="sm:col-span-2">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                        Care
                      </h4>
                      <p className="text-sm text-ink-600 dark:text-ink-400">
                        {product.details.careInstructions}
                      </p>
                    </div>
                  )}

                  {(productCollections.length > 0 || product.tags.length > 0) && (
                    <div className="sm:col-span-2">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                        Collections & tags
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {productCollections.map((collection) => (
                          <Badge
                            key={collection.id}
                            className="bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-300"
                          >
                            {collection.name}
                          </Badge>
                        ))}
                        {product.tags.map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'variants' &&
                (product.variants.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Layers}
                    title="No variants"
                    description="This product is sold as a single SKU."
                  />
                ) : (
                  <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-sm">
                      <thead>
                        <tr className="border-b border-ink-200 text-2xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                          <th scope="col" className="px-5 py-2 text-left font-semibold">Variant</th>
                          <th scope="col" className="px-3 py-2 text-left font-semibold">SKU</th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">Price</th>
                          <th scope="col" className="px-5 py-2 text-right font-semibold">Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                        {product.variants.map((variant) => (
                          <tr key={variant.id}>
                            <td className="px-5 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <AppImage
                                  src={variant.image}
                                  alt={variant.sku}
                                  seed={variant.id}
                                  wrapperClassName="h-8 w-8 shrink-0"
                                />
                                <span className="text-ink-800 dark:text-ink-200">
                                  {[variant.color, variant.size].filter(Boolean).join(' / ')}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-ink-600 dark:text-ink-400">
                              {variant.sku}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-ink-800 dark:text-ink-200">
                              {formatCurrency(variant.price)}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <span
                                className={cn(
                                  'tabular-nums',
                                  variant.stock === 0
                                    ? 'font-medium text-rose-600 dark:text-rose-400'
                                    : 'text-ink-800 dark:text-ink-200',
                                )}
                              >
                                {variant.stock}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {tab === 'seo' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-4 dark:border-ink-700 dark:bg-ink-800/40">
                    <p className="truncate text-sm text-brand-700 dark:text-brand-400">
                      {product.seo.title ?? product.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-emerald-700 dark:text-emerald-500">
                      sopii.in/products/{product.seo.slug ?? product.slug}
                    </p>
                    <p className="mt-1 text-xs text-ink-600 dark:text-ink-400">
                      {product.seo.metaDescription ?? product.shortDescription}
                    </p>
                  </div>
                  <dl className="divide-y divide-ink-200 dark:divide-ink-800">
                    <DetailRow label="URL slug">{product.seo.slug ?? product.slug}</DetailRow>
                    <DetailRow label="Keywords">
                      {product.seo.keywords?.length ? product.seo.keywords.join(', ') : '—'}
                    </DetailRow>
                    <DetailRow label="OG image">
                      <span className="font-mono text-xs">{product.seo.ogImage ?? '—'}</span>
                    </DetailRow>
                  </dl>
                </div>
              )}

              {tab === 'reviews' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4 rounded-lg bg-ink-50 p-4 dark:bg-ink-800/50">
                    <div>
                      <p className="text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                        {product.rating.toFixed(1)}
                      </p>
                      <Stars rating={product.rating} />
                    </div>
                    <div className="text-xs text-ink-500 dark:text-ink-400">
                      Based on {formatNumber(product.reviewCount)} customer reviews
                    </div>
                    <Button size="sm" variant="secondary" className="ml-auto" to="/admin/reviews">
                      Moderate reviews
                    </Button>
                  </div>

                  {reviews?.items.length ? (
                    <ul className="space-y-3">
                      {reviews.items.map((review) => (
                        <li
                          key={review.id}
                          className="rounded-lg border border-ink-200 p-4 dark:border-ink-700"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-ink-900 dark:text-ink-100">
                              {review.customerName}
                            </span>
                            <Stars rating={review.rating} />
                            <StatusBadge tone={REVIEW_STATUS[review.status]} />
                            <span className="ml-auto text-2xs text-ink-400">
                              {formatDate(review.createdAt)}
                            </span>
                          </div>
                          {review.title && (
                            <p className="mt-2 text-sm font-medium text-ink-800 dark:text-ink-200">
                              {review.title}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">{review.body}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      compact
                      title="No reviews yet"
                      description="Reviews appear here once customers start writing them."
                    />
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ImagePreviewModal
        open={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        startIndex={previewIndex ?? 0}
        images={product.images.map((image) => ({
          id: image.id,
          url: image.url,
          name: image.alt ?? product.name,
          meta: [
            { label: 'SKU', value: product.sku },
            { label: 'Price', value: formatCurrency(product.price) },
          ],
        }))}
      />

      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        entity="product"
        name={product.name}
        loading={deleting}
      />
    </div>
  );
}
