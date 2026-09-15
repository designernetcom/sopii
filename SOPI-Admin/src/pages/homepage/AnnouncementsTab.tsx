import { useState } from 'react';
import { CalendarDays, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { usePermissions } from '@/hooks';
import {
  useCreateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useGetAnnouncementsQuery,
  useUpdateAnnouncementMutation,
} from '@/store/api/marketingApi';
import { errorMessage } from '@/store/api/baseQuery';
import { Card } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Field, Input, Switch, Textarea } from '@/components/common/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/States';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { formatDate, formatDateTimeInput } from '@/utils/format';
import type { Announcement } from '@/types';

/* Mirrors `server/src/lib/announcements.ts`. The server is the authority; these
   only let the form say so before a round trip. */
const MESSAGE_MAX = 200;
const PRIORITY_MAX = 9999;

interface AnnouncementForm {
  id?: string;
  message: string;
  priority: string;
  isActive: boolean;
  /** `datetime-local` values, in the admin's timezone. */
  startDate: string;
  endDate: string;
}

type Schedule = 'live' | 'hidden' | 'scheduled' | 'ended';

/** Where an announcement stands right now — the same rule the storefront feed applies. */
function scheduleOf(announcement: Announcement, now: number): Schedule {
  if (!announcement.isActive) return 'hidden';
  if (announcement.startDate && Date.parse(announcement.startDate) > now) return 'scheduled';
  if (announcement.endDate && Date.parse(announcement.endDate) <= now) return 'ended';
  return 'live';
}

const SCHEDULE_BADGE: Record<Schedule, { label: string; className: string }> = {
  live: {
    label: 'Live',
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  hidden: { label: 'Hidden', className: '' },
  scheduled: {
    label: 'Scheduled',
    className: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400',
  },
  ended: {
    label: 'Ended',
    className: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400',
  },
};

export function AnnouncementsTab() {
  const toast = useToast();
  const { can } = usePermissions();

  const { data: announcements, isLoading, isError, refetch } = useGetAnnouncementsQuery();
  const [createAnnouncement, { isLoading: creating }] = useCreateAnnouncementMutation();
  const [updateAnnouncement, { isLoading: updating }] = useUpdateAnnouncementMutation();
  const [deleteAnnouncement, { isLoading: deleting }] = useDeleteAnnouncementMutation();

  const [form, setForm] = useState<AnnouncementForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const list = announcements ?? [];
  const now = Date.now();
  const liveCount = list.filter((item) => scheduleOf(item, now) === 'live').length;

  const openCreate = () => {
    setErrors({});
    // New messages go to the end of the strip unless the admin says otherwise.
    const nextPriority = list.reduce((max, item) => Math.max(max, item.priority), 0) + 1;
    setForm({
      message: '',
      priority: String(Math.min(nextPriority, PRIORITY_MAX)),
      isActive: true,
      startDate: '',
      endDate: '',
    });
  };

  const openEdit = (announcement: Announcement) => {
    setErrors({});
    setForm({
      id: announcement.id,
      message: announcement.message,
      priority: String(announcement.priority),
      isActive: announcement.isActive,
      startDate: formatDateTimeInput(announcement.startDate),
      endDate: formatDateTimeInput(announcement.endDate),
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const message = form.message.replace(/\s+/g, ' ').trim();
    const priority = Number(form.priority);

    const next: Record<string, string> = {};
    if (!message) next.message = 'Message is required';
    else if (message.length > MESSAGE_MAX) {
      next.message = `Keep it to ${MESSAGE_MAX} characters or fewer`;
    }
    if (form.priority.trim() === '' || !Number.isInteger(priority) || priority < 0 || priority > PRIORITY_MAX) {
      next.priority = `A whole number from 0 to ${PRIORITY_MAX}`;
    }
    if (form.startDate && form.endDate && new Date(form.endDate) <= new Date(form.startDate)) {
      next.endDate = 'End must be after the start';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload: Partial<Announcement> = {
      message,
      priority,
      isActive: form.isActive,
      /* `null`, not `undefined`: the API drops undefined fields from a patch,
         so clearing a date has to be sent as a value. */
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
    };

    try {
      if (form.id) {
        await updateAnnouncement({ id: form.id, body: payload }).unwrap();
        toast.success('Announcement updated successfully.', message);
      } else {
        await createAnnouncement(payload).unwrap();
        toast.success('Announcement created successfully.', message);
      }
      setForm(null);
    } catch (error) {
      toast.error('Could not save the announcement', errorMessage(error));
    }
  };

  const toggleActive = async (announcement: Announcement) => {
    try {
      await updateAnnouncement({
        id: announcement.id,
        body: { isActive: !announcement.isActive },
      }).unwrap();
      toast.success(
        announcement.isActive ? 'Announcement hidden' : 'Announcement published',
        announcement.message,
      );
    } catch (error) {
      toast.error('Could not update the announcement', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAnnouncement(deleteTarget.id).unwrap();
      toast.success('Announcement deleted successfully.', deleteTarget.message);
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete the announcement', errorMessage(error));
    }
  };

  if (isError) {
    return (
      <Card>
        <ErrorState onRetry={refetch} />
      </Card>
    );
  }

  const previewMessage = form?.message.replace(/\s+/g, ' ').trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500 dark:text-ink-400">
          The scrolling strip above the storefront header. Messages run in priority order, lowest
          first.
          {!isLoading && list.length > 0 && (
            <span className="ml-1 font-medium text-ink-700 dark:text-ink-300">
              {liveCount} live now.
            </span>
          )}
        </p>
        {can('homepage', 'create') && (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={openCreate}
          >
            Add Announcement
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-ink-200 dark:divide-ink-800">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 p-4">
                <Skeleton className="h-5 w-8 shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-9 shrink-0" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No announcements yet"
            description="Offers, shipping notes and launches — shown in a strip above the header on every page."
            action={
              can('homepage', 'create') && (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  Add Announcement
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-ink-200 dark:divide-ink-800">
            {list.map((announcement) => {
              const schedule = scheduleOf(announcement, now);
              const badge = SCHEDULE_BADGE[schedule];

              return (
                <li
                  key={announcement.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-2 p-4 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40 sm:flex-nowrap',
                    schedule !== 'live' && 'opacity-70',
                  )}
                >
                  <span
                    className="w-10 shrink-0 text-2xs tabular-nums text-ink-400"
                    title="Priority"
                  >
                    #{announcement.priority}
                  </span>

                  <div className="min-w-0 flex-1 basis-48">
                    <p className="line-clamp-2 break-words text-sm font-medium text-ink-900 dark:text-ink-100">
                      {announcement.message}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-500 dark:text-ink-400">
                      <Badge className={badge.className}>{badge.label}</Badge>
                      {(announcement.startDate || announcement.endDate) && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {announcement.startDate ? formatDate(announcement.startDate, true) : 'Now'}
                          {' – '}
                          {announcement.endDate ? formatDate(announcement.endDate, true) : 'No end'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {can('homepage', 'edit') && (
                      <>
                        <Switch
                          size="sm"
                          checked={announcement.isActive}
                          onChange={() => toggleActive(announcement)}
                          label={announcement.isActive ? 'Hide announcement' : 'Publish announcement'}
                        />
                        <IconButton
                          label={`Edit ${announcement.message}`}
                          size="sm"
                          onClick={() => openEdit(announcement)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
                    )}
                    {can('homepage', 'delete') && (
                      <IconButton
                        label={`Delete ${announcement.message}`}
                        size="sm"
                        onClick={() => setDeleteTarget(announcement)}
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

      <FormModal
        open={form !== null}
        onClose={() => setForm(null)}
        onSubmit={submit}
        title={form?.id ? 'Edit announcement' : 'Add announcement'}
        description="One line of copy for the strip above the storefront header."
        submitLabel={form?.id ? 'Save changes' : 'Add announcement'}
        loading={creating || updating}
      >
        {form && (
          <>
            <Field
              label="Message"
              required
              error={errors.message}
              hint={`${form.message.length}/${MESSAGE_MAX} characters`}
            >
              <Textarea
                rows={2}
                maxLength={MESSAGE_MAX}
                value={form.message}
                invalid={Boolean(errors.message)}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                placeholder="Free shipping on orders above ₹1999"
              />
            </Field>

            {/* Set the way the storefront sets it — dark strip, small caps — so
                the admin sees the length problem before the shoppers do. */}
            <div
              aria-hidden="true"
              className="flex h-9 items-center overflow-hidden rounded-md bg-ink-900 px-4 text-[10px] uppercase tracking-[0.18em] text-white/90"
            >
              <span className="truncate">{previewMessage || 'Preview'}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Priority" required error={errors.priority} hint="Lower numbers show first.">
                <Input
                  type="number"
                  min={0}
                  max={PRIORITY_MAX}
                  step={1}
                  value={form.priority}
                  invalid={Boolean(errors.priority)}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Status">
                <div className="pt-1.5">
                  <Switch
                    checked={form.isActive}
                    onChange={(checked) => setForm({ ...form, isActive: checked })}
                    label="Visible on the storefront"
                  />
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start" hint="Leave blank to show immediately.">
                <Input
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                />
              </Field>
              <Field label="End" error={errors.endDate} hint="Leave blank to run indefinitely.">
                <Input
                  type="datetime-local"
                  value={form.endDate}
                  invalid={Boolean(errors.endDate)}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                />
              </Field>
            </div>
          </>
        )}
      </FormModal>

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="announcement"
        name={deleteTarget?.message}
        loading={deleting}
      />
    </div>
  );
}
