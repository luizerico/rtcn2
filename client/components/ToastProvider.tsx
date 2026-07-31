"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'error' | 'warning';

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toasts: ToastMessage[];
  pushToast: (input: { message: string; title?: string; tone?: ToastTone; durationMs?: number }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({
      message,
      title,
      tone = 'info',
      durationMs = 4500,
    }: {
      message: string;
      title?: string;
      tone?: ToastTone;
      durationMs?: number;
    }) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, title, tone }]);
      if (durationMs > 0) {
        window.setTimeout(() => dismissToast(id), durationMs);
      }
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({
      toasts,
      pushToast,
      dismissToast,
    }),
    [toasts, pushToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg ${
              toast.tone === 'success'
                ? 'border-teal-200 bg-teal-50 text-teal-900'
                : toast.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : toast.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-800'
            }`}
            role="status"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
                <p className="text-sm">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-xs font-medium opacity-70 hover:opacity-100"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
