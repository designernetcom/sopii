import type { FormEvent, ReactNode } from 'react';
import { Modal, type ModalSize } from './Modal';
import { Button } from '@/components/common/Button';

export interface FormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  size?: ModalSize;
  children: ReactNode;
  extraActions?: ReactNode;
}

/** Modal whose body is a form — submit lives in the footer but posts the form. */
export function FormModal({
  open,
  onClose,
  onSubmit,
  title,
  description,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  loading,
  size = 'md',
  children,
  extraActions,
}: FormModalProps) {
  const formId = `form-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      busy={loading}
      footer={
        <>
          {extraActions}
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={loading}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        {children}
      </form>
    </Modal>
  );
}
