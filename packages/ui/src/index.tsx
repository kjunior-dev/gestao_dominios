'use client';
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  Eye,
  EyeOff,
  X,
  Loader2,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from './utils';
export { cn } from './utils';
const variants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
    size: { default: '', sm: 'button-sm' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({
  asChild = false,
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp className={cn(variants({ variant, size }), className)} {...props} />
  );
}
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn('input', className)} {...props} />;
}
export function PasswordInput(props: React.ComponentProps<'input'>) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="password-input">
      <Input {...props} type={show ? 'text' : 'password'} />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? 'Ocultar password' : 'Mostrar password'}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
export function Select(props: React.ComponentProps<'select'>) {
  return <select {...props} className={cn('input', props.className)} />;
}
export function Checkbox(props: React.ComponentProps<'input'>) {
  return <input {...props} type="checkbox" className="checkbox" />;
}
export function Card(props: React.ComponentProps<'section'>) {
  return <section {...props} className={cn('card', props.className)} />;
}
export function Badge({
  variant = 'neutral',
  ...props
}: React.ComponentProps<'span'> & {
  variant?: 'neutral' | 'success' | 'warning';
}) {
  return (
    <span
      {...props}
      className={cn('badge', 'badge-' + variant, props.className)}
    />
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <strong className="stat-value">{value}</strong>
    </Card>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <FolderOpen size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function LoadingState() {
  return (
    <div role="status" className="loading-state">
      <Loader2 className="spin" /> A carregar…
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function FormField({
  label,
  error,
  children,
  id,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Paginação" className="pagination">
      <span>
        {total} registos · Página {page}
      </span>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Página seguinte"
        disabled={page * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} />
      </Button>
    </nav>
  );
}
export function Modal({
  title,
  children,
  open,
  onOpenChange,
}: {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content" aria-describedby={undefined}>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close className="modal-close" aria-label="Fechar">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ConfirmDialog({
  title,
  description,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState('');
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {children}
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={title}>
        <p>{description}</p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onConfirm();
                setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Não foi possível concluir o pedido',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar
          </Button>
        </div>
      </Modal>
    </>
  );
}
export function Dropdown({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary">{label}</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
export const DropdownItem = DropdownMenu.Item;
export function Sidebar(props: React.ComponentProps<'aside'>) {
  return <aside {...props} className={cn('sidebar', props.className)} />;
}
export function Topbar(props: React.ComponentProps<'header'>) {
  return <header {...props} className={cn('topbar', props.className)} />;
}
export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav aria-label="Localização" className="breadcrumb">
      {items.join(' / ')}
    </nav>
  );
}
