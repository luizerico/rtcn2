export type StoredFileUser = {
  _id?: string;
  username?: string;
  email?: string;
};

export type StoredFileRecord = {
  _id: string;
  name: string;
  displayName: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  ownerType: string;
  ownerId: string;
  obs: string;
  storageDriver: string;
  uploadedBy?: StoredFileUser | string | null;
  updatedBy?: StoredFileUser | string | null;
  deletedAt?: string | null;
  deletedBy?: StoredFileUser | string | null;
  ownerLabel?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const FILE_ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png,.gif,.webp';

export function userLabel(user?: StoredFileUser | string | null): string {
  if (!user) return '—';
  if (typeof user === 'string') return user;
  return user.username || user.email || '—';
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
