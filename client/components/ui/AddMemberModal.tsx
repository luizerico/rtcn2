"use client";

import React, { FormEvent, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

type ResourceType = 'group' | 'object';

export interface AddMemberPayload {
  userId: string;
}

interface AddMemberModalProps {
  resourceType: ResourceType;
  isOpen: boolean;
  onClose: () => void;
  onAddUser: (data: AddMemberPayload) => void;
}

const AddMemberModal: React.FC<AddMemberModalProps> = ({
  resourceType,
  isOpen,
  onClose,
  onAddUser,
}) => {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const resourceLabel = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);

  useEffect(() => {
    if (!isOpen) {
      setUserId('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedUserId = userId.trim();

    if (!trimmedUserId) {
      setError('User ID is required.');
      return;
    }

    onAddUser({ userId: trimmedUserId });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add Member to ${resourceLabel}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium mb-2">
            User ID
          </label>
          <input
            id={inputId}
            type="text"
            placeholder="Enter User ID (e.g., user-123)"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            autoComplete="off"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && (
            <p id={`${inputId}-error`} role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded text-sm font-medium hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!userId.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded text-sm font-medium disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            Add Member
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddMemberModal;
