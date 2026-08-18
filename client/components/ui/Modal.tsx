"use client";

import React, { ReactNode, useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  /** When false, overlay clicks do not dismiss. Defaults to true. */
  closeOnBackdrop?: boolean;
  /** When false, Escape does not dismiss. Defaults to true. */
  closeOnEscape?: boolean;
  /** When false, the body does not scroll; children manage overflow. Defaults to true. */
  scrollBody?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  scrollBody = true,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose, closeOnEscape]);

  if (!isOpen) return null;

  const widthClass =
    size === 'xl' ? 'max-w-3xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`flex h-fit min-h-0 max-h-full w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] sm:rounded-xl ${widthClass}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-4 sm:px-6">
          <h3 id="modal-title" className="pr-2 text-lg font-semibold text-gray-900 sm:text-xl">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 transition hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className={`flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 ${
            scrollBody ? 'overflow-y-auto' : 'overflow-hidden'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
