export type StoredFileUser = {
  _id?: string;
  username?: string;
  email?: string;
};

export type FileAnalysisRecord = {
  jobId: string | null;
  status: string | null;
  result: string | null;
  error: string | null;
  model: string | null;
  requestedAt?: string | null;
  completedAt?: string | null;
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
  questionId?: string | null;
  storageDriver: string;
  analysis?: FileAnalysisRecord | null;
  uploadedBy?: StoredFileUser | string | null;
  updatedBy?: StoredFileUser | string | null;
  deletedAt?: string | null;
  deletedBy?: StoredFileUser | string | null;
  ownerLabel?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp';
export const FILE_TYPES_HINT =
  'PDF, Word (DOC/DOCX), Excel (XLS/XLSX), and images (JPEG, PNG, GIF, WEBP).';

const ANALYZABLE_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isAnalyzableFile(row: Pick<StoredFileRecord, 'mimeType' | 'originalName'>): boolean {
  const mime = String(row.mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (ANALYZABLE_MIME.has(mime)) return true;
  const name = String(row.originalName || '').toLowerCase();
  return name.endsWith('.pdf') || name.endsWith('.docx');
}

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
