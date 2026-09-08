import type { ReactNode } from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { Modal, type ModalSize } from './Modal';
import { Button } from '@/components/common/Button';
import { cn } from '@/utils/cn';

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'info' | 'primary';
  loading?: boolean;
  size?: ModalSize;
  children?: ReactNode;
}

const TONES = {
  danger: {
    icon: Trash2,
    ring: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    button: 'danger' as const,
  },
  warning: {
    icon: AlertTriangle,
    ring: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    button: 'primary' as const,
  },
  info: {
    icon: Info,
    ring: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    button: 'primary' as const,
  },
  primary: {
    icon: Info,
    ring: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
    button: 'primary' as const,
  },
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading,
  size = 'sm',
  children,
}: ConfirmModalProps) {
  const config = TONES[tone];
  const Icon = config.icon;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={size}
      busy={loading}
      hideClose
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={config.button} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 py-1">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            config.ring,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink-900 dark:text-ink-100">{title}</h2>
          {description && (
            <div className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-400">
              {description}
            </div>
          )}
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </Modal>
  );
}

/** Delete confirmation with the record name spelled out. */
export function DeleteModal({
  open,
  onClose,
  onConfirm,
  entity,
  name,
  loading,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entity: string;
  name?: string;
  loading?: boolean;
  extra?: ReactNode;
}) {
  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      tone="danger"
      loading={loading}
      confirmLabel={loading ? 'Deleting…' : 'Delete'}
      title={`Are you sure you want to delete this ${entity}?`}
      description={
        <>
          {name && (
            <span className="font-medium text-ink-900 dark:text-ink-100">{name}</span>
          )}
          {name ? ' will be permanently removed. ' : ''}
          This action cannot be undone.
        </>
      }
    >
      {extra}
    </ConfirmModal>
  );
}
