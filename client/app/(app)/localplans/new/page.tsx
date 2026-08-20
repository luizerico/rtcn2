"use client";

import { Suspense } from 'react';
import NewLocalPlanForm from './NewLocalPlanForm';

export default function NewLocalPlanPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl py-12 text-sm text-[var(--muted)]">Loading…</p>}>
      <NewLocalPlanForm />
    </Suspense>
  );
}
