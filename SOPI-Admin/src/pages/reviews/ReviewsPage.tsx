import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MessageSquareText, Reply, Star, Trash2, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDocumentTitle, useListQuery, usePermissions } from '@/hooks';
import {
  useBulkReviewActionMutation,
  useDeleteReviewMutation,
  useGetReviewCountsQuery,
  useGetReviewsQuery,
  useReplyToReviewMutation,
  useUpdateReviewStatusMutation,
} from '@/store/api/marketingApi';
import { errorMessage } from '@/store/api/baseQuery';
import { PageHeader, Tabs } from '@/components/common/PageHeader';
import { Card } from '@/components/common/Card';
import { Button, IconButton } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/Badge';
import { AppImage, Avatar } from '@/components/common/AppImage';
import { SearchInput, FilterChip } from '@/components/common/SearchInput';
import { Field, Textarea } from '@/components/common/Field';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FormModal } from '@/components/modals/FormModal';
import { DeleteModal, ConfirmModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { REVIEW_STATUS } from '@/utils/constants';
import { formatDate, formatNumber } from '@/utils/format';
import { useAppSelector } from '@/store/hooks';
import type { Review } from '@/types';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            'h-3.5 w-3.5',
            index < rating ? 'fill-amber-400 text-amber-400' : 'text-ink-300 dark:text-ink-600',
          )}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  useDocumentTitle('Reviews');

  const toast = useToast();
  const { can } = usePermissions();
  const admin = useAppSelector((state) => state.auth.user);

  const query = useListQuery({ pageSize: 10, sortBy: 'createdAt', sortDir: 'desc' });
  const { data, isLoading, isError, refetch } = useGetReviewsQuery(query.params);
  const { data: counts } = useGetReviewCountsQuery();

  const [updateStatus] = useUpdateReviewStatusMutation();
  const [replyToReview, { isLoading: replying }] = useReplyToReviewMutation();
  const [deleteReview, { isLoading: deleting }] = useDeleteReviewMutation();
  const [bulkAction, { isLoading: bulkRunning }] = useBulkReviewActionMutation();

  const [selected, setSelected] = useState<string[]>([]);
  const [replyTarget, setReplyTarget] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);

  const setStatus = async (review: Review, status: Review['status']) => {
    try {
      await updateStatus({ id: review.id, status }).unwrap();
      toast.success(
        status === 'approved' ? 'Review approved' : status === 'rejected' ? 'Review rejected' : 'Review updated',
        review.productName,
      );
    } catch (error) {
      toast.error('Could not update the review', errorMessage(error));
    }
  };

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!replyTarget || !replyText.trim()) return;
    try {
      await replyToReview({
        id: replyTarget.id,
        reply: replyText.trim(),
        by: admin?.name,
      }).unwrap();
      toast.success('Reply published', replyTarget.productName);
      setReplyTarget(null);
      setReplyText('');
    } catch (error) {
      toast.error('Could not publish the reply', errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteReview(deleteTarget.id).unwrap();
      toast.success('Review deleted successfully.');
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Could not delete the review', errorMessage(error));
    }
  };

  const handleBulk = async (action: 'status' | 'delete', status?: Review['status']) => {
    try {
      const result = await bulkAction({ action, ids: selected, status }).unwrap();
      toast.success(
        `${result.affected} review(s) ${action === 'delete' ? 'deleted' : `marked ${status}`}.`,
      );
      setSelected([]);
      setBulkDelete(false);
    } catch (error) {
      toast.error('Bulk action failed', errorMessage(error));
    }
  };

  const columns: Column<Review>[] = [
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      hideable: false,
      render: (review) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={review.customerName} src={review.customerAvatar} size="sm" />
          <div className="min-w-0">
            <p className="max-w-[10rem] truncate font-medium text-ink-900 dark:text-ink-100">
              {review.customerName}
            </p>
            {review.verifiedPurchase && (
              <p className="text-2xs text-emerald-600 dark:text-emerald-400">Verified purchase</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'productName',
      header: 'Product',
      sortable: true,
      render: (review) => (
        <div className="flex items-center gap-2.5">
          <AppImage
            src={review.productImage}
            alt={review.productName}
            seed={review.productId}
            wrapperClassName="h-9 w-9 shrink-0"
          />
          <Link
            to={`/admin/products/${review.productId}`}
            onClick={(event) => event.stopPropagation()}
            className="max-w-[12rem] truncate text-ink-700 hover:text-brand-600 dark:text-ink-300 dark:hover:text-brand-400"
          >
            {review.productName}
          </Link>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      render: (review) => <Stars rating={review.rating} />,
    },
    {
      key: 'body',
      header: 'Review',
      render: (review) => (
        <div className="min-w-0 max-w-md">
          {review.title && (
            <p className="truncate text-xs font-medium text-ink-900 dark:text-ink-100">
              {review.title}
            </p>
          )}
          <p className="line-clamp-2 text-xs text-ink-600 dark:text-ink-400">{review.body}</p>
          {review.reply && (
            <p className="mt-1 line-clamp-1 rounded bg-ink-50 px-2 py-1 text-2xs text-ink-500 dark:bg-ink-800 dark:text-ink-400">
              <Reply className="mr-1 inline h-2.5 w-2.5" />
              {review.reply.body}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (review) => (
        <span className="whitespace-nowrap text-ink-600 dark:text-ink-400">
          {formatDate(review.createdAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (review) => <StatusBadge tone={REVIEW_STATUS[review.status]} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      hideable: false,
      align: 'right',
      render: (review) => (
        <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          {can('reviews', 'edit') && (
            <>
              {review.status !== 'approved' && (
                <IconButton
                  label="Approve review"
                  size="sm"
                  onClick={() => setStatus(review, 'approved')}
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                </IconButton>
              )}
              {review.status !== 'rejected' && (
                <IconButton
                  label="Reject review"
                  size="sm"
                  onClick={() => setStatus(review, 'rejected')}
                >
                  <X className="h-3.5 w-3.5 text-rose-500" />
                </IconButton>
              )}
              <IconButton
                label="Reply to review"
                size="sm"
                onClick={() => {
                  setReplyTarget(review);
                  setReplyText(review.reply?.body ?? '');
                }}
              >
                <Reply className="h-3.5 w-3.5" />
              </IconButton>
            </>
          )}
          {can('reviews', 'delete') && (
            <IconButton label="Delete review" size="sm" onClick={() => setDeleteTarget(review)}>
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </IconButton>
          )}
        </div>
      ),
    },
  ];

  const activeTab = (query.state.status as string) || 'all';
  const activeRating = (query.state.rating as string) || 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reviews"
        description="Moderate customer reviews and reply on behalf of SOPII."
        meta={
          counts && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              {counts.averageRating.toFixed(2)} average
            </span>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'All reviews', value: counts?.all ?? 0, tone: 'text-ink-900 dark:text-ink-100' },
          { label: 'Pending', value: counts?.pending ?? 0, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'Approved', value: counts?.approved ?? 0, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Rejected', value: counts?.rejected ?? 0, tone: 'text-rose-600 dark:text-rose-400' },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs font-medium text-ink-500 dark:text-ink-400">{stat.label}</p>
            <p className={cn('mt-1.5 text-xl font-semibold tabular-nums', stat.tone)}>
              {formatNumber(stat.value)}
            </p>
          </Card>
        ))}
      </div>

      <Tabs
        items={[
          { key: 'all', label: 'All', count: counts?.all },
          { key: 'pending', label: 'Pending', count: counts?.pending },
          { key: 'approved', label: 'Approved', count: counts?.approved },
          { key: 'rejected', label: 'Rejected', count: counts?.rejected },
        ]}
        active={activeTab}
        onChange={(key) => query.setFilter('status', key === 'all' ? undefined : key)}
      />

      <DataTable
        storageKey="reviews"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(review) => review.id}
        loading={isLoading}
        error={isError || undefined}
        onRetry={refetch}
        sort={query.sort}
        onSortChange={query.setSort}
        selectable={can('reviews', 'edit')}
        selected={selected}
        onSelectedChange={setSelected}
        emptyIcon={MessageSquareText}
        emptyTitle="No reviews found."
        emptyDescription="Reviews appear here as customers write them."
        toolbar={
          <SearchInput
            value={query.state.search}
            onChange={query.setSearch}
            placeholder="Search customer, product or text…"
          />
        }
        filters={
          <div className="flex flex-wrap gap-1.5">
            {['all', '5', '4', '3', '2', '1'].map((rating) => (
              <FilterChip
                key={rating}
                label={rating === 'all' ? 'Any rating' : `${rating} ★`}
                active={activeRating === rating}
                onClick={() => query.setFilter('rating', rating === 'all' ? undefined : rating)}
              />
            ))}
          </div>
        }
        bulkActions={() => (
          <>
            <Button size="xs" variant="secondary" disabled={bulkRunning} onClick={() => handleBulk('status', 'approved')}>
              Approve
            </Button>
            <Button size="xs" variant="secondary" disabled={bulkRunning} onClick={() => handleBulk('status', 'rejected')}>
              Reject
            </Button>
            {can('reviews', 'delete') && (
              <Button size="xs" variant="danger" disabled={bulkRunning} onClick={() => setBulkDelete(true)}>
                Delete
              </Button>
            )}
          </>
        )}
        mobileCard={(review) => (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <Avatar name={review.customerName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {review.customerName}
                </p>
                <p className="truncate text-2xs text-ink-500 dark:text-ink-400">
                  {review.productName}
                </p>
              </div>
              <StatusBadge tone={REVIEW_STATUS[review.status]} />
            </div>
            <Stars rating={review.rating} />
            <p className="line-clamp-3 text-xs text-ink-600 dark:text-ink-400">{review.body}</p>
            {can('reviews', 'edit') && (
              <div className="flex flex-wrap gap-1.5">
                <Button size="xs" variant="secondary" onClick={() => setStatus(review, 'approved')}>
                  Approve
                </Button>
                <Button size="xs" variant="secondary" onClick={() => setStatus(review, 'rejected')}>
                  Reject
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setReplyTarget(review);
                    setReplyText(review.reply?.body ?? '');
                  }}
                >
                  Reply
                </Button>
              </div>
            )}
          </div>
        )}
        pagination={{
          page: data?.page ?? 1,
          pageSize: data?.pageSize ?? 10,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
          onPageChange: query.setPage,
          onPageSizeChange: query.setPageSize,
          label: 'reviews',
        }}
      />

      <FormModal
        open={replyTarget !== null}
        onClose={() => setReplyTarget(null)}
        onSubmit={submitReply}
        title="Reply to review"
        description={replyTarget ? `${replyTarget.customerName} · ${replyTarget.productName}` : undefined}
        submitLabel="Publish reply"
        loading={replying}
      >
        {replyTarget && (
          <>
            <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-800/60">
              <div className="flex items-center gap-2">
                <Stars rating={replyTarget.rating} />
                <span className="text-2xs text-ink-500 dark:text-ink-400">
                  {formatDate(replyTarget.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-700 dark:text-ink-300">{replyTarget.body}</p>
            </div>
            <Field label="Your reply" required hint="Published publicly under the review.">
              <Textarea
                rows={4}
                autoFocus
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder="Thank you for the kind words! — Team SOPII"
              />
            </Field>
          </>
        )}
      </FormModal>

      <DeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        entity="review"
        name={deleteTarget ? `${deleteTarget.customerName} on ${deleteTarget.productName}` : undefined}
        loading={deleting}
      />

      <ConfirmModal
        open={bulkDelete}
        onClose={() => setBulkDelete(false)}
        onConfirm={() => handleBulk('delete')}
        loading={bulkRunning}
        tone="danger"
        title={`Delete ${selected.length} reviews?`}
        description="These reviews will be permanently removed from the storefront."
        confirmLabel="Delete reviews"
      />
    </div>
  );
}
