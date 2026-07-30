"use client";

import React, { FormEvent, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

type PermissionLevel = 'READ' | 'WRITE' | 'DELETE';
type ResourceType = 'group' | 'object';

const PERMISSION_LEVELS: PermissionLevel[] = ['READ', 'WRITE', 'DELETE'];

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  READ: 'Read Access',
  WRITE: 'Write Access',
  DELETE: 'Delete Access',
};

export interface UpdatePolicyPayload {
  resourceType: ResourceType;
  scopes: PermissionLevel[];
  target: string;
}

interface PermissionModalProps {
  resourceType: ResourceType;
  isOpen: boolean;
  onClose: () => void;
  onUpdatePolicy: (data: UpdatePolicyPayload) => void;
}

const initialPermissions: Record<PermissionLevel, boolean> = {
  READ: false,
  WRITE: false,
  DELETE: false,
};

const PermissionModal: React.FC<PermissionModalProps> = ({
  resourceType,
  isOpen,
  onClose,
  onUpdatePolicy,
}) => {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [targetResource, setTargetResource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const targetInputId = useId();
  const resourceLabel = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);

  useEffect(() => {
    if (!isOpen) {
      setPermissions(initialPermissions);
      setTargetResource('');
      setError(null);
    }
  }, [isOpen]);

  const handleTogglePermission = (level: PermissionLevel) => {
    setPermissions((prev) => ({ ...prev, [level]: !prev[level] }));
    if (error) setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const activeScopes = PERMISSION_LEVELS.filter((level) => permissions[level]);
    const trimmedTarget = targetResource.trim();

    if (activeScopes.length === 0) {
      setError('Select at least one permission.');
      return;
    }

    if (!trimmedTarget) {
      setError('Target resource type is required.');
      return;
    }

    onUpdatePolicy({
      resourceType,
      scopes: activeScopes,
      target: trimmedTarget,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${resourceLabel} Policy Management`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-2">Permissions</legend>
          {PERMISSION_LEVELS.map((level) => {
            const checkboxId = `${targetInputId}-${level.toLowerCase()}`;
            return (
              <label
                key={level}
                htmlFor={checkboxId}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={permissions[level]}
                  onChange={() => handleTogglePermission(level)}
                  className="rounded border-gray-300"
                />
                <span>{PERMISSION_LABELS[level]}</span>
              </label>
            );
          })}
        </fieldset>

        <div>
          <label htmlFor={targetInputId} className="block text-sm font-medium mb-2">
            Target Resource Type
          </label>
          <input
            id={targetInputId}
            type="text"
            placeholder="Resource Type (e.g., User)"
            value={targetResource}
            onChange={(e) => {
              setTargetResource(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${targetInputId}-error` : undefined}
            autoComplete="off"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p id={`${targetInputId}-error`} role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

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
            className="px-4 py-2 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600"
          >
            Save Policy
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PermissionModal;
