"use client";

import { useEffect, useRef } from 'react';

export type AreaStep = {
  id: string;
  label: string;
  total: number;
  answered: number;
  complete: boolean;
};

type AreaStepperProps = {
  areas: AreaStep[];
  currentIndex: number;
  onSelect: (index: number) => void;
  autoScroll?: boolean;
};

function lineClass(complete: boolean, current: boolean) {
  if (complete) return 'bg-emerald-500';
  if (current) return 'bg-[var(--accent)]';
  return 'bg-[var(--border)]';
}

export default function AreaStepper({
  areas,
  currentIndex,
  onSelect,
  autoScroll = true,
}: AreaStepperProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const list = listRef.current;
    const item = activeItemRef.current;
    if (!list || !item) return;
    const nextLeft = item.offsetLeft - list.clientWidth / 2 + item.offsetWidth / 2;
    list.scrollTo({ left: Math.max(0, nextLeft), behavior: 'smooth' });
  }, [autoScroll, currentIndex]);

  if (areas.length <= 1) return null;

  const last = areas.length - 1;

  return (
    <nav aria-label="Survey areas" className="space-y-3">
      <ol
        ref={listRef}
        className="flex items-start gap-0 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
      >
        {areas.map((area, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = area.complete && !isCurrent;
          const leftComplete = index > 0 && areas[index - 1].complete;
          const leftCurrent = index > 0 && index - 1 === currentIndex;
          return (
            <li
              key={area.id}
              ref={isCurrent ? activeItemRef : undefined}
              className="relative flex min-w-[7.5rem] max-w-[12rem] flex-1 flex-col items-center px-1 sm:min-w-[9rem]"
            >
              {index > 0 ? (
                <span
                  className={`absolute top-5 right-1/2 left-0 h-0.5 ${lineClass(leftComplete, leftCurrent)}`}
                  aria-hidden="true"
                />
              ) : null}
              {index < last ? (
                <span
                  className={`absolute top-5 left-1/2 right-0 h-0.5 ${lineClass(isComplete, isCurrent)}`}
                  aria-hidden="true"
                />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? 'step' : undefined}
                title={area.label}
                className={[
                  'relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition',
                  isCurrent
                    ? 'bg-[var(--accent)] text-white ring-4 ring-[var(--accent-soft)]'
                    : isComplete
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[var(--border)] text-[var(--muted)]',
                ].join(' ')}
              >
                {isComplete ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  index + 1
                )}
              </button>
              <p
                className={[
                  'mt-2 max-w-full truncate text-center text-xs font-semibold sm:text-sm',
                  isCurrent
                    ? 'text-[var(--accent)]'
                    : isComplete
                      ? 'text-emerald-700'
                      : 'text-[var(--muted)]',
                ].join(' ')}
              >
                {area.label}
              </p>
              <p className="hidden max-w-full truncate text-center text-[11px] text-[var(--muted)] sm:block">
                {area.answered}/{area.total} answered
              </p>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={currentIndex <= 0}
          onClick={() => onSelect(currentIndex - 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Previous area
        </button>
        <span className="text-xs text-[var(--muted)] sm:text-sm">
          Area {currentIndex + 1} of {areas.length}
        </span>
        <button
          type="button"
          disabled={currentIndex >= last}
          onClick={() => onSelect(currentIndex + 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next area
        </button>
      </div>
    </nav>
  );
}
