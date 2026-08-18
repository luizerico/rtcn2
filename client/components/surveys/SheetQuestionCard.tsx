"use client";

import { AccessIconButton } from '@/components/ui/TableActionIcon';

export type SheetQuestionType = 'score' | 'text' | 'multiple_choice' | 'yes_no';

export type SheetQuestion = {
  questionId: string;
  code?: string;
  area?: string;
  prompt: string;
  type: SheetQuestionType;
  options?: string[];
  required: boolean;
  evidence?: string;
  maxPoints?: number;
};

type SheetQuestionCardProps = {
  question: SheetQuestion;
  index?: number;
  showIndex?: boolean;
  value: string;
  canWrite: boolean;
  requiredNow: boolean;
  noteCount: number;
  fileCount: number;
  sheetSaved: boolean;
  onChange: (value: string) => void;
  onNotes: () => void;
  onFiles: () => void;
};

function AnswerControl({
  question,
  value,
  canWrite,
  requiredNow,
  onChange,
}: Pick<SheetQuestionCardProps, 'question' | 'value' | 'canWrite' | 'requiredNow' | 'onChange'>) {
  if (question.type === 'score') {
    return (
      <input
        type="number"
        min={0}
        max={question.maxPoints || 0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={requiredNow}
        disabled={!canWrite}
        className="w-full max-w-[8rem] rounded-md border border-[var(--border)] px-3 py-2 sm:ml-auto"
      />
    );
  }
  if (question.type === 'text') {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={requiredNow}
        disabled={!canWrite}
        rows={3}
        className="w-full rounded-md border border-[var(--border)] px-3 py-2 sm:min-w-[16rem]"
      />
    );
  }
  const options = question.type === 'yes_no' ? ['Yes', 'No'] : question.options || [];
  return (
    <div className="flex w-full shrink-0 flex-col items-end gap-2 sm:min-w-[12rem]">
      {options.map((option) => (
        <label key={option} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={question.questionId}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            required={requiredNow}
            disabled={!canWrite}
          />
          {option}
        </label>
      ))}
    </div>
  );
}

export default function SheetQuestionCard({
  question,
  index,
  showIndex = false,
  value,
  canWrite,
  requiredNow,
  noteCount,
  fileCount,
  sheetSaved,
  onChange,
  onNotes,
  onFiles,
}: SheetQuestionCardProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-4" role="group" aria-labelledby={`q-${question.questionId}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 id={`q-${question.questionId}`} className="text-sm font-medium">
            {showIndex && index != null ? `${index + 1}. ` : ''}
            {question.code ? `${question.code} · ` : ''}
            {question.prompt}
            {question.required ? ' *' : ''}
          </h3>
          {question.evidence ? (
            <p className="mt-1 text-sm italic text-[var(--muted)]">{question.evidence}</p>
          ) : null}
        </div>
        <div className="flex w-full shrink-0 flex-col items-end gap-2 sm:w-auto sm:min-w-[12rem]">
          <AnswerControl
            question={question}
            value={value}
            canWrite={canWrite}
            requiredNow={requiredNow}
            onChange={onChange}
          />
          <div className="flex items-center justify-end gap-1">
            <span className="relative inline-flex">
              <AccessIconButton
                allowed
                type="button"
                icon="notes"
                label={noteCount ? 'Edit notes' : 'Add notes'}
                onClick={onNotes}
              />
              {noteCount ? (
                <span className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--accent)]" />
              ) : null}
            </span>
            <span className="relative inline-flex">
              <AccessIconButton
                allowed
                type="button"
                icon="attach"
                label={
                  sheetSaved
                    ? fileCount
                      ? `Evidence files (${fileCount})`
                      : 'Upload evidence'
                    : 'Save the sheet before attaching files'
                }
                onClick={onFiles}
              />
              {fileCount ? (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
                  {fileCount > 9 ? '9+' : fileCount}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function questionAnswered(value: string | number | undefined) {
  return value != null && String(value).trim() !== '';
}

export function groupQuestionsByArea<T extends { area?: string }>(questions: T[]) {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const question of questions) {
    const key = (question.area || '').trim() || 'General';
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(question);
  }
  return order.map((id) => ({ id, label: id, questions: groups.get(id) || [] }));
}
