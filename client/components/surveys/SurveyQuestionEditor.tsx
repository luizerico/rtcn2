"use client";

import { useState, type ReactNode, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';

export type QuestionType = 'score' | 'text' | 'multiple_choice' | 'yes_no';

export type SurveyQuestionDraft = {
  key: string;
  _id?: string;
  code: string;
  area: string;
  prompt: string;
  type: QuestionType;
  optionsText: string;
  required: boolean;
  evidence: string;
  criteria: string;
  maxPoints: string;
  weight: string;
  todo: string;
};

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'score', label: 'Score' },
];

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = Object.fromEntries(
  QUESTION_TYPES.map((row) => [row.value, row.label])
) as Record<QuestionType, string>;

const fieldClass = 'w-full rounded-md border border-[var(--border)] px-3 py-2';
const iconBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40';

function questionDeleteLabel(question: SurveyQuestionDraft): string {
  const prompt = question.prompt.trim();
  const code = question.code.trim();
  const preview = prompt.length > 80 ? `${prompt.slice(0, 77).trimEnd()}…` : prompt;
  if (code && preview) return `${code} — ${preview}`;
  return preview || code || 'this question';
}

export function emptyQuestionDraft(): SurveyQuestionDraft {
  return {
    key: crypto.randomUUID(),
    code: '',
    area: '',
    prompt: '',
    type: 'text',
    optionsText: '',
    required: true,
    evidence: '',
    criteria: '',
    maxPoints: '',
    weight: '1',
    todo: '',
  };
}

export function questionFromApi(row: {
  _id?: string;
  questionId?: string;
  code?: string;
  area?: string;
  prompt: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  evidence?: string;
  criteria?: string;
  maxPoints?: number;
  weight?: number;
  todo?: string;
}): SurveyQuestionDraft {
  const id = row.questionId || row._id;
  return {
    key: id || crypto.randomUUID(),
    _id: id,
    code: row.code || '',
    area: row.area || '',
    prompt: row.prompt || '',
    type: row.type,
    optionsText: (row.options || []).join('\n'),
    required: row.required !== false,
    evidence: row.evidence || '',
    criteria: row.criteria || '',
    maxPoints: row.maxPoints != null ? String(row.maxPoints) : '',
    weight: row.weight != null ? String(row.weight) : '1',
    todo: row.todo || '',
  };
}

export function questionsToApiPayload(questions: SurveyQuestionDraft[]) {
  return questions.map((question) => ({
    ...(question._id ? { _id: question._id, questionId: question._id } : {}),
    code: question.code.trim() || undefined,
    area: question.area.trim(),
    prompt: question.prompt.trim(),
    type: question.type,
    required: question.required,
    evidence: question.evidence.trim(),
    criteria: question.criteria.trim(),
    todo: question.todo.trim(),
    maxPoints: question.type === 'score' && question.maxPoints ? Number(question.maxPoints) : undefined,
    weight: question.type === 'score' && question.weight ? Number(question.weight) : undefined,
    options:
      question.type === 'multiple_choice'
        ? question.optionsText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : undefined,
  }));
}

function Field({
  id,
  label,
  children,
  className = '',
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
      {...props}
    >
      {children}
    </svg>
  );
}

function GripIcon() {
  return (
    <Icon>
      <circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <Icon className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

function ArrowUpIcon() {
  return (
    <Icon>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </Icon>
  );
}

function ArrowDownIcon() {
  return (
    <Icon>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </Icon>
  );
}

function UnfoldMoreIcon() {
  return (
    <Icon>
      <path d="M12 5.8L15.2 9l1.4-1.4L12 3 7.4 7.6 8.8 9 12 5.8z" />
      <path d="M12 18.2L8.8 15l-1.4 1.4L12 21l4.6-4.6L15.2 15 12 18.2z" />
    </Icon>
  );
}

function UnfoldLessIcon() {
  return (
    <Icon>
      <path d="M7.4 18.6L8.8 20 12 16.8 15.2 20l1.4-1.4L12 14l-4.6 4.6z" />
      <path d="M16.6 5.4L15.2 4 12 7.2 8.8 4 7.4 5.4 12 10l4.6-4.6z" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  );
}

function questionSummary(question: SurveyQuestionDraft) {
  const prompt = question.prompt.trim();
  const code = question.code.trim();
  const parts = [
    code || null,
    prompt || 'Untitled question',
    QUESTION_TYPE_LABEL[question.type],
  ].filter(Boolean);
  return parts.join(' · ');
}

type SurveyQuestionEditorProps = {
  questions: SurveyQuestionDraft[];
  onChange: (next: SurveyQuestionDraft[]) => void;
  disabled?: boolean;
  collapseToggleHost?: HTMLElement | null;
};

export default function SurveyQuestionEditor({
  questions,
  onChange,
  disabled = false,
  collapseToggleHost = null,
}: SurveyQuestionEditorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  const update = (key: string, patch: Partial<SurveyQuestionDraft>) => {
    onChange(questions.map((question) => (question.key === key ? { ...question, ...patch } : question)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const next = [...questions];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  };

  const reorderByKey = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const from = questions.findIndex((row) => row.key === fromKey);
    const to = questions.findIndex((row) => row.key === toKey);
    if (from < 0 || to < 0) return;
    const next = [...questions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const toggleCollapsed = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addQuestion = () => {
    const created = emptyQuestionDraft();
    setExpanded((prev) => new Set(prev).add(created.key));
    onChange([...questions, created]);
  };

  const pendingDelete = questions.find((question) => question.key === pendingDeleteKey) ?? null;

  const confirmDeleteQuestion = () => {
    if (!pendingDeleteKey) return;
    const key = pendingDeleteKey;
    setPendingDeleteKey(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    onChange(questions.filter((row) => row.key !== key));
  };

  const allCollapsed = questions.length > 0 && questions.every((question) => !expanded.has(question.key));

  const toggleAll = () => {
    if (allCollapsed) {
      setExpanded(new Set(questions.map((question) => question.key)));
      return;
    }
    setExpanded(new Set());
  };

  return (
    <div className="space-y-4">
      {collapseToggleHost && questions.length > 0
        ? createPortal(
            <button
              type="button"
              onClick={toggleAll}
              title={allCollapsed ? 'Expand all questions' : 'Collapse all questions'}
              aria-label={allCollapsed ? 'Expand all questions' : 'Collapse all questions'}
              aria-expanded={!allCollapsed}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              {allCollapsed ? <UnfoldMoreIcon /> : <UnfoldLessIcon />}
            </button>,
            collapseToggleHost
          )
        : null}
      {questions.map((question, index) => {
        const open = expanded.has(question.key);
        const isOver = overKey === question.key && dragKey !== question.key;
        return (
          <div
            key={question.key}
            onDragOver={(event) => {
              if (disabled || !dragKey) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (overKey !== question.key) setOverKey(question.key);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const fromKey = event.dataTransfer.getData('text/plain') || dragKey;
              if (fromKey) reorderByKey(fromKey, question.key);
              setDragKey(null);
              setOverKey(null);
            }}
            onDragEnd={() => {
              setDragKey(null);
              setOverKey(null);
            }}
            className={`rounded-lg border p-4 ${
              isOver ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40' : 'border-[var(--border)]'
            } ${dragKey === question.key ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start gap-2">
              <div
                draggable={!disabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', question.key);
                  setDragKey(question.key);
                }}
                title="Drag to reorder"
                className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] ${
                  disabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing hover:bg-[var(--accent-soft)]'
                }`}
              >
                <GripIcon />
              </div>

              <button
                type="button"
                onClick={() => toggleCollapsed(question.key)}
                title={open ? 'Hide question fields' : 'Show question fields'}
                aria-expanded={open}
                aria-controls={`question-fields-${question.key}`}
                className={iconBtnClass}
              >
                <ChevronIcon open={open} />
                <span className="sr-only">{open ? 'Collapse question' : 'Expand question'}</span>
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Question {index + 1}</p>
                {!open ? (
                  <p className="truncate text-sm text-[var(--muted)]">{questionSummary(question)}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  title="Move up"
                  aria-label="Move question up"
                  className={iconBtnClass}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === questions.length - 1}
                  onClick={() => move(index, 1)}
                  title="Move down"
                  aria-label="Move question down"
                  className={iconBtnClass}
                >
                  <ArrowDownIcon />
                </button>
                {questions.length > 1 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setPendingDeleteKey(question.key)}
                    title="Remove question"
                    aria-label="Remove question"
                    className={`${iconBtnClass} text-[var(--danger)] hover:bg-red-50`}
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            </div>

            {open ? (
              <div id={`question-fields-${question.key}`} className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field id={`${question.key}-code`} label="Code">
                    <input
                      id={`${question.key}-code`}
                      value={question.code}
                      onChange={(e) => update(question.key, { code: e.target.value })}
                      placeholder="Optional"
                      disabled={disabled}
                      className={fieldClass}
                    />
                  </Field>
                  <Field id={`${question.key}-area`} label="Area">
                    <input
                      id={`${question.key}-area`}
                      value={question.area}
                      onChange={(e) => update(question.key, { area: e.target.value })}
                      disabled={disabled}
                      className={fieldClass}
                    />
                  </Field>
                  <Field id={`${question.key}-type`} label="Type">
                    <select
                      id={`${question.key}-type`}
                      value={question.type}
                      onChange={(e) => update(question.key, { type: e.target.value as QuestionType })}
                      disabled={disabled}
                      className={fieldClass}
                    >
                      {QUESTION_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-end gap-2 pb-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={question.required}
                      disabled={disabled}
                      onChange={(e) => update(question.key, { required: e.target.checked })}
                    />
                    Required
                  </label>
                </div>

                <Field id={`${question.key}-prompt`} label="Prompt">
                  <textarea
                    id={`${question.key}-prompt`}
                    value={question.prompt}
                    onChange={(e) => update(question.key, { prompt: e.target.value })}
                    required
                    disabled={disabled}
                    rows={2}
                    className={fieldClass}
                  />
                </Field>

                {question.type === 'multiple_choice' ? (
                  <Field id={`${question.key}-options`} label="Options">
                    <textarea
                      id={`${question.key}-options`}
                      value={question.optionsText}
                      onChange={(e) => update(question.key, { optionsText: e.target.value })}
                      placeholder="One option per line"
                      required
                      disabled={disabled}
                      rows={3}
                      className={fieldClass}
                    />
                  </Field>
                ) : null}

                {question.type === 'score' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id={`${question.key}-maxPoints`} label="Max points">
                      <input
                        id={`${question.key}-maxPoints`}
                        value={question.maxPoints}
                        onChange={(e) => update(question.key, { maxPoints: e.target.value })}
                        disabled={disabled}
                        className={fieldClass}
                      />
                    </Field>
                    <Field id={`${question.key}-weight`} label="Weight">
                      <input
                        id={`${question.key}-weight`}
                        value={question.weight}
                        onChange={(e) => update(question.key, { weight: e.target.value })}
                        disabled={disabled}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id={`${question.key}-evidence`} label="Evidence">
                    <textarea
                      id={`${question.key}-evidence`}
                      value={question.evidence}
                      onChange={(e) => update(question.key, { evidence: e.target.value })}
                      disabled={disabled}
                      rows={2}
                      className={fieldClass}
                    />
                  </Field>
                  <Field id={`${question.key}-criteria`} label="Criteria">
                    <textarea
                      id={`${question.key}-criteria`}
                      value={question.criteria}
                      onChange={(e) => update(question.key, { criteria: e.target.value })}
                      disabled={disabled}
                      rows={2}
                      className={fieldClass}
                    />
                  </Field>
                </div>

                <Field id={`${question.key}-todo`} label="Todo">
                  <textarea
                    id={`${question.key}-todo`}
                    value={question.todo}
                    onChange={(e) => update(question.key, { todo: e.target.value })}
                    disabled={disabled}
                    rows={2}
                    className={fieldClass}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        disabled={disabled}
        onClick={addQuestion}
        className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        Add question
      </button>

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDeleteKey(null)}
        onConfirm={confirmDeleteQuestion}
        title="Remove question"
        itemLabel={pendingDelete ? questionDeleteLabel(pendingDelete) : undefined}
        description={
          pendingDelete
            ? `Remove “${questionDeleteLabel(pendingDelete)}” from this survey?`
            : undefined
        }
        confirmLabel="Remove"
      />
    </div>
  );
}
