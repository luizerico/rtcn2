// components/ui/Modal.tsx
"use client";

import React, { ReactNode } from 'react';

/**
 * A reusable modal component for dialog-based interactions (e.g., Adding members, setting policies).
 * @param {boolean} isOpen - Controls the visibility of the modal.
 * @param {function} onClose - Callback function to close the modal.
 * @param {ReactNode} children - The content to render inside the modal body.
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      {/* Modal container */}
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full transform transition-all sm:my-8 sm:align-middle overflow-hidden">
        {/* Modal header/title */}
        <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-gray-100 transition"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="p-6 flex-shrink-0">
          {children}
        </div>
      </div>
    </div>
  );
};