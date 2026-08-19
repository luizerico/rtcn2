"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { Field, TextArea, TextInput } from '@/components/funding/FormFields';
import { useToast } from '@/components/ToastProvider';
import {
  apiDelete,
  apiDownload,
  apiGet,
  apiPatch,
  apiPost,
  apiUpload,
} from '@/lib/apiUtils';
import {
  FILE_ACCEPT,
  FILE_TYPES_HINT,
  formatBytes,
  isAnalyzableFile,
  userLabel,
  type FileAnalysisRecord,
  type StoredFileRecord,
} from '@/lib/storedFileTypes';

type AttachedFilesPanelProps = {
  listEndpoint: string;
  canWrite: boolean;
  title?: string;
  questionId?: string;
  variant?: 'section' | 'plain';
  enableAnalysis?: boolean;
  onItemsChange?: (items: StoredFileRecord[]) => void;
};

type UploadDraft = {
  file: File;
  displayName: string;
};

type FileAnalysisResponse = {
  jobId: string | null;
  status: string | null;
  summary: string | null;
  error: string | null;
  model: string | null;
  requestedAt?: string | null;
  completedAt?: string | null;
  file?: StoredFileRecord;
};

const ANALYSIS_POLL_MS = 2000;
const ANALYSIS_TIMEOUT_MS = 120000;

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function toFileAnalysis(response: FileAnalysisResponse): FileAnalysisRecord {
  return {
    jobId: response.jobId,
    status: response.status,
    result: response.summary,
    error: response.error,
    model: response.model,
    requestedAt: response.requestedAt,
    completedAt: response.completedAt,
  };
}

export default function AttachedFilesPanel({
  listEndpoint,
  canWrite,
  title = 'Files',
  questionId,
  variant = 'section',
  enableAnalysis = false,
  onItemsChange,
}: AttachedFilesPanelProps) {
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;
  const analyzeCancelRef = useRef<{ fileId: string | null }>({ fileId: null });
  const [items, setItems] = useState<StoredFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [obs, setObs] = useState('');
  const [pendingDelete, setPendingDelete] = useState<StoredFileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editObs, setEditObs] = useState('');
  const [savingObs, setSavingObs] = useState(false);

  const listUrl = questionId
    ? `${listEndpoint}${listEndpoint.includes('?') ? '&' : '?'}questionId=${encodeURIComponent(questionId)}`
    : listEndpoint;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: StoredFileRecord[] }>(listUrl);
      const next = Array.isArray(data.items) ? data.items : [];
      setItems(next);
      onItemsChangeRef.current?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      analyzeCancelRef.current.fileId = null;
    };
  }, []);

  const resetAttachForm = () => {
    setDrafts([]);
    setObs('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFilesPicked = (list: FileList | null) => {
    setDrafts(
      Array.from(list || []).map((file) => ({
        file,
        displayName: file.name,
      }))
    );
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!drafts.length) {
      pushToast({ tone: 'error', title: 'Choose files', message: FILE_TYPES_HINT });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      for (const draft of drafts) {
        form.append('file', draft.file);
        form.append('displayName', draft.displayName.trim() || draft.file.name);
      }
      if (obs.trim()) form.append('obs', obs.trim());
      if (questionId) form.append('questionId', questionId);
      const created = await apiUpload<{ items: StoredFileRecord[] }>(listEndpoint, form);
      const uploaded = Array.isArray(created.items) ? created.items : [];
      setItems((prev) => {
        const next = [...uploaded, ...prev];
        onItemsChangeRef.current?.(next);
        return next;
      });
      resetAttachForm();
      setAttachOpen(false);
      const label =
        uploaded.length === 1
          ? uploaded[0].displayName
          : `${uploaded.length} files uploaded`;
      pushToast({ tone: 'success', title: 'Files uploaded', message: label });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Failed to upload files.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (row: StoredFileRecord) => {
    try {
      await apiDownload(`/files/${row._id}/content`, row.originalName || row.displayName);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Failed to download file.',
      });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/files/${pendingDelete._id}`);
      setItems((prev) => {
        const next = prev.filter((row) => row._id !== pendingDelete._id);
        onItemsChangeRef.current?.(next);
        return next;
      });
      pushToast({ tone: 'success', title: 'File deleted', message: pendingDelete.displayName });
      setPendingDelete(null);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Failed to delete file.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveObs = async (row: StoredFileRecord) => {
    setSavingObs(true);
    try {
      const updated = await apiPatch<StoredFileRecord>(`/files/${row._id}`, { obs: editObs });
      setItems((prev) => {
        const next = prev.map((item) => (item._id === row._id ? updated : item));
        onItemsChangeRef.current?.(next);
        return next;
      });
      setEditingId(null);
      pushToast({ tone: 'success', title: 'Notes saved', message: updated.displayName });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Update failed',
        message: err instanceof Error ? err.message : 'Failed to update notes.',
      });
    } finally {
      setSavingObs(false);
    }
  };

  const applyAnalysis = (fileId: string, response: FileAnalysisResponse) => {
    const analysis = response.file?.analysis || toFileAnalysis(response);
    setItems((prev) => {
      const next = prev.map((item) =>
        item._id === fileId ? { ...item, ...(response.file || {}), analysis } : item
      );
      onItemsChangeRef.current?.(next);
      return next;
    });
    return analysis;
  };

  const handleAnalyze = async (row: StoredFileRecord) => {
    analyzeCancelRef.current.fileId = row._id;
    setAnalyzingId(row._id);
    try {
      const started = await apiPost<FileAnalysisResponse>(
        `${listEndpoint}/${row._id}/analyses`
      );
      applyAnalysis(row._id, started);
      const jobId = started.jobId;
      if (!jobId) {
        throw new Error('Analysis job did not start.');
      }
      const pollStarted = Date.now();
      let latest = started;
      while (analyzeCancelRef.current.fileId === row._id) {
        const status = String(latest.status || '').toLowerCase();
        if (status === 'succeeded' || status === 'failed') break;
        if (Date.now() - pollStarted >= ANALYSIS_TIMEOUT_MS) {
          throw new Error('Analysis timed out. Try again in a moment.');
        }
        await sleep(ANALYSIS_POLL_MS);
        if (analyzeCancelRef.current.fileId !== row._id) return;
        latest = await apiGet<FileAnalysisResponse>(
          `${listEndpoint}/${row._id}/analyses/${encodeURIComponent(jobId)}`
        );
        applyAnalysis(row._id, latest);
      }
      if (analyzeCancelRef.current.fileId !== row._id) return;
      const status = String(latest.status || '').toLowerCase();
      if (status === 'failed') {
        pushToast({
          tone: 'error',
          title: 'Summary failed',
          message: latest.error || 'Document analysis failed.',
        });
      } else if (status === 'succeeded') {
        pushToast({
          tone: 'success',
          title: 'Summary ready',
          message: row.displayName,
        });
      }
    } catch (err) {
      if (analyzeCancelRef.current.fileId !== row._id) return;
      pushToast({
        tone: 'error',
        title: 'Summary failed',
        message: err instanceof Error ? err.message : 'Failed to summarize file.',
      });
    } finally {
      if (analyzeCancelRef.current.fileId === row._id) {
        analyzeCancelRef.current.fileId = null;
        setAnalyzingId(null);
      }
    }
  };

  const wrapperClass =
    variant === 'plain'
      ? 'space-y-4'
      : 'space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5';

  return (
    <section className={wrapperClass}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {variant === 'section' ? <h2 className="text-lg font-semibold">{title}</h2> : null}
          <p className="text-sm text-[var(--muted)]">{FILE_TYPES_HINT}</p>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => {
              setAttachOpen((open) => {
                if (open) resetAttachForm();
                return !open;
              });
            }}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent-soft)]/40"
          >
            {attachOpen ? 'Cancel' : 'Attach files'}
          </button>
        ) : null}
      </header>

      {canWrite && attachOpen ? (
        <form onSubmit={handleUpload} className="grid gap-3">
          <Field label="Files">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              onChange={(event) => handleFilesPicked(event.target.files)}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            />
          </Field>
          {drafts.length > 0 ? (
            <ul className="space-y-3">
              {drafts.map((draft, index) => (
                <li key={`${draft.file.name}-${draft.file.size}-${index}`}>
                  <Field label="Display name">
                    <TextInput
                      value={draft.displayName}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDrafts((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, displayName: value } : item))
                        );
                      }}
                      maxLength={255}
                    />
                  </Field>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {draft.file.name} · {formatBytes(draft.file.size)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <Field label="Notes">
            <TextArea
              value={obs}
              onChange={(event) => setObs(event.target.value)}
              placeholder="Optional notes for these files"
              rows={4}
              maxLength={2000}
            />
          </Field>
          <div className="flex flex-wrap justify-end">
            <button
              type="submit"
              disabled={uploading || drafts.length === 0}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {uploading
                ? 'Uploading…'
                : drafts.length > 1
                  ? `Upload ${drafts.length} files`
                  : 'Upload file'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="text-sm text-[var(--muted)]">Loading files…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No files attached yet.</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((row) => (
            <li key={row._id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.displayName}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {row.originalName} · {formatBytes(row.sizeBytes)} · {userLabel(row.uploadedBy)}
                    {row.createdAt ? ` · ${new Date(row.createdAt).toLocaleString()}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownload(row)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40"
                  >
                    Download
                  </button>
                  {enableAnalysis && canWrite && isAnalyzableFile(row) ? (
                    <button
                      type="button"
                      disabled={analyzingId === row._id}
                      onClick={() => void handleAnalyze(row)}
                      className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40 disabled:opacity-60"
                    >
                      {analyzingId === row._id
                        ? 'Analyzing…'
                        : row.analysis?.result
                          ? 'Re-run'
                          : 'Summarize'}
                    </button>
                  ) : null}
                  {enableAnalysis && canWrite && !isAnalyzableFile(row) ? (
                    <button
                      type="button"
                      disabled
                      title="Summarize is available for PDF and Word (DOCX) files."
                      className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] opacity-50"
                    >
                      Summarize
                    </button>
                  ) : null}
                  {canWrite ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row._id);
                          setEditObs(row.obs || '');
                        }}
                        className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40"
                      >
                        Notes
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(row)}
                        className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {row.obs && editingId !== row._id ? (
                <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{row.obs}</p>
              ) : null}
              {enableAnalysis &&
              (row.analysis?.result ||
                row.analysis?.error ||
                analyzingId === row._id ||
                row.analysis?.status === 'queued' ||
                row.analysis?.status === 'running') ? (
                <details
                  open
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {analyzingId === row._id ||
                    row.analysis?.status === 'queued' ||
                    row.analysis?.status === 'running'
                      ? 'Analyzing document…'
                      : row.analysis?.status === 'failed'
                        ? 'Summary failed'
                        : 'Document summary'}
                  </summary>
                  {row.analysis?.error ? (
                    <p className="mt-2 text-sm text-red-700">{row.analysis.error}</p>
                  ) : null}
                  {row.analysis?.result ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
                      {row.analysis.result}
                    </p>
                  ) : null}
                </details>
              ) : null}
              {canWrite && editingId === row._id ? (
                <div className="space-y-2">
                  <Field label="Notes">
                    <TextArea
                      value={editObs}
                      onChange={(event) => setEditObs(event.target.value)}
                      rows={4}
                      maxLength={2000}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={savingObs}
                      onClick={() => void handleSaveObs(row)}
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {savingObs ? 'Saving…' : 'Save notes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent-soft)]/40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Move to recycle bin"
        itemLabel={pendingDelete?.displayName}
        description={
          pendingDelete
            ? `Move “${pendingDelete.displayName}” to the recycle bin? An administrator can restore it later.`
            : undefined
        }
        confirmLabel="Move to bin"
        busy={deleting}
      />
    </section>
  );
}
