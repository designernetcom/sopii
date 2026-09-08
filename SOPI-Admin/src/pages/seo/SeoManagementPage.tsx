import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Field, Input, Select, Switch, Textarea } from '@/components/common/Field';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/States';
import { SearchInput } from '@/components/common/SearchInput';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { FormModal } from '@/components/modals/FormModal';
import { useToast } from '@/components/common/Toast';
import { useDocumentTitle, usePermissions } from '@/hooks';
import { cn } from '@/utils/cn';
import { errorMessage } from '@/store/api/baseQuery';
import type { SeoMeta, SeoPage, SeoPageType, SeoSettings } from '@/types';
import { SeoFields, validateJsonLd } from '@/components/seo/SeoFields';
import {
  useCreateSeoPageMutation,
  useDeleteSeoPageMutation,
  useGetSeoCatalogQuery,
  useGetSeoPagesQuery,
  useGetSeoSettingsQuery,
  useUpdateSeoCatalogMutation,
  useUpdateSeoPageMutation,
  useUpdateSeoSettingsMutation,
  type SeoCatalogKind,
} from '@/store/api/seoApi';

/**
 * SEO Management.
 *
 * The panel's single view of what every page tells a search engine. Six tabs,
 * split by where the metadata actually lives:
 *
 *   Settings                     the site-wide defaults everything inherits
 *   Homepage / Static / Blog     rows in `seo_pages`, edited here
 *   Products / Categories /
 *   Collections                  metadata on the record, edited here too —
 *                                the same field set, saved back to the record
 *
 * That split is why no page can end up with two competing titles: each route's
 * metadata has exactly one home, and this screen is a view onto it rather than
 * a second copy of it.
 */

type TabKey =
  | 'settings'
  | 'home'
  | 'products'
  | 'categories'
  | 'collections'
  | 'static'
  | 'blog';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'settings', label: 'Settings' },
  { key: 'home', label: 'Homepage' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'collections', label: 'Collections' },
  { key: 'static', label: 'Static Pages' },
  { key: 'blog', label: 'Blog' },
];

/** Which tabs read `seo_pages`, and which page type they filter to. */
const PAGE_TAB_TYPES: Partial<Record<TabKey, SeoPageType[]>> = {
  home: ['home', 'system'],
  static: ['static'],
  blog: ['blog'],
};

const CATALOG_TABS: Partial<Record<TabKey, SeoCatalogKind>> = {
  products: 'products',
  categories: 'categories',
  collections: 'collections',
};

/* -------------------------------- shared bits ------------------------------- */

/** The at-a-glance health of one row, so gaps are visible without opening it. */
function MetaStatus({ seo }: { seo: SeoMeta }) {
  const hasTitle = Boolean(seo.title?.trim());
  const hasDescription = Boolean(seo.metaDescription?.trim());
  const noindex = seo.robotsIndex === false;

  if (noindex) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-2xs text-ink-600 dark:bg-ink-800 dark:text-ink-400">
        Hidden from search
      </span>
    );
  }

  if (hasTitle && hasDescription) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-2xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Check className="h-3 w-3" aria-hidden />
        Complete
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-2xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {!hasTitle && !hasDescription
        ? 'No title or description'
        : !hasTitle
          ? 'No title'
          : 'No description'}
    </span>
  );
}

interface RowItem {
  id: string;
  label: string;
  path: string;
  seo: SeoMeta;
  system?: boolean;
}

/** The list on the left of every tab except Settings. */
function RowList({
  rows,
  activeId,
  onSelect,
  search,
  onSearch,
  emptyLabel,
}: {
  rows: RowItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={onSearch} placeholder="Filter by name or path…" />

      {rows.length === 0 ? (
        <EmptyState icon={Search} title={emptyLabel} />
      ) : (
        <ul className="max-h-[32rem] space-y-1 overflow-y-auto pr-1">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={activeId === row.id}
                className={cn(
                  'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                  activeId === row.id
                    ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                    : 'border-transparent hover:bg-ink-50 dark:hover:bg-ink-800/60',
                )}
              >
                <span className="block truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {row.label}
                </span>
                <span className="mt-0.5 block truncate text-2xs text-ink-500 dark:text-ink-400">
                  {row.path}
                </span>
                <span className="mt-1.5 block">
                  <MetaStatus seo={row.seo} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------- settings -------------------------------- */

function SettingsTab({ settings }: { settings: SeoSettings }) {
  const toast = useToast();
  const { can } = usePermissions();
  const canEdit = can('seo', 'edit');
  const [save, { isLoading }] = useUpdateSeoSettingsMutation();
  const [draft, setDraft] = useState<SeoSettings>(settings);

  useEffect(() => setDraft(settings), [settings]);

  const set = (patch: Partial<SeoSettings>) => setDraft((current) => ({ ...current, ...patch }));
  const setOrg = (patch: Partial<SeoSettings['organization']>) =>
    setDraft((current) => ({ ...current, organization: { ...current.organization, ...patch } }));
  const setSitemap = (patch: Partial<SeoSettings['sitemap']>) =>
    setDraft((current) => ({ ...current, sitemap: { ...current.sitemap, ...patch } }));
  const setVerification = (patch: Partial<SeoSettings['verification']>) =>
    setDraft((current) => ({ ...current, verification: { ...current.verification, ...patch } }));

  const submit = async () => {
    try {
      await save(draft).unwrap();
      toast.success('SEO settings saved.', 'The storefront picks these up on its next load.');
    } catch (error) {
      toast.error('Could not save SEO settings', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Site identity"
          description="The defaults every page inherits when it has nothing of its own."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Site URL"
              htmlFor="siteUrl"
              required
              hint="Every canonical URL and sitemap entry is built from this. No trailing slash."
            >
              <Input
                id="siteUrl"
                value={draft.siteUrl}
                onChange={(event) => set({ siteUrl: event.target.value })}
                placeholder="https://sopii.com"
              />
            </Field>

            <Field label="Site Name" htmlFor="siteName">
              <Input
                id="siteName"
                value={draft.siteName}
                onChange={(event) => set({ siteName: event.target.value })}
              />
            </Field>
          </div>

          <Field
            label="Title Template"
            htmlFor="titleTemplate"
            hint="%s is replaced by the page's own title. A page whose title already ends with the brand is left alone, so it never doubles up."
          >
            <Input
              id="titleTemplate"
              value={draft.titleTemplate}
              onChange={(event) => set({ titleTemplate: event.target.value })}
              placeholder="%s | SOPII"
            />
          </Field>

          <Field
            label="Default Title"
            htmlFor="defaultTitle"
            hint="Used by the homepage and by any page with no title of its own."
          >
            <Input
              id="defaultTitle"
              value={draft.defaultTitle}
              onChange={(event) => set({ defaultTitle: event.target.value })}
            />
          </Field>

          <Field label="Default Meta Description" htmlFor="defaultMetaDescription">
            <Textarea
              id="defaultMetaDescription"
              rows={2}
              value={draft.defaultMetaDescription}
              onChange={(event) => set({ defaultMetaDescription: event.target.value })}
            />
          </Field>

          <Field
            label="Default Share Image"
            htmlFor="defaultOgImage"
            hint="Shown when a shared page has no image of its own. 1200 × 630."
          >
            <Input
              id="defaultOgImage"
              value={draft.defaultOgImage}
              onChange={(event) => set({ defaultOgImage: event.target.value })}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Social accounts" description="Attribution on shared links." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Twitter Card Type" htmlFor="twitterCardType">
            <Select
              id="twitterCardType"
              value={draft.twitterCardType}
              onChange={(event) =>
                set({ twitterCardType: event.target.value as SeoSettings['twitterCardType'] })
              }
              options={[
                { value: 'summary_large_image', label: 'Large image' },
                { value: 'summary', label: 'Summary' },
              ]}
            />
          </Field>
          <Field label="Twitter Site" htmlFor="twitterSite">
            <Input
              id="twitterSite"
              value={draft.twitterSite ?? ''}
              onChange={(event) => set({ twitterSite: event.target.value })}
              placeholder="@sopii"
            />
          </Field>
          <Field label="Twitter Creator" htmlFor="twitterCreator">
            <Input
              id="twitterCreator"
              value={draft.twitterCreator ?? ''}
              onChange={(event) => set({ twitterCreator: event.target.value })}
              placeholder="@sopii"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Organisation"
          description="Published as Organization structured data on every page — this is what can earn a knowledge panel."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="orgName">
              <Input
                id="orgName"
                value={draft.organization.name ?? ''}
                onChange={(event) => setOrg({ name: event.target.value })}
              />
            </Field>
            <Field label="Legal Name" htmlFor="orgLegal">
              <Input
                id="orgLegal"
                value={draft.organization.legalName ?? ''}
                onChange={(event) => setOrg({ legalName: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Logo" htmlFor="orgLogo">
            <Input
              id="orgLogo"
              value={draft.organization.logo ?? ''}
              onChange={(event) => setOrg({ logo: event.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Support Email" htmlFor="orgEmail">
              <Input
                id="orgEmail"
                type="email"
                value={draft.organization.email ?? ''}
                onChange={(event) => setOrg({ email: event.target.value })}
              />
            </Field>
            <Field label="Support Phone" htmlFor="orgPhone">
              <Input
                id="orgPhone"
                value={draft.organization.phone ?? ''}
                onChange={(event) => setOrg({ phone: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Street" htmlFor="orgStreet">
              <Input
                id="orgStreet"
                value={draft.organization.streetAddress ?? ''}
                onChange={(event) => setOrg({ streetAddress: event.target.value })}
              />
            </Field>
            <Field label="City" htmlFor="orgCity">
              <Input
                id="orgCity"
                value={draft.organization.locality ?? ''}
                onChange={(event) => setOrg({ locality: event.target.value })}
              />
            </Field>
            <Field label="State" htmlFor="orgRegion">
              <Input
                id="orgRegion"
                value={draft.organization.region ?? ''}
                onChange={(event) => setOrg({ region: event.target.value })}
              />
            </Field>
            <Field label="Postcode" htmlFor="orgPostcode">
              <Input
                id="orgPostcode"
                value={draft.organization.postalCode ?? ''}
                onChange={(event) => setOrg({ postalCode: event.target.value })}
              />
            </Field>
          </div>

          <Field
            label="Social Profiles"
            htmlFor="orgSameAs"
            hint="One URL per line. Published as schema.org sameAs, which is how a search engine links the site to its social accounts."
          >
            <Textarea
              id="orgSameAs"
              rows={3}
              value={(draft.organization.sameAs ?? []).join('\n')}
              onChange={(event) =>
                setOrg({
                  sameAs: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
              placeholder={'https://instagram.com/sopii\nhttps://facebook.com/sopii'}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Crawling & sitemap"
          description="What robots.txt says and which URLs reach /sitemap.xml."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Switch
              label="Allow indexing site-wide"
              description="Off puts Disallow: / in robots.txt — the whole site drops out of search. Use only for a staging site."
              checked={draft.robotsIndex}
              onChange={(checked) => set({ robotsIndex: checked })}
            />
            <Switch
              label="Follow links site-wide"
              checked={draft.robotsFollow}
              onChange={(checked) => set({ robotsFollow: checked })}
            />
          </div>

          {!draft.robotsIndex ? (
            <p className="flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Indexing is switched off for the entire site. Every page will be excluded from
                search results, whatever its own setting says.
              </span>
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Switch
              label="Publish sitemap.xml"
              checked={draft.sitemap.enabled}
              onChange={(checked) => setSitemap({ enabled: checked })}
            />
            <Switch
              label="Include products"
              checked={draft.sitemap.includeProducts}
              onChange={(checked) => setSitemap({ includeProducts: checked })}
            />
            <Switch
              label="Include categories"
              checked={draft.sitemap.includeCategories}
              onChange={(checked) => setSitemap({ includeCategories: checked })}
            />
            <Switch
              label="Include collections"
              checked={draft.sitemap.includeCollections}
              onChange={(checked) => setSitemap({ includeCollections: checked })}
            />
            <Switch
              label="Include static pages"
              checked={draft.sitemap.includeStaticPages}
              onChange={(checked) => setSitemap({ includeStaticPages: checked })}
            />
          </div>

          <Field
            label="Excluded Paths"
            htmlFor="excludePaths"
            hint="One path per line. These are kept out of the sitemap and disallowed in robots.txt — cart, checkout and account pages belong here."
          >
            <Textarea
              id="excludePaths"
              rows={4}
              className="font-mono text-xs"
              value={(draft.sitemap.excludePaths ?? []).join('\n')}
              onChange={(event) =>
                setSitemap({
                  excludePaths: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>

          <Field
            label="Extra robots.txt rules"
            htmlFor="robotsExtra"
            hint="Appended verbatim, after the generated rules."
          >
            <Textarea
              id="robotsExtra"
              rows={3}
              className="font-mono text-xs"
              value={draft.robotsTxtExtra ?? ''}
              onChange={(event) => set({ robotsTxtExtra: event.target.value })}
            />
          </Field>

          <p className="flex flex-wrap items-center gap-3 text-xs text-ink-500 dark:text-ink-400">
            <a
              href={`${draft.siteUrl}/sitemap.xml`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              View sitemap.xml
            </a>
            <a
              href={`${draft.siteUrl}/robots.txt`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              View robots.txt
            </a>
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Search console verification"
          description="Ownership tokens, rendered as meta tags in the site's head."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Google" htmlFor="verifyGoogle">
            <Input
              id="verifyGoogle"
              value={draft.verification.google ?? ''}
              onChange={(event) => setVerification({ google: event.target.value })}
            />
          </Field>
          <Field label="Bing" htmlFor="verifyBing">
            <Input
              id="verifyBing"
              value={draft.verification.bing ?? ''}
              onChange={(event) => setVerification({ bing: event.target.value })}
            />
          </Field>
          <Field label="Pinterest" htmlFor="verifyPinterest">
            <Input
              id="verifyPinterest"
              value={draft.verification.pinterest ?? ''}
              onChange={(event) => setVerification({ pinterest: event.target.value })}
            />
          </Field>
          <Field label="Facebook" htmlFor="verifyFacebook">
            <Input
              id="verifyFacebook"
              value={draft.verification.facebook ?? ''}
              onChange={(event) => setVerification({ facebook: event.target.value })}
            />
          </Field>
        </CardBody>
      </Card>

      {canEdit ? (
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-ink-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
          <Button variant="primary" loading={isLoading} onClick={submit}>
            Save settings
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------- pages tab ------------------------------- */

function PagesTab({
  pageTypes,
  tabKey,
  settings,
}: {
  pageTypes: SeoPageType[];
  tabKey: TabKey;
  settings: SeoSettings;
}) {
  const toast = useToast();
  const { can } = usePermissions();
  const canEdit = can('seo', 'edit');
  const canCreate = can('seo', 'create');
  const canDelete = can('seo', 'delete');

  const { data: pages = [], isLoading, isError, refetch } = useGetSeoPagesQuery();
  const [updatePage, { isLoading: saving }] = useUpdateSeoPageMutation();
  const [createPage, { isLoading: creating }] = useCreateSeoPageMutation();
  const [deletePage] = useDeleteSeoPageMutation();

  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeoMeta>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newPage, setNewPage] = useState({ label: '', path: '' });
  const [confirmDelete, setConfirmDelete] = useState<SeoPage | null>(null);

  const scoped = useMemo(
    () => pages.filter((page) => pageTypes.includes(page.pageType)),
    [pages, pageTypes],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return scoped;
    return scoped.filter(
      (page) =>
        page.label.toLowerCase().includes(term) || page.path.toLowerCase().includes(term),
    );
  }, [scoped, search]);

  const active = useMemo(
    () => scoped.find((page) => page.id === activeId) ?? null,
    [scoped, activeId],
  );

  /* Selecting a row loads it into the draft. Keyed on the row's id so an
     edit in progress is not clobbered by a background refetch. */
  useEffect(() => {
    if (!activeId && filtered.length) setActiveId(filtered[0].id);
  }, [activeId, filtered]);

  useEffect(() => {
    if (!active) return;
    const { id, pageType, label, path, refId, system, createdAt, updatedAt, ...meta } = active;
    void id;
    void pageType;
    void label;
    void path;
    void refId;
    void system;
    void createdAt;
    void updatedAt;
    setDraft(meta);
  }, [active]);

  const jsonError = validateJsonLd(draft.structuredData);

  const submit = async () => {
    if (!active) return;
    if (jsonError) {
      toast.error('Fix the structured data first', jsonError);
      return;
    }
    try {
      await updatePage({ id: active.id, body: draft }).unwrap();
      toast.success('Saved.', `${active.label} metadata updated.`);
    } catch (error) {
      toast.error('Could not save', errorMessage(error));
    }
  };

  const addPage = async () => {
    try {
      const created = await createPage({
        pageType: tabKey === 'blog' ? 'blog' : 'static',
        label: newPage.label,
        path: newPage.path,
      }).unwrap();
      setAddOpen(false);
      setNewPage({ label: '', path: '' });
      setActiveId(created.id);
      toast.success('Page added.', created.path);
    } catch (error) {
      toast.error('Could not add the page', errorMessage(error));
    }
  };

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const rows: RowItem[] = filtered.map((page) => ({
    id: page.id,
    label: page.label,
    path: page.path,
    seo: page,
    system: page.system,
  }));

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <Card>
        <CardHeader
          title={`${scoped.length} page${scoped.length === 1 ? '' : 's'}`}
          action={
            canCreate && (tabKey === 'static' || tabKey === 'blog') ? (
              <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Add
              </Button>
            ) : undefined
          }
          compact
        />
        <CardBody>
          <RowList
            rows={rows}
            activeId={activeId}
            onSelect={setActiveId}
            search={search}
            onSearch={setSearch}
            emptyLabel="No pages match that filter."
          />
        </CardBody>
      </Card>

      {active ? (
        <Card>
          <CardHeader
            title={active.label}
            description={active.path}
            action={
              canDelete && !active.system ? (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(active)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <SeoFields
              value={draft}
              onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              previewUrl={`${settings.siteUrl}${active.path === '/' ? '' : active.path}`}
              siteName={settings.siteName}
              fallbackTitle={settings.defaultTitle}
              fallbackDescription={settings.defaultMetaDescription}
              showSlug={false}
              jsonError={jsonError}
            />
          </CardBody>
          {canEdit ? (
            <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3 dark:border-ink-700">
              <Button variant="primary" loading={saving} onClick={submit}>
                Save changes
              </Button>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              icon={FileText}
              title="Select a page"
              description="Pick a page on the left to edit how it appears in search results."
            />
          </CardBody>
        </Card>
      )}

      <FormModal
        open={addOpen}
        title={tabKey === 'blog' ? 'Add a blog page' : 'Add a static page'}
        onClose={() => setAddOpen(false)}
        onSubmit={addPage}
        submitLabel="Add page"
        loading={creating}
      >
        <div className="space-y-4">
          <Field label="Label" htmlFor="newLabel" required hint="Shown in this list only.">
            <Input
              id="newLabel"
              value={newPage.label}
              onChange={(event) => setNewPage((c) => ({ ...c, label: event.target.value }))}
              placeholder="Care Guide"
            />
          </Field>
          <Field
            label="Path"
            htmlFor="newPath"
            required
            hint="The route on the shop front, starting with a slash."
          >
            <Input
              id="newPath"
              value={newPage.path}
              onChange={(event) => setNewPage((c) => ({ ...c, path: event.target.value }))}
              placeholder={tabKey === 'blog' ? '/blog/how-to-drape' : '/pages/care-guide'}
            />
          </Field>
        </div>
      </FormModal>

      <ConfirmModal
        open={Boolean(confirmDelete)}
        title="Delete this SEO record?"
        description={`${confirmDelete?.path} will fall back to the site defaults. The page itself is not affected.`}
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await deletePage(confirmDelete.id).unwrap();
            if (activeId === confirmDelete.id) setActiveId(null);
            toast.success('Deleted.', confirmDelete.path);
          } catch (error) {
            toast.error('Could not delete', errorMessage(error));
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}

/* -------------------------------- catalogue tab ----------------------------- */

function CatalogTab({ kind, settings }: { kind: SeoCatalogKind; settings: SeoSettings }) {
  const toast = useToast();
  const { can } = usePermissions();
  const canEdit = can('seo', 'edit');

  const { data: rows = [], isLoading, isError, refetch } = useGetSeoCatalogQuery(kind);
  const [save, { isLoading: saving }] = useUpdateSeoCatalogMutation();

  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeoMeta>({});

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (row) => row.label.toLowerCase().includes(term) || row.path.toLowerCase().includes(term),
    );
  }, [rows, search]);

  const active = useMemo(() => rows.find((row) => row.id === activeId) ?? null, [rows, activeId]);

  useEffect(() => {
    if (!activeId && filtered.length) setActiveId(filtered[0].id);
  }, [activeId, filtered]);

  useEffect(() => {
    if (active) setDraft(active.seo ?? {});
  }, [active]);

  const jsonError = validateJsonLd(draft.structuredData);

  const submit = async () => {
    if (!active) return;
    if (jsonError) {
      toast.error('Fix the structured data first', jsonError);
      return;
    }
    try {
      await save({ kind, id: active.id, body: draft }).unwrap();
      toast.success('Saved.', `${active.label} metadata updated.`);
    } catch (error) {
      toast.error('Could not save', errorMessage(error));
    }
  };

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const missing = rows.filter(
    (row) => !row.seo?.title?.trim() || !row.seo?.metaDescription?.trim(),
  ).length;

  return (
    <div className="space-y-4">
      {missing > 0 ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {missing} of {rows.length} still have no title or description of their own. Those pages
            fall back to the record's name and description, which is workable but rarely the best
            thing a searcher could read.
          </span>
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardHeader title={`${rows.length} record${rows.length === 1 ? '' : 's'}`} compact />
          <CardBody>
            <RowList
              rows={filtered.map((row) => ({
                id: row.id,
                label: row.label,
                path: row.path,
                seo: row.seo ?? {},
              }))}
              activeId={activeId}
              onSelect={setActiveId}
              search={search}
              onSearch={setSearch}
              emptyLabel="Nothing matches that filter."
            />
          </CardBody>
        </Card>

        {active ? (
          <Card>
            <CardHeader title={active.label} description={active.path} />
            <CardBody>
              <SeoFields
                value={draft}
                onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                previewUrl={`${settings.siteUrl}${active.path}`}
                siteName={settings.siteName}
                fallbackTitle={active.label}
                fallbackDescription={settings.defaultMetaDescription}
                slugHint="Changing this changes the page's address. Existing links to the old one will break unless you add a redirect."
                jsonError={jsonError}
              />
            </CardBody>
            {canEdit ? (
              <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3 dark:border-ink-700">
                <Button variant="primary" loading={saving} onClick={submit}>
                  Save changes
                </Button>
              </div>
            ) : null}
          </Card>
        ) : (
          <Card>
            <CardBody>
              <EmptyState
                icon={Globe}
                title="Select a record"
                description="Its metadata is saved on the record itself, so the same values appear on its edit screen."
              />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------- page ----------------------------------- */

export default function SeoManagementPage() {
  useDocumentTitle('SEO Management');

  const [tab, setTab] = useState<TabKey>('settings');
  const { data: settings, isLoading, isError, refetch } = useGetSeoSettingsQuery();

  if (isLoading) return <PageLoader />;
  if (isError || !settings) return <ErrorState onRetry={refetch} />;

  const pageTypes = PAGE_TAB_TYPES[tab];
  const catalogKind = CATALOG_TABS[tab];

  return (
    <div className="space-y-5">
      <PageHeader
        title="SEO Management"
        description="Titles, descriptions, social cards and structured data for every page on the shop front. Changes appear on the live site without a deploy."
      />

      <Tabs items={TABS} active={tab} onChange={(key) => setTab(key as TabKey)} />

      {tab === 'settings' ? <SettingsTab settings={settings} /> : null}

      {pageTypes ? (
        <PagesTab key={tab} tabKey={tab} pageTypes={pageTypes} settings={settings} />
      ) : null}

      {catalogKind ? <CatalogTab key={tab} kind={catalogKind} settings={settings} /> : null}
    </div>
  );
}
