"use client";

import type { Level, PlanEntry, YesNo } from '@/lib/localPlan';
import { formatPriority, priorityClass } from '@/lib/localPlan';

export type PlanViewMode = 'technical' | 'government';

const LEVEL_OPTIONS: Level[] = ['low', 'medium', 'high'];
const YES_OPTIONS: YesNo[] = ['yes', 'no'];

function SelectField<T extends string>({
  value,
  options,
  disabled,
  onChange,
  labels,
}: {
  value: T;
  options: T[];
  disabled?: boolean;
  onChange: (value: T) => void;
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      className="w-full min-w-[6.5rem] rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:opacity-60"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] || option[0].toUpperCase() + option.slice(1)}
        </option>
      ))}
    </select>
  );
}

type LocalPlanTableProps = {
  entries: PlanEntry[];
  mode: PlanViewMode;
  canWrite: boolean;
  onPatch: (questionId: string, patch: Partial<PlanEntry>) => void;
};

export default function LocalPlanTable({ entries, mode, canWrite, onPatch }: LocalPlanTableProps) {
  if (!entries.length) {
    return (
      <p className="rounded-lg border border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
        No codes in this area.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--accent-soft)]/40 text-xs uppercase tracking-wide text-[var(--muted)]">
          {mode === 'technical' ? (
            <tr>
              <th className="px-3 py-2" rowSpan={2}>
                Code
              </th>
              <th className="px-3 py-2" rowSpan={2}>
                What needs to be done
              </th>
              <th className="px-3 py-2 text-center" colSpan={3}>
                Opportunities
              </th>
              <th className="px-3 py-2 text-center" colSpan={2}>
                Complexity
              </th>
              <th className="px-3 py-2" rowSpan={2}>
                Mandatory
              </th>
              <th className="px-3 py-2" rowSpan={2}>
                Technical priority
              </th>
            </tr>
          ) : (
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">What needs to be done</th>
              <th className="px-3 py-2">Financial capacity</th>
              <th className="px-3 py-2">Planning capacity</th>
              <th className="px-3 py-2">Inter-municipal cooperation</th>
              <th className="px-3 py-2">Local agenda</th>
              <th className="px-3 py-2">Priority</th>
            </tr>
          )}
          {mode === 'technical' ? (
            <tr>
              <th className="px-3 py-2">Federal</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Partnerships</th>
              <th className="px-3 py-2">Administrative</th>
              <th className="px-3 py-2">Financial</th>
            </tr>
          ) : null}
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.questionId} className="border-t border-[var(--border)]">
              <td className="whitespace-nowrap px-3 py-2 font-medium">{entry.code}</td>
              <td className="max-w-sm px-3 py-2">{entry.todo || '—'}</td>
              {mode === 'technical' ? (
                <>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.technical.opportunities.federal}
                      options={YES_OPTIONS}
                      disabled={!canWrite}
                      onChange={(federal) =>
                        onPatch(entry.questionId, {
                          technical: {
                            ...entry.technical,
                            opportunities: { ...entry.technical.opportunities, federal },
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.technical.opportunities.state}
                      options={YES_OPTIONS}
                      disabled={!canWrite}
                      onChange={(state) =>
                        onPatch(entry.questionId, {
                          technical: {
                            ...entry.technical,
                            opportunities: { ...entry.technical.opportunities, state },
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.technical.opportunities.partners}
                      options={YES_OPTIONS}
                      disabled={!canWrite}
                      onChange={(partners) =>
                        onPatch(entry.questionId, {
                          technical: {
                            ...entry.technical,
                            opportunities: { ...entry.technical.opportunities, partners },
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.technical.complexity.administrative}
                      options={LEVEL_OPTIONS}
                      disabled={!canWrite}
                      onChange={(administrative) =>
                        onPatch(entry.questionId, {
                          technical: {
                            ...entry.technical,
                            complexity: { ...entry.technical.complexity, administrative },
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.technical.complexity.financial}
                      options={LEVEL_OPTIONS}
                      disabled={!canWrite}
                      onChange={(financial) =>
                        onPatch(entry.questionId, {
                          technical: {
                            ...entry.technical,
                            complexity: { ...entry.technical.complexity, financial },
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entry.technical.isMandatory}
                        disabled={!canWrite}
                        onChange={(event) =>
                          onPatch(entry.questionId, {
                            technical: { ...entry.technical, isMandatory: event.target.checked },
                          })
                        }
                      />
                      {entry.technical.isMandatory ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(
                        entry.technicalPriority.term
                      )}`}
                    >
                      {formatPriority(entry.technicalPriority)}
                    </span>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.consultant.financialCapacity}
                      options={LEVEL_OPTIONS}
                      disabled={!canWrite}
                      onChange={(financialCapacity) =>
                        onPatch(entry.questionId, {
                          consultant: { ...entry.consultant, financialCapacity },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.consultant.planCapacity}
                      options={LEVEL_OPTIONS}
                      disabled={!canWrite}
                      onChange={(planCapacity) =>
                        onPatch(entry.questionId, {
                          consultant: { ...entry.consultant, planCapacity },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectField
                      value={entry.consultant.interCooperation}
                      options={LEVEL_OPTIONS}
                      disabled={!canWrite}
                      onChange={(interCooperation) =>
                        onPatch(entry.questionId, {
                          consultant: { ...entry.consultant, interCooperation },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entry.isLocalAgenda}
                        disabled={!canWrite}
                        onChange={(event) =>
                          onPatch(entry.questionId, { isLocalAgenda: event.target.checked })
                        }
                      />
                      {entry.isLocalAgenda ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(
                        entry.governmentPriority.term
                      )}`}
                    >
                      {formatPriority(entry.governmentPriority)}
                    </span>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
