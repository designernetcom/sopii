import { useState } from 'react';
import { GripVertical, Info, PanelBottom, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useDragReorder, usePermissions } from '@/hooks';
import {
  useCreateFooterSectionMutation,
  useDeleteFooterSectionMutation,
  useGetFooterQuery,
  useReorderFooterSectionsMutation,
  useResetFooterMutation,
  useUpdateFooterSectionMutation,
} from '@/store/api/footerApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardHeader } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Switch } from '@/components/common/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { ConfirmModal, DeleteModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { FOOTER_TYPES } from '@/data/footer';
import type { FooterSection, FooterSectionType } from '@/types';
import { FooterSectionModal, type FooterSectionBody } from './FooterSectionModal';
import { SECTION_ICONS } from './sectionIcons';

type Area = 'columns' | 'bottom';

/** Bottom-bar types that share one row when they follow each other — as the shop renders them. */
const BAR_TYPES = new Set<FooterSectionType>(['utility', 'copyright', 'payments']);

const AREAS: { key: Area; title: string; description: string }[] = [
  {
    key: 'columns',
    title: 'Columns',
    description:
      'Across the top of the footer, left to right. On phones they stack, and link columns collapse.',
  },
  {
    key: 'bottom',
    title: 'Bottom bar',
    description:
      'Under the columns, top to bottom. Quick links, copyright and payment badges share a row when they are next to each other.',
  },
];

const areaOf = (section: FooterSection): Area => FOOTER_TYPES[section.type].area;

/** One line describing what a section holds, for the list row. */
function summarise(section: FooterSection): string {
  const rule = FOOTER_TYPES[section.type];
  if (rule.items !== 'none') {
    const nouns = { link: 'link', social: 'channel', badge: 'badge' }[rule.items];
    const total = section.items.length;
    const shown = section.items.filter((item) => item.enabled).length;
    const noun = `${nouns}${total === 1 ? '' : 's'}`;
    const base = shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun} shown`;
    return section.type === 'credit' && section.content ? `${section.content} · ${base}` : base;
  }
  return section.content.replace(/\s+/g, ' ').trim() || rule.description;
}

export default function FooterPage() {
  useDocumentTitle('Footer');
  const toast = useToast();
  const { can } = usePermissions();

  const { data, isLoading, isError, refetch } = useGetFooterQuery();
  const [createSection, { isLoading: creating }] = useCreateFooterSectionMutation();
  const [updateSection, { isLoading: updating }] = useUpdateFooterSectionMutation();
  const [deleteSection, { isLoading: deleting }] = useDeleteFooterSectionMutation();
  const [reorderSections] = useReorderFooterSectionsMutation();
  const [resetFooter, { isLoading: resetting }] = useResetFooterMutation();

  const [editing, setEditing] = useState<FooterSection | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FooterSection | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const sections = data?.sections ?? [];
  const canEdit = can('homepage', 'edit');

  /*
   * Each area reorders on its own, but the API stores one list. The new order
   * of this area is written back into the slots its sections already occupy,
   * so the other area's positions do not move.
   */
  const reorderArea = async (area: Area, next: FooterSection[]) => {
    const queue = [...next];
    const ids = sections.map((section) =>
      areaOf(section) === area ? queue.shift()!.id : section.id,
    );
    try {
      await reorderSections(ids).unwrap();
      toast.success('Footer order updated');
    } catch (error) {
      toast.error('Could not reorder the footer', errorMessage(error));
    }
  };

  const toggle = async (section: FooterSection) => {
    try {
      await updateSection({ id: section.id, body: { enabled: !section.enabled } }).unwrap();
      toast.success(section.enabled ? 'Section hidden' : 'Section shown', section.title);
    } catch (error) {
      toast.error('Could not update the section', errorMessage(error));
    }
  };

  const save = async (body: FooterSectionBody) => {
    try {
      if (editing) {
        // The type is fixed once created; the API refuses a change anyway.
        const { type: _type, ...patch } = body;
        void _type;
        await updateSection({ id: editing.id, body: patch }).unwrap();
        toast.success('Footer section updated', body.title);
        setEditing(null);
      } else {
        await createSection(body).unwrap();
        toast.success('Footer section added', body.title || FOOTER_TYPES[body.type].label);
        setAdding(false);
      }
      return true;
    } catch (error) {
      toast.error('Could not save the section', errorMessage(error));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSection(deleteTarget.id).unwrap();
      toast.success('Footer section deleted', deleteTarget.title);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete the section', errorMessage(error));
    }
  };

  const handleReset = async () => {
    try {
      await resetFooter().unwrap();
      toast.success('Default footer restored');
      setConfirmReset(false);
    } catch (error) {
      toast.error('Could not restore the default footer', errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Footer"
        description="Everything in the storefront footer — columns, links, social channels and the small print. Saved changes reach the shop the next time it checks for updates, within a couple of minutes."
        actions={
          <>
            {canEdit && data?.updatedAt && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => setConfirmReset(true)}
              >
                Restore defaults
              </Button>
            )}
            {can('homepage', 'create') && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setAdding(true)}
                disabled={isLoading || isError}
              >
                Add section
              </Button>
            )}
          </>
        }
      />

      {isError ? (
        <Card>
          <ErrorState onRetry={refetch} />
        </Card>
      ) : (
        <>
          {data && data.updatedAt === null && (
            <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <p>
                This is the built-in footer the shop has always shown. It is saved as your own the
                first time you change anything here.
              </p>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
            <div className="space-y-5">
              {AREAS.map((area) => (
                <AreaCard
                  key={area.key}
                  title={area.title}
                  description={area.description}
                  loading={isLoading}
                  sections={sections.filter((section) => areaOf(section) === area.key)}
                  canEdit={canEdit}
                  canDelete={can('homepage', 'delete')}
                  onReorder={(next) => reorderArea(area.key, next)}
                  onToggle={toggle}
                  onEdit={setEditing}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>

            <div className="xl:sticky xl:top-20">
              <FooterPreview sections={sections} loading={isLoading} />
            </div>
          </div>
        </>
      )}

      <FooterSectionModal
        open={adding || editing !== null}
        section={editing}
        existingTypes={sections.map((section) => section.type)}
        saving={creating || updating}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSubmit={save}
      />

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="footer section"
        name={deleteTarget?.title}
        loading={deleting}
      />

      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
        tone="warning"
        loading={resetting}
        title="Restore the default footer?"
        description="Every section, link and setting on this page goes back to the built-in footer. Your changes are discarded."
        confirmLabel={resetting ? 'Restoring…' : 'Restore defaults'}
      />
    </div>
  );
}

/* ---------------------------------- areas ---------------------------------- */

interface AreaCardProps {
  title: string;
  description: string;
  loading: boolean;
  sections: FooterSection[];
  canEdit: boolean;
  canDelete: boolean;
  onReorder: (next: FooterSection[]) => void;
  onToggle: (section: FooterSection) => void;
  onEdit: (section: FooterSection) => void;
  onDelete: (section: FooterSection) => void;
}

function AreaCard({
  title,
  description,
  loading,
  sections,
  canEdit,
  canDelete,
  onReorder,
  onToggle,
  onEdit,
  onDelete,
}: AreaCardProps) {
  const { handlers, move, overIndex } = useDragReorder(sections, onReorder);

  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={description} compact />

      {loading ? (
        <div className="divide-y divide-ink-200 dark:divide-ink-800">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-4">
              <Skeleton className="h-8 w-8 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-9 shrink-0" />
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <EmptyState
          icon={PanelBottom}
          title="Nothing here"
          description="Use Add section to put something in this part of the footer."
        />
      ) : (
        <ul className="divide-y divide-ink-200 dark:divide-ink-800">
          {sections.map((section, index) => {
            const rule = FOOTER_TYPES[section.type];
            const Icon = SECTION_ICONS[section.type];

            return (
              <li
                key={section.id}
                {...(canEdit ? handlers(index) : {})}
                className={cn(
                  'flex items-center gap-3 p-4 transition-colors',
                  overIndex === index
                    ? 'bg-brand-50 dark:bg-brand-500/10'
                    : 'hover:bg-ink-50 dark:hover:bg-ink-800/40',
                )}
              >
                {canEdit && (
                  <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-ink-300 sm:block" />
                )}
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                    !section.enabled && 'opacity-50',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>

                <div className={cn('min-w-0 flex-1', !section.enabled && 'opacity-60')}>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink-900 dark:text-ink-100">
                    <span className="truncate">{section.title || rule.label}</span>
                    {section.title !== rule.label && (
                      <span className="text-2xs font-normal text-ink-400">{rule.label}</span>
                    )}
                    {!section.enabled && <Badge>Hidden</Badge>}
                  </p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">{summarise(section)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {canEdit && (
                    <>
                      <div className="flex flex-col sm:hidden">
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${section.title} up`}
                          className="px-1 text-2xs text-ink-400 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={index === sections.length - 1}
                          aria-label={`Move ${section.title} down`}
                          className="px-1 text-2xs text-ink-400 disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>
                      <Switch
                        size="sm"
                        checked={section.enabled}
                        onChange={() => onToggle(section)}
                        label={section.enabled ? `Hide ${section.title}` : `Show ${section.title}`}
                      />
                      <IconButton label={`Edit ${section.title}`} size="sm" onClick={() => onEdit(section)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  )}
                  {canDelete && (
                    <IconButton
                      label={`Delete ${section.title}`}
                      size="sm"
                      onClick={() => onDelete(section)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </IconButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* --------------------------------- preview --------------------------------- */

/**
 * A schematic of the storefront footer: visible sections only, placed the way
 * the shop places them. Not a pixel render — its job is to answer "where will
 * this go?" before the admin goes and looks.
 */
function FooterPreview({ sections, loading }: { sections: FooterSection[]; loading: boolean }) {
  const visible = sections.filter((section) => section.enabled);
  const columns = visible.filter((section) => areaOf(section) === 'columns');
  const bottom = visible.filter((section) => areaOf(section) === 'bottom');

  /* Consecutive bar types share one row; everything else is a row of its own. */
  const rows: FooterSection[][] = [];
  bottom.forEach((section) => {
    const last = rows[rows.length - 1];
    if (BAR_TYPES.has(section.type) && last && BAR_TYPES.has(last[0].type)) last.push(section);
    else rows.push([section]);
  });

  const year = new Date().getFullYear();
  const labels = (section: FooterSection) =>
    section.items.filter((item) => item.enabled).map((item) => item.label);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Preview"
        description="Visible sections, arranged as on a desktop screen."
        compact
      />
      {loading ? (
        <div className="p-4">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="p-6 text-center text-xs text-ink-500 dark:text-ink-400">
          Every section is hidden — the storefront footer will be empty.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[520px] bg-[#FBF7F2] text-[#3B2A2A]">
            {columns.length > 0 && (
              <div
                className="grid gap-4 px-4 py-5"
                style={{
                  gridTemplateColumns: columns
                    .map((section) => (section.type === 'brand' ? '1.5fr' : '1fr'))
                    .join(' '),
                }}
              >
                {columns.map((section) => (
                  <div key={section.id} className="min-w-0 space-y-1.5">
                    {section.type === 'brand' ? (
                      <>
                        {section.display?.logo !== false && (
                          <p className="font-serif text-sm font-semibold tracking-wide text-[#7E1F20]">
                            SOPII
                          </p>
                        )}
                        <p className="line-clamp-3 text-[10px] leading-snug opacity-70">{section.content}</p>
                        <p className="text-[10px] opacity-60">
                          {[
                            section.display?.address !== false && 'Address',
                            section.display?.email !== false && 'Email',
                            section.display?.phone !== false && 'Phone',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="truncate text-[9px] font-semibold uppercase tracking-widest text-[#8A6A2F]">
                          {section.title}
                        </p>
                        {section.type === 'text' ? (
                          <p className="line-clamp-4 whitespace-pre-line text-[10px] leading-snug opacity-70">
                            {section.content}
                          </p>
                        ) : (
                          labels(section)
                            .slice(0, 6)
                            .map((label, index) => (
                              <p key={index} className="truncate text-[10px] opacity-70">
                                {label}
                              </p>
                            ))
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {rows.length > 0 && (
              <div className="border-t border-[#E8DFD3] bg-[#F3ECE3]">
                {rows.map((row, index) => (
                  <div
                    key={row[0].id}
                    className={cn(
                      'flex items-center gap-4 px-4 py-2 text-[9px]',
                      row.length > 1 ? 'justify-between' : 'justify-center',
                      index > 0 && 'border-t border-[#E8DFD3]',
                    )}
                  >
                    {row.map((section) => (
                      <span key={section.id} className="min-w-0 truncate opacity-70">
                        {section.type === 'copyright'
                          ? section.content.replace('{year}', String(year)).replace('{store}', 'SOPII')
                          : section.type === 'payments'
                            ? `${section.title}: ${labels(section).join(' · ')}`
                            : section.type === 'credit'
                              ? [section.content, ...labels(section)].filter(Boolean).join(' ')
                              : labels(section).join(' · ')}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
