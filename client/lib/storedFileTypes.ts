export type StoredFileUser = {
  _id?: string;
  username?: string;
  email?: string;
};

export type FileAnalysisRecord = {
  jobId: string | null;
  status: string | null;
  result: string | Record<string, unknown> | unknown[] | null;
  error: string | null;
  model: string | null;
  requestedAt?: string | null;
  completedAt?: string | null;
  statusSummary?: string | null;
  progressStep?: string | null;
  progressCompleted?: number | null;
  progressTotal?: number | null;
  queuePosition?: number | null;
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

export function isInFlightAnalysis(status?: string | null): boolean {
  const value = String(status || '').toLowerCase();
  return value === 'queued' || value === 'running';
}

export function isTerminalAnalysis(status?: string | null): boolean {
  const value = String(status || '').toLowerCase();
  return value === 'succeeded' || value === 'failed' || value === 'cancelled';
}

export const ANALYSIS_POLL_INITIAL_MS = 3000;
export const ANALYSIS_POLL_MAX_MS = 60000;

export function nextAnalysisPollDelay(currentMs: number, failed = false): number {
  const base =
    Number.isFinite(currentMs) && currentMs > 0 ? currentMs : ANALYSIS_POLL_INITIAL_MS;
  const next = Math.round(base * (failed ? 2 : 1.5));
  return Math.min(ANALYSIS_POLL_MAX_MS, Math.max(ANALYSIS_POLL_INITIAL_MS, next));
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
