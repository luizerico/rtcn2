"use client";

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode, SVGProps } from 'react';

export type TableActionIconName =
  | 'delete'
  | 'edit'
  | 'add'
  | 'password'
  | 'verify'
  | 'unverify'
  | 'members'
  | 'disconnect'
  | 'answer'
  | 'results';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
      {...props}
    >
      {children}
    </svg>
  );
}

export function TableActionIcon({ name }: { name: TableActionIconName }) {
  switch (name) {
    case 'delete':
      return (
        <Svg>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
        </Svg>
      );
    case 'edit':
      return (
        <Svg>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </Svg>
      );
    case 'add':
      return (
        <Svg>
          <path d="M12 5v14M5 12h14" />
        </Svg>
      );
    case 'password':
      return (
        <Svg>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          <circle cx="12" cy="16" r="1.25" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'verify':
      return (
        <Svg>
          <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </Svg>
      );
    case 'unverify':
      return (
        <Svg>
          <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
          <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
        </Svg>
      );
    case 'members':
      return (
        <Svg>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case 'disconnect':
      return (
        <Svg>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </Svg>
      );
    case 'answer':
      return (
        <Svg>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h5" />
        </Svg>
      );
    case 'results':
      return (
        <Svg>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 17V10" />
          <path d="M12 17V7" />
          <path d="M16 17v-4" />
        </Svg>
      );
    default:
      return null;
  }
}

const iconBtnBase =
  'inline-flex h-10 w-10 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40';

/** Add to desktop `<tr>` so `TableActionRow` can reveal on hover. */
export const tableActionRowGroupClass = 'group';

function toneClass(danger: boolean, allowed: boolean) {
  if (!allowed) return 'text-[var(--muted)]';
  if (danger) return 'text-[var(--danger)] hover:bg-red-50';
  return 'text-[var(--accent)] hover:bg-[var(--accent-soft)]/60';
}

export function AccessIconButton({
  allowed,
  label,
  icon,
  reason = 'You do not have permission for this action.',
  danger = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  allowed: boolean;
  label: string;
  icon: TableActionIconName;
  reason?: string;
  danger?: boolean;
}) {
  const tip = !allowed ? reason : label;
  return (
    <button
      type="button"
      {...props}
      disabled={!allowed || props.disabled}
      title={tip}
      aria-label={tip}
      className={`${iconBtnBase} ${toneClass(danger, allowed)} ${className}`}
    >
      <TableActionIcon name={icon} />
    </button>
  );
}

export function AccessIconLink({
  allowed,
  href,
  label,
  icon,
  reason = 'You do not have permission for this action.',
  className = '',
}: {
  allowed: boolean;
  href: string;
  label: string;
  icon: TableActionIconName;
  reason?: string;
  className?: string;
}) {
  if (!allowed) {
    return (
      <span
        className={`${iconBtnBase} ${toneClass(false, false)} ${className}`}
        title={reason}
        aria-label={reason}
        aria-disabled="true"
      >
        <TableActionIcon name={icon} />
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={`${iconBtnBase} ${toneClass(false, true)} ${className}`}
    >
      <TableActionIcon name={icon} />
    </Link>
  );
}

/** Compact row of icon actions. Always visible on touch/mobile; hover-reveal on fine-pointer desktop. */
export function TableActionRow({
  children,
  alwaysVisible = false,
}: {
  children: ReactNode;
  /** Force icons visible (e.g. dedicated mobile card layouts). */
  alwaysVisible?: boolean;
}) {
  return (
    <div
      className={[
        'inline-flex items-center justify-end gap-0.5',
        alwaysVisible
          ? ''
          : [
              // Touch / coarse pointers: always show. Fine pointer + hover: reveal on row hover.
              '[@media(hover:hover)_and_(pointer:fine)]:opacity-0',
              '[@media(hover:hover)_and_(pointer:fine)]:pointer-events-none',
              '[@media(hover:hover)_and_(pointer:fine)]:transition-opacity',
              '[@media(hover:hover)_and_(pointer:fine)]:duration-150',
              '[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100',
              '[@media(hover:hover)_and_(pointer:fine)]:group-hover:pointer-events-auto',
              '[@media(hover:hover)_and_(pointer:fine)]:focus-within:opacity-100',
              '[@media(hover:hover)_and_(pointer:fine)]:focus-within:pointer-events-auto',
            ].join(' '),
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
