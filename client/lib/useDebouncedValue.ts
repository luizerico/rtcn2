"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

export const FILTER_DEBOUNCE_MS = 350;

function trimFilters<T>(value: T): T {
  if (typeof value === 'string') return value.trim() as T;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const next = { ...value } as T & Record<string, unknown>;
  for (const key of Object.keys(next)) {
    const field = next[key];
    if (typeof field === 'string') next[key] = field.trim();
  }
  return next;
}

function filtersEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  if (keys.length !== Object.keys(rightRecord).length) return false;
  return keys.every((key) => Object.is(leftRecord[key], rightRecord[key]));
}

export function useDebouncedValue<T>(value: T, delayMs = FILTER_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function useAutoAppliedFilters<T>(initial: T, delayMs = FILTER_DEBOUNCE_MS) {
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(() => trimFilters(initial));
  const [page, setPage] = useState(1);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    const nextApplied = trimFilters(filters);
    if (filtersEqual(nextApplied, appliedRef.current)) return;
    const timer = window.setTimeout(() => {
      setApplied(nextApplied);
      setPage(1);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [filters, delayMs]);

  const resetFilters = useCallback((next?: T) => {
    const value = next === undefined ? initialRef.current : next;
    const trimmed = trimFilters(value);
    setFilters(value);
    setApplied(trimmed);
    setPage(1);
  }, []);

  const updateFilters = useCallback((next: SetStateAction<T>) => {
    setFilters(next);
  }, []);

  return {
    filters,
    setFilters: updateFilters,
    applied,
    page,
    setPage,
    resetFilters,
  };
}
