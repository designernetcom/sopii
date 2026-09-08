import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eye, Save, Send, Tag, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle } from '@/hooks';
import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import {
  useCreateProductMutation,
  useGetCategoriesQuery,
  useGetCollectionsQuery,
  useGetProductQuery,
  useUpdateProductMutation,
} from '@/store/api/catalogApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/common/Field';
import { PageLoader, ErrorState } from '@/components/common/States';
import { ImageManager } from '@/components/products/ImageManager';
import { VariantEditor } from '@/components/products/VariantEditor';
import { ImagePreviewModal } from '@/components/modals/ImagePreviewModal';
import { useToast } from '@/components/common/Toast';
import { FITS, OCCASIONS, PATTERNS, FABRICS } from '@/utils/constants';
import { discountPercent, formatCurrency, slugify } from '@/utils/format';
import type { ProductImage, ProductStatus, ProductVariant, SeoMeta } from '@/types';
import { SeoFields, validateJsonLd } from '@/components/seo/SeoFields';
import { useGetSeoSettingsQuery } from '@/store/api/seoApi';

const schema = z
  .object({
    name: z.string().min(3, 'Product name must be at least 3 characters'),
    sku: z.string().min(3, 'SKU is required'),
    slug: z.string().optional(),
    categoryId: z.string().min(1, 'Select a category'),
    brand: z.string().optional(),
    shortDescription: z.string().max(220, 'Keep the short description under 220 characters').optional(),
    description: z.string().optional(),

    price: z.coerce.number({ invalid_type_error: 'Enter a price' }).positive('Price must be greater than 0'),
    mrp: z.coerce.number({ invalid_type_error: 'Enter an MRP' }).positive('MRP must be greater than 0'),
    costPrice: z.coerce.number().min(0, 'Cost price cannot be negative').optional(),
    taxRate: z.coerce.number().min(0).max(28, 'GST cannot exceed 28%'),

    barcode: z.string().optional(),
    stock: z.coerce.number().min(0, 'Stock cannot be negative'),
    lowStockThreshold: z.coerce.number().min(0, 'Threshold cannot be negative'),
    trackInventory: z.boolean(),
    allowBackorders: z.boolean(),

    fabric: z.string().optional(),
    pattern: z.string().optional(),
    occasion: z.string().optional(),
    fit: z.string().optional(),
    careInstructions: z.string().optional(),
    countryOfOrigin: z.string().optional(),

    featured: z.boolean(),
    status: z.enum(['published', 'draft', 'archived']),
  })
  .refine((values) => values.price <= values.mrp, {
    message: 'Selling price cannot be higher than MRP',
    path: ['price'],
  });

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: '',
  sku: '',
  slug: '',
  categoryId: '',
  brand: 'SOPII',
  shortDescription: '',
  description: '',
  price: 0,
  mrp: 0,
  costPrice: 0,
  taxRate: 12,
  barcode: '',
  stock: 0,
  lowStockThreshold: 10,
  trackInventory: true,
  allowBackorders: false,
  fabric: '',
  pattern: '',
  occasion: '',
  fit: '',
  careInstructions: '',
  countryOfOrigin: 'India',
  featured: false,
  status: 'draft',
};

function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <Card id={id}>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

export default function ProductFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const isEdit = mode === 'edit';
  const { data: product, isLoading, isError, refetch } = useGetProductQuery(id!, { skip: !isEdit });
  const { data: categories } = useGetCategoriesQuery();
  const { data: collections } = useGetCollectionsQuery();
  /* Drives the preview URL and site name, so the SEO tab shows the real
     address rather than a hardcoded guess. */
  const { data: seoSettings } = useGetSeoSettingsQuery();

  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: updating }] = useUpdateProductMutation();

  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  /* The full metadata block, held alongside the form rather than inside it:
     it is one object saved as one object, and every field is optional. */
  const [seo, setSeo] = useState<SeoMeta>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  useDocumentTitle(isEdit ? `Edit ${product?.name ?? 'product'}` : 'Add Product');
  useBreadcrumbLabel(isEdit ? product?.name : undefined);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!product) return;
    reset({
      name: product.name,
      sku: product.sku,
      slug: product.slug,
      categoryId: product.categoryId,
      brand: product.brand ?? '',
      shortDescription: product.shortDescription ?? '',
      description: product.description ?? '',
      price: product.price,
      mrp: product.mrp,
      costPrice: product.costPrice ?? 0,
      taxRate: product.taxRate,
      barcode: product.barcode ?? '',
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      trackInventory: product.trackInventory,
      allowBackorders: product.allowBackorders,
      fabric: product.details.fabric ?? '',
      pattern: product.details.pattern ?? '',
      occasion: product.details.occasion ?? '',
      fit: product.details.fit ?? '',
      careInstructions: product.details.careInstructions ?? '',
      countryOfOrigin: product.details.countryOfOrigin ?? 'India',
      featured: product.featured,
      status: product.status,
    });
    setSeo(product.seo ?? {});
    setImages(product.images);
    setVariants(product.variants);
    setCollectionIds(product.collectionIds);
    setTags(product.tags);
  }, [product, reset]);

  const price = Number(watch('price')) || 0;
  const mrp = Number(watch('mrp')) || 0;
  const costPrice = Number(watch('costPrice')) || 0;
  const name = watch('name');
  const slug = watch('slug');
  const trackInventory = watch('trackInventory');

  const discount = discountPercent(mrp, price);
  const margin = price > 0 && costPrice > 0 ? Math.round(((price - costPrice) / price) * 100) : 0;

  const categoryOptions = useMemo(
    () =>
      (categories ?? []).map((category) => ({
        value: category.id,
        label: category.parentId ? `— ${category.name}` : category.name,
        disabled: !category.parentId && (categories ?? []).some((c) => c.parentId === category.id),
      })),
    [categories],
  );

  const addTag = () => {
    const value = tagDraft.trim().toLowerCase();
    if (!value) return;
    if (tags.includes(value)) {
      setTagDraft('');
      return;
    }
    setTags([...tags, value]);
    setTagDraft('');
  };

  const buildPayload = (values: FormValues, status: ProductStatus) => ({
    name: values.name,
    sku: values.sku,
    slug: values.slug || slugify(values.name),
    categoryId: values.categoryId,
    brand: values.brand,
    shortDescription: values.shortDescription,
    description: values.description,
    price: values.price,
    mrp: values.mrp,
    costPrice: values.costPrice,
    taxRate: values.taxRate,
    barcode: values.barcode,
    stock: variants.length
      ? variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0)
      : values.stock,
    lowStockThreshold: values.lowStockThreshold,
    trackInventory: values.trackInventory,
    allowBackorders: values.allowBackorders,
    variants,
    images,
    details: {
      fabric: values.fabric,
      pattern: values.pattern,
      occasion: values.occasion,
      fit: values.fit,
      careInstructions: values.careInstructions,
      countryOfOrigin: values.countryOfOrigin,
    },
    seo: {
      ...seo,
      /* Two sensible derivations so a product is never published without a
         URL or a share image, whatever the SEO tab was left at. */
      slug: seo.slug || values.slug || slugify(values.name),
      ogImage: seo.ogImage || images[0]?.url,
    },
    status,
    featured: values.featured,
    collectionIds,
    tags,
  });

  const submit = (status: ProductStatus) =>
    handleSubmit(async (values) => {
      if (images.length === 0 && status === 'published') {
        toast.warning('Add at least one image', 'Published products need a main image.');
        return;
      }

      const payload = buildPayload(values, status);

      try {
        if (isEdit && id) {
          await updateProduct({ id, body: payload }).unwrap();
          toast.success('Product updated successfully.', values.name);
          navigate(`/admin/products/${id}`);
        } else {
          const created = await createProduct(payload).unwrap();
          toast.success('Product created successfully.', created.name);
          navigate(`/admin/products/${created.id}`);
        }
      } catch (error) {
        toast.error('Could not save the product', errorMessage(error));
      }
    })();

  if (isEdit && isLoading) return <PageLoader />;

  if (isEdit && isError) {
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

  const saving = creating || updating;

  return (
    <div className="space-y-5 pb-24">
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
        title={isEdit ? 'Edit product' : 'Add product'}
        description={
          isEdit
            ? 'Update pricing, stock, imagery and merchandising for this piece.'
            : 'Create a new piece for the SOPII catalogue.'
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              icon={<Eye className="h-4 w-4" />}
              onClick={() => setPreviewOpen(true)}
              disabled={images.length === 0}
            >
              Preview
            </Button>
            <Button
              variant="secondary"
              icon={<Save className="h-4 w-4" />}
              loading={saving}
              onClick={() => submit('draft')}
            >
              Save Draft
            </Button>
            <Button
              variant="primary"
              icon={<Send className="h-4 w-4" />}
              loading={saving}
              onClick={() => submit('published')}
            >
              {isEdit ? 'Save & Publish' : 'Publish'}
            </Button>
          </>
        }
      />

      <form className="grid grid-cols-1 gap-5 xl:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-5 xl:col-span-2">
          <Section
            id="basic"
            title="Basic information"
            description="How the product appears across the storefront."
          >
            <Field label="Product Name" htmlFor="name" required error={errors.name?.message}>
              <Input
                id="name"
                placeholder="Ivory Handwoven Chanderi Saree"
                invalid={Boolean(errors.name)}
                {...register('name')}
                onBlur={(event) => {
                  register('name').onBlur(event);
                  if (!getValues('slug')) setValue('slug', slugify(event.target.value));
                  /* No brand suffix here: the site's title template appends it,
                     so adding it now would render "Name | SOPII | SOPII". */
                  setSeo((current) =>
                    current.title ? current : { ...current, title: event.target.value },
                  );
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU" htmlFor="sku" required error={errors.sku?.message}>
                <Input
                  id="sku"
                  placeholder="SOP-IVHW-1042"
                  className="font-mono"
                  invalid={Boolean(errors.sku)}
                  {...register('sku')}
                />
              </Field>
              <Field label="Brand" htmlFor="brand">
                <Input id="brand" placeholder="SOPII" {...register('brand')} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Category"
                htmlFor="categoryId"
                required
                error={errors.categoryId?.message}
              >
                <Select
                  id="categoryId"
                  placeholder="Select a category"
                  options={categoryOptions}
                  invalid={Boolean(errors.categoryId)}
                  {...register('categoryId')}
                />
              </Field>
              <Field label="URL Slug" htmlFor="slug" hint={`/products/${slug || slugify(name || 'product-name')}`}>
                <Input id="slug" placeholder="ivory-handwoven-saree" {...register('slug')} />
              </Field>
            </div>

            <Field
              label="Short Description"
              htmlFor="shortDescription"
              error={errors.shortDescription?.message}
              addon={`${watch('shortDescription')?.length ?? 0}/220`}
              hint="Shown on product cards and search results."
            >
              <Textarea
                id="shortDescription"
                rows={2}
                placeholder="Handwoven chanderi saree with a zari border, finished in our Varanasi studio."
                invalid={Boolean(errors.shortDescription)}
                {...register('shortDescription')}
              />
            </Field>

            <Field label="Description" htmlFor="description" hint="Supports line breaks.">
              <Textarea
                id="description"
                rows={6}
                placeholder="Tell the story of the weave, the artisans and how the piece drapes…"
                {...register('description')}
              />
            </Field>
          </Section>

          <Section
            id="pricing"
            title="Pricing"
            description="Discount and margin update as you type."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Price" htmlFor="price" required error={errors.price?.message}>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="1"
                  prefix="₹"
                  className="tabular-nums"
                  invalid={Boolean(errors.price)}
                  {...register('price')}
                />
              </Field>
              <Field label="MRP" htmlFor="mrp" required error={errors.mrp?.message}>
                <Input
                  id="mrp"
                  type="number"
                  min={0}
                  step="1"
                  prefix="₹"
                  className="tabular-nums"
                  invalid={Boolean(errors.mrp)}
                  {...register('mrp')}
                />
              </Field>
              <Field label="Cost Price" htmlFor="costPrice" error={errors.costPrice?.message} hint="Internal only">
                <Input
                  id="costPrice"
                  type="number"
                  min={0}
                  step="1"
                  prefix="₹"
                  className="tabular-nums"
                  {...register('costPrice')}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tax / GST" htmlFor="taxRate" error={errors.taxRate?.message}>
                <Input
                  id="taxRate"
                  type="number"
                  min={0}
                  max={28}
                  suffix="%"
                  className="tabular-nums"
                  {...register('taxRate')}
                />
              </Field>
              <Field label="Discount" hint="Calculated from MRP and price">
                <Input value={`${discount}%`} readOnly disabled className="tabular-nums" />
              </Field>
              <Field label="Margin" hint="Based on cost price">
                <Input value={`${margin}%`} readOnly disabled className="tabular-nums" />
              </Field>
            </div>

            {mrp > 0 && price > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-ink-50 px-4 py-3 text-sm dark:bg-ink-800/60">
                <span className="font-semibold text-ink-900 dark:text-ink-100">
                  {formatCurrency(price)}
                </span>
                {mrp > price && (
                  <>
                    <span className="text-ink-400 line-through">{formatCurrency(mrp)}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      {discount}% OFF
                    </span>
                  </>
                )}
                <span className="ml-auto text-xs text-ink-500 dark:text-ink-400">
                  Customer pays {formatCurrency(price)} incl. {watch('taxRate')}% GST
                </span>
              </div>
            )}
          </Section>

          <Section
            id="inventory"
            title="Inventory"
            description="Stock is derived from variants when they exist."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Barcode" htmlFor="barcode">
                <Input id="barcode" placeholder="8901234567890" className="font-mono" {...register('barcode')} />
              </Field>
              <Field
                label="Stock Quantity"
                htmlFor="stock"
                error={errors.stock?.message}
                hint={variants.length ? 'Managed by variants' : undefined}
              >
                <Input
                  id="stock"
                  type="number"
                  min={0}
                  className="tabular-nums"
                  disabled={variants.length > 0}
                  value={
                    variants.length
                      ? variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0)
                      : undefined
                  }
                  {...(variants.length ? {} : register('stock'))}
                />
              </Field>
            </div>

            <Field
              label="Low Stock Threshold"
              htmlFor="lowStockThreshold"
              error={errors.lowStockThreshold?.message}
              hint="Triggers a low-stock alert on the dashboard."
              className="sm:max-w-xs"
            >
              <Input
                id="lowStockThreshold"
                type="number"
                min={0}
                className="tabular-nums"
                {...register('lowStockThreshold')}
              />
            </Field>

            <div className="space-y-3 rounded-lg border border-ink-200 p-4 dark:border-ink-700">
              <Controller
                control={control}
                name="trackInventory"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onChange={field.onChange}
                    label="Track inventory"
                    description="Reduce stock automatically as orders are placed."
                  />
                )}
              />
              <div className="h-px bg-ink-200 dark:bg-ink-800" />
              <Controller
                control={control}
                name="allowBackorders"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onChange={field.onChange}
                    disabled={!trackInventory}
                    label="Allow backorders"
                    description="Let customers order when stock reaches zero."
                  />
                )}
              />
            </div>
          </Section>

          <Section
            id="variants"
            title="Product variants"
            description="Colour, size and fabric combinations, each with its own SKU and stock."
          >
            <VariantEditor
              variants={variants}
              onChange={setVariants}
              baseSku={watch('sku')}
              basePrice={price}
            />
          </Section>

          <Section
            id="images"
            title="Product images"
            description="The first image is the main image shown on listing pages."
          >
            {/* `id` is only set when editing, which is exactly when uploads can
                be filed under the product they belong to. */}
            <ImageManager images={images} onChange={setImages} productId={isEdit ? id : undefined} />
          </Section>

          <Section id="details" title="Product details" description="Attributes shown in the specification table.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fabric" htmlFor="fabric">
                <Select id="fabric" placeholder="Select fabric" {...register('fabric')}>
                  {FABRICS.map((fabric) => (
                    <option key={fabric} value={fabric}>
                      {fabric}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pattern" htmlFor="pattern">
                <Select id="pattern" placeholder="Select pattern" {...register('pattern')}>
                  {PATTERNS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Occasion" htmlFor="occasion">
                <Select id="occasion" placeholder="Select occasion" {...register('occasion')}>
                  {OCCASIONS.map((occasion) => (
                    <option key={occasion} value={occasion}>
                      {occasion}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fit" htmlFor="fit">
                <Select id="fit" placeholder="Select fit" {...register('fit')}>
                  {FITS.map((fit) => (
                    <option key={fit} value={fit}>
                      {fit}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Care Instructions" htmlFor="careInstructions">
              <Textarea
                id="careInstructions"
                rows={2}
                placeholder="Dry clean only. Do not bleach. Iron on reverse at low heat."
                {...register('careInstructions')}
              />
            </Field>

            <Field label="Country of Origin" htmlFor="countryOfOrigin" className="sm:max-w-xs">
              <Input id="countryOfOrigin" {...register('countryOfOrigin')} />
            </Field>
          </Section>

          <Section
            id="seo"
            title="Search engine listing"
            description="How this product appears on Google and when its link is shared. Everything here is optional — blank fields fall back to the product's own name, description and first image."
          >
            <SeoFields
              value={seo}
              onChange={(patch) => setSeo((current) => ({ ...current, ...patch }))}
              previewUrl={`${seoSettings?.siteUrl ?? 'https://sopii.com'}/product/${
                seo.slug || slug || slugify(name || 'product-name')
              }`}
              siteName={seoSettings?.siteName}
              fallbackTitle={name || 'Product title'}
              fallbackDescription={watch('shortDescription') || watch('description') || ''}
              showSlug={false}
              jsonError={validateJsonLd(seo.structuredData)}
            />
          </Section>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Publishing" />
            <CardBody className="space-y-4">
              <Field label="Status" htmlFor="status">
                <Select
                  id="status"
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'published', label: 'Published' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                  {...register('status')}
                />
              </Field>

              <Controller
                control={control}
                name="featured"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onChange={field.onChange}
                    label="Featured product"
                    description="Highlight on the homepage and collection pages."
                  />
                )}
              />

              {isDirty && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-2xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  You have unsaved changes.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Collections" description="Feature this piece in curated edits." />
            <CardBody className="space-y-2">
              {(collections ?? []).map((collection) => (
                <Checkbox
                  key={collection.id}
                  label={collection.name}
                  checked={collectionIds.includes(collection.id)}
                  onChange={() =>
                    setCollectionIds((current) =>
                      current.includes(collection.id)
                        ? current.filter((value) => value !== collection.id)
                        : [...current, collection.id],
                    )
                  }
                />
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tags" description="Used for filtering and search." />
            <CardBody className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add a tag…"
                />
                <Button variant="secondary" onClick={addTag} icon={<Tag className="h-3.5 w-3.5" />}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-1 text-2xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-300"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((item) => item !== tag))}
                        aria-label={`Remove tag ${tag}`}
                        className="rounded-full p-0.5 hover:bg-ink-200 dark:hover:bg-ink-700"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-2 text-sm">
              {[
                ['Images', images.length],
                ['Variants', variants.length],
                ['Collections', collectionIds.length],
                ['Tags', tags.length],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-ink-500 dark:text-ink-400">{label}</span>
                  <span className="font-medium tabular-nums text-ink-900 dark:text-ink-100">
                    {value}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </form>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-900/95 lg:pl-64">
        <div className={cn('mx-auto flex max-w-[100rem] flex-wrap items-center justify-end gap-2')}>
          <p className="mr-auto hidden text-xs text-ink-500 dark:text-ink-400 sm:block">
            {isEdit ? `Editing ${product?.name}` : 'New product'}
            {Object.keys(errors).length > 0 && (
              <span className="ml-2 text-rose-600 dark:text-rose-400">
                {Object.keys(errors).length} field(s) need attention
              </span>
            )}
          </p>
          <Button variant="ghost" onClick={() => navigate(-1)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" loading={saving} onClick={() => submit('draft')}>
            Save Draft
          </Button>
          <Button variant="primary" loading={saving} onClick={() => submit('published')}>
            {isEdit ? 'Save & Publish' : 'Publish'}
          </Button>
        </div>
      </div>

      <ImagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        images={images.map((image) => ({
          id: image.id,
          url: image.url,
          name: name || 'Product image',
          meta: [
            { label: 'Price', value: formatCurrency(price) },
            { label: 'SKU', value: watch('sku') || '—' },
          ],
        }))}
      />
    </div>
  );
}
