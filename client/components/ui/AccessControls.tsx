"use client";

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const enabledBtn =
  'rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50';
const mutedAction = 'text-sm disabled:cursor-not-allowed disabled:opacity-40';

export function AccessPrimaryButton({
  allowed,
  reason = 'You do not have permission for this action.',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { allowed: boolean; reason?: string }) {
  return (
    <button
      type="button"
      {...props}
      disabled={!allowed || props.disabled}
      title={!allowed ? reason : props.title}
      className={`${enabledBtn} ${className}`}
    >
      {children}
    </button>
  );
}

export function AccessTextButton({
  allowed,
  reason = 'You do not have permission for this action.',
  danger = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  allowed: boolean;
  reason?: string;
  danger?: boolean;
}) {
  const color = danger
    ? 'text-[var(--danger)] hover:underline'
    : 'text-[var(--accent)] hover:underline';
  return (
    <button
      type="button"
      {...props}
      disabled={!allowed || props.disabled}
      title={!allowed ? reason : props.title}
      className={`${mutedAction} ${color} ${className}`}
    >
      {children}
    </button>
  );
}

export function AccessLink({
  allowed,
  href,
  reason = 'You do not have permission for this action.',
  className = '',
  children,
}: {
  allowed: boolean;
  href: string;
  reason?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!allowed) {
    return (
      <span
        className={`cursor-not-allowed text-sm text-[var(--muted)] opacity-50 ${className}`}
        title={reason}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`text-sm text-[var(--accent)] hover:underline ${className}`}>
      {children}
    </Link>
  );
}
