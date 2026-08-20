const FUNDING_RESULT_LABELS: Record<string, string> = {
  summary: 'Summary',
  purpose: 'Purpose',
  eligibility: 'Eligibility',
  dates: 'Dates and deadlines',
  budget: 'Budget and funding',
  submissionMethod: 'Submission method',
  submission: 'Submission method',
  requiredDocuments: 'Required documents',
  restrictions: 'Restrictions or special conditions',
};

const FUNDING_RESULT_ORDER = [
  'summary',
  'purpose',
  'eligibility',
  'dates',
  'budget',
  'submissionMethod',
  'submission',
  'requiredDocuments',
  'restrictions',
];

const IGNORED_RESULT_KEYS = new Set(['response_format', 'responseFormat']);

function labelFor(key: string) {
  if (FUNDING_RESULT_LABELS[key]) return FUNDING_RESULT_LABELS[key];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function AnalysisValue({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="text-[var(--muted)]">—</span>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="whitespace-pre-wrap">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[var(--muted)]">—</span>;
    if (value.every((item) => typeof item !== 'object')) {
      return <span>{value.map((item) => String(item)).join(', ')}</span>;
    }
    return (
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {value.map((item, index) => (
          <li key={index}>
            <AnalysisValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (isPlainObject(value)) {
    return <AnalysisResultView result={value} nested />;
  }
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

export function AnalysisResultView({
  result,
  nested = false,
}: {
  result: unknown;
  nested?: boolean;
}) {
  if (result == null || result === '') return null;
  if (typeof result === 'string') {
    return <p className={`${nested ? '' : 'mt-2 '}whitespace-pre-wrap text-sm text-[var(--muted)]`}>{result}</p>;
  }
  if (
    isPlainObject(result) &&
    result.result != null &&
    (result.response_format != null || result.responseFormat != null)
  ) {
    return <AnalysisResultView result={result.result} nested={nested} />;
  }
  if (!isPlainObject(result)) {
    return (
      <div className={nested ? '' : 'mt-2 text-sm'}>
        <AnalysisValue value={result} />
      </div>
    );
  }

  const keys = Object.keys(result).filter(
    (key) => !IGNORED_RESULT_KEYS.has(key) && result[key] != null && result[key] !== ''
  );
  const ordered = [
    ...FUNDING_RESULT_ORDER.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !FUNDING_RESULT_ORDER.includes(key)),
  ];

  return (
    <dl className={`${nested ? 'mt-1' : 'mt-2'} grid gap-3 text-sm`}>
      {ordered.map((key) => (
        <div key={key}>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{labelFor(key)}</dt>
          <dd className="mt-0.5 text-[var(--foreground)]">
            <AnalysisValue value={result[key]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
