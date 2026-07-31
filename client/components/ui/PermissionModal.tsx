"use client";

import React, { FormEvent, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

type PermissionLevel = 'READ' | 'WRITE' | 'CREATE' | 'DELETE' | 'ADMIN';
type ResourceType = 'USER' | 'GROUP' | 'ASSET';

const PERMISSION_LEVELS: PermissionLevel[] = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];
const RESOURCE_TYPES: ResourceType[] = ['USER', 'GROUP', 'ASSET'];

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  READ: 'Read',
  WRITE: 'Write',
  CREATE: 'Create',
  DELETE: 'Delete',
  ADMIN: 'Admin',
};

export interface UpdatePolicyPayload {
  resourceType: ResourceType;
  scopes: PermissionLevel[];
  target: string;
}

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdatePolicy: (data: UpdatePolicyPayload) => void;
  initialResourceType?: ResourceType;
  initialTarget?: string;
}

const initialPermissions: Record<PermissionLevel, boolean> = {
  READ: false,
  WRITE: false,
  CREATE: false,
  DELETE: false,
  ADMIN: false,
};

const PermissionModal: React.FC<PermissionModalProps> = ({
  isOpen,
  onClose,
  onUpdatePolicy,
  initialResourceType = 'ASSET',
  initialTarget = '*',
}) => {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [resourceType, setResourceType] = useState<ResourceType>(initialResourceType);
  const [targetResource, setTargetResource] = useState(initialTarget);
  const [error, setError] = useState<string | null>(null);
  const targetInputId = useId();

  useEffect(() => {
    if (!isOpen) {
      setPermissions(initialPermissions);
      setResourceType(initialResourceType);
      setTargetResource(initialTarget);
      setError(null);
    } else {
      setResourceType(initialResourceType);
      setTargetResource(initialTarget);
    }
  }, [isOpen, initialResourceType, initialTarget]);

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
      setError('Target is required (use * for all).');
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
    <Modal isOpen={isOpen} onClose={onClose} title="Edit group policy">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={`${targetInputId}-type`} className="mb-2 block text-sm font-medium">
            Resource type
          </label>
          <select
            id={`${targetInputId}-type`}
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value as ResourceType)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Permissions</legend>
          {PERMISSION_LEVELS.map((level) => {
            const checkboxId = `${targetInputId}-${level.toLowerCase()}`;
            return (
              <label key={level} htmlFor={checkboxId} className="flex cursor-pointer items-center space-x-2">
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
          <label htmlFor={targetInputId} className="mb-2 block text-sm font-medium">
            Target
          </label>
          <input
            id={targetInputId}
            type="text"
            placeholder="* or asset name / id"
            value={targetResource}
            onChange={(e) => {
              setTargetResource(e.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Save Policy
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PermissionModal;
