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
  ANALYSIS_POLL_INITIAL_MS,
  formatBytes,
  isAnalyzableFile,
  isInFlightAnalysis,
  isTerminalAnalysis,
  nextAnalysisPollDelay,
  userLabel,
  type FileAnalysisRecord,
  type StoredFileRecord,
} from '@/lib/storedFileTypes';
import { AnalysisResultView } from '@/components/files/AnalysisResultView';

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
  summary: FileAnalysisRecord['result'];
  responseFormat?: string | null;
  statusSummary?: string | null;
  error: string | null;
  model: string | null;
  requestedAt?: string | null;
  completedAt?: string | null;
  progressStep?: string | null;
  progressCompleted?: number | null;
  progressTotal?: number | null;
  queuePosition?: number | null;
  file?: StoredFileRecord;
};

type AnalysisPoll = {
  fileId: string;
  jobId: string;
  delayMs: number;
  timer: ReturnType<typeof window.setTimeout> | null;
  request: Promise<void> | null;
};

function toFileAnalysis(response: FileAnalysisResponse): FileAnalysisRecord {
  return {
    jobId: response.jobId,
    status: response.status,
    result: response.summary,
    error: response.error,
    model: response.model,
    requestedAt: response.requestedAt,
    completedAt: response.completedAt,
    statusSummary: response.statusSummary || null,
    progressStep: response.progressStep || null,
    progressCompleted: response.progressCompleted ?? null,
    progressTotal: response.progressTotal ?? null,
    queuePosition: response.queuePosition ?? null,
  };
}

function isNotInQueueMessage(message?: string | null) {
  return String(message || '').toLowerCase().includes('not in the analysis queue');
}

function analysisErrorToast(message?: string | null) {
  const text = message || 'Document analysis failed.';
  return {
    tone: 'error' as const,
    title: isNotInQueueMessage(text) ? 'Not in queue' : 'Summary failed',
    message: text,
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
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;
  const listEndpointRef = useRef(listEndpoint);
  listEndpointRef.current = listEndpoint;
  const itemsRef = useRef<StoredFileRecord[]>([]);
  const pollsRef = useRef(new Map<string, AnalysisPoll>());
  const [items, setItems] = useState<StoredFileRecord[]>([]);
  itemsRef.current = items;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyByFileId, setBusyByFileId] = useState<Record<string, 'starting' | 'checking' | 'cancelling'>>(
    {}
  );
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
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    void load();
  }, [load]);

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
      itemsRef.current = next;
      return next;
    });
    return analysis;
  };

  const setFileBusy = (fileId: string, busy: 'starting' | 'checking' | 'cancelling' | null) => {
    setBusyByFileId((prev) => {
      if (!busy) {
        if (!(fileId in prev)) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      }
      return { ...prev, [fileId]: busy };
    });
  };

  const stopAnalysisPoll = (jobId: string) => {
    const poll = pollsRef.current.get(jobId);
    if (poll?.timer) window.clearTimeout(poll.timer);
    pollsRef.current.delete(jobId);
  };

  const scheduleAnalysisPoll = (fileId: string, jobId: string, delayMs: number) => {
    const current = pollsRef.current.get(jobId) || {
      fileId,
      jobId,
      delayMs,
      timer: null,
      request: null,
    };
    if (current.timer) window.clearTimeout(current.timer);
    current.fileId = fileId;
    current.delayMs = delayMs;
    current.timer = window.setTimeout(() => {
      void refreshAnalysis(fileId, jobId, { manual: false });
    }, delayMs);
    pollsRef.current.set(jobId, current);
  };

  const announceAnalysis = (fileId: string, latest: FileAnalysisResponse) => {
    const status = String(latest.status || '').toLowerCase();
    const row = itemsRef.current.find((item) => item._id === fileId);
    if (status === 'failed') {
      pushToastRef.current(
        analysisErrorToast(latest.statusSummary || latest.error || 'Document analysis failed.')
      );
    } else if (status === 'succeeded') {
      pushToastRef.current({
        tone: 'success',
        title: 'Summary ready',
        message: latest.statusSummary || row?.displayName || 'Document summary is ready.',
      });
    } else if (status === 'cancelled') {
      pushToastRef.current({
        tone: 'info',
        title: 'Summary cancelled',
        message: latest.statusSummary || 'Document analysis was cancelled.',
      });
    }
  };

  const refreshAnalysis = async (
    fileId: string,
    jobId: string,
    { manual }: { manual: boolean }
  ) => {
    const existing = pollsRef.current.get(jobId);
    if (existing?.request) {
      await existing.request;
      return;
    }

    if (manual) setFileBusy(fileId, 'checking');

    const run = (async () => {
      try {
        const latest = await apiGet<FileAnalysisResponse>(
          `${listEndpointRef.current}/${fileId}/analyses/${encodeURIComponent(jobId)}`
        );
        applyAnalysis(fileId, latest);
        const status = String(latest.status || '').toLowerCase();
        if (isTerminalAnalysis(status)) {
          stopAnalysisPoll(jobId);
          announceAnalysis(fileId, latest);
          return;
        }
        const poll = pollsRef.current.get(jobId);
        const delay = nextAnalysisPollDelay(poll?.delayMs || ANALYSIS_POLL_INITIAL_MS, false);
        scheduleAnalysisPoll(fileId, jobId, delay);
      } catch (err) {
        const poll = pollsRef.current.get(jobId);
        const delay = nextAnalysisPollDelay(poll?.delayMs || ANALYSIS_POLL_INITIAL_MS, true);
        if (isInFlightAnalysis(itemsRef.current.find((item) => item._id === fileId)?.analysis?.status)) {
          scheduleAnalysisPoll(fileId, jobId, delay);
        }
        if (manual) {
          pushToastRef.current({
            tone: 'error',
            title: 'Status check failed',
            message: err instanceof Error ? err.message : 'Failed to check analysis status.',
          });
        }
      }
    })();

    const poll = pollsRef.current.get(jobId) || {
      fileId,
      jobId,
      delayMs: ANALYSIS_POLL_INITIAL_MS,
      timer: null,
      request: null,
    };
    poll.request = run;
    pollsRef.current.set(jobId, poll);
    try {
      await run;
    } finally {
      const current = pollsRef.current.get(jobId);
      if (current) current.request = null;
      if (manual) setFileBusy(fileId, null);
    }
  };

  const beginAnalysisPoll = (fileId: string, jobId: string) => {
    if (pollsRef.current.has(jobId)) return;
    pollsRef.current.set(jobId, {
      fileId,
      jobId,
      delayMs: ANALYSIS_POLL_INITIAL_MS,
      timer: null,
      request: null,
    });
    scheduleAnalysisPoll(fileId, jobId, ANALYSIS_POLL_INITIAL_MS);
  };

  const handleAnalyze = async (row: StoredFileRecord) => {
    if (isInFlightAnalysis(row.analysis?.status) && row.analysis?.jobId) {
      await refreshAnalysis(row._id, row.analysis.jobId, { manual: true });
      return;
    }
    setFileBusy(row._id, 'starting');
    try {
      const started = await apiPost<FileAnalysisResponse>(`${listEndpoint}/${row._id}/analyses`);
      applyAnalysis(row._id, started);
      const status = String(started.status || '').toLowerCase();
      if (isTerminalAnalysis(status)) {
        announceAnalysis(row._id, started);
        return;
      }
      const jobId = started.jobId;
      if (!jobId) {
        throw new Error('Analysis job did not start.');
      }
      beginAnalysisPoll(row._id, jobId);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Summary failed',
        message: err instanceof Error ? err.message : 'Failed to summarize file.',
      });
    } finally {
      setFileBusy(row._id, null);
    }
  };

  const handleCheckStatus = async (row: StoredFileRecord) => {
    const jobId = row.analysis?.jobId;
    if (!jobId || isTerminalAnalysis(row.analysis?.status)) return;
    await refreshAnalysis(row._id, jobId, { manual: true });
  };

  const handleCancelAnalysis = async (row: StoredFileRecord) => {
    const jobId = row.analysis?.jobId;
    if (!jobId || isTerminalAnalysis(row.analysis?.status)) return;
    stopAnalysisPoll(jobId);
    setFileBusy(row._id, 'cancelling');
    try {
      const cancelled = await apiPost<FileAnalysisResponse>(
        `${listEndpoint}/${row._id}/analyses/${encodeURIComponent(jobId)}/cancel`
      );
      applyAnalysis(row._id, cancelled);
      const status = String(cancelled.status || '').toLowerCase();
      if (status === 'cancelled') {
        pushToast({
          tone: 'info',
          title: 'Summary cancelled',
          message: cancelled.statusSummary || 'Document analysis was cancelled.',
        });
        return;
      }
      if (isTerminalAnalysis(status)) {
        announceAnalysis(row._id, cancelled);
        return;
      }
      beginAnalysisPoll(row._id, jobId);
    } catch (err) {
      beginAnalysisPoll(row._id, jobId);
      pushToast({
        tone: 'error',
        title: 'Cancel failed',
        message: err instanceof Error ? err.message : 'Failed to cancel analysis.',
      });
    } finally {
      setFileBusy(row._id, null);
    }
  };

  useEffect(() => {
    if (!enableAnalysis) return;
    for (const row of items) {
      const jobId = row.analysis?.jobId;
      if (!isInFlightAnalysis(row.analysis?.status) || !jobId) continue;
      beginAnalysisPoll(row._id, jobId);
    }
  }, [enableAnalysis, items]);

  useEffect(() => {
    return () => {
      for (const poll of pollsRef.current.values()) {
        if (poll.timer) window.clearTimeout(poll.timer);
      }
      pollsRef.current.clear();
    };
  }, []);

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
                  {enableAnalysis && isInFlightAnalysis(row.analysis?.status) && row.analysis?.jobId ? (
                    <>
                      <button
                        type="button"
                        disabled={busyByFileId[row._id] === 'checking'}
                        onClick={() => void handleCheckStatus(row)}
                        className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40 disabled:opacity-60"
                      >
                        {busyByFileId[row._id] === 'checking' ? 'Checking…' : 'Check status'}
                      </button>
                      {canWrite ? (
                        <button
                          type="button"
                          disabled={busyByFileId[row._id] === 'cancelling'}
                          onClick={() => void handleCancelAnalysis(row)}
                          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {busyByFileId[row._id] === 'cancelling' ? 'Cancelling…' : 'Cancel'}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {enableAnalysis &&
                  canWrite &&
                  isAnalyzableFile(row) &&
                  !isInFlightAnalysis(row.analysis?.status) ? (
                    <button
                      type="button"
                      disabled={busyByFileId[row._id] === 'starting'}
                      onClick={() => void handleAnalyze(row)}
                      className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40 disabled:opacity-60"
                    >
                      {busyByFileId[row._id] === 'starting'
                        ? 'Starting…'
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
                row.analysis?.statusSummary ||
                busyByFileId[row._id] ||
                isInFlightAnalysis(row.analysis?.status)) ? (
                <details
                  open
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {isInFlightAnalysis(row.analysis?.status)
                      ? row.analysis?.statusSummary || 'Analyzing document…'
                      : row.analysis?.status === 'failed'
                        ? isNotInQueueMessage(row.analysis?.error || row.analysis?.statusSummary)
                          ? 'Not in queue'
                          : 'Summary failed'
                        : row.analysis?.status === 'cancelled'
                          ? 'Summary cancelled'
                          : 'Document summary'}
                  </summary>
                  {isInFlightAnalysis(row.analysis?.status) && row.analysis?.statusSummary ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">{row.analysis.statusSummary}</p>
                  ) : null}
                  {row.analysis?.status === 'queued' && row.analysis?.queuePosition != null ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Queue position {row.analysis.queuePosition}
                    </p>
                  ) : null}
                  {row.analysis?.progressTotal ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Step {row.analysis.progressCompleted || 0} of {row.analysis.progressTotal}
                      {row.analysis.progressStep ? ` · ${row.analysis.progressStep}` : ''}
                    </p>
                  ) : null}
                  {row.analysis?.error ? (
                    <p className="mt-2 text-sm text-red-700">{row.analysis.error}</p>
                  ) : null}
                  {row.analysis?.result ? <AnalysisResultView result={row.analysis.result} /> : null}
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
