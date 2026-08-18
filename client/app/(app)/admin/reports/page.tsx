"use client";

import { useCallback, useEffect, useState } from 'react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  fetchSampleReports,
  type SampleReportsData,
} from '@/lib/reportsGraphql';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function KindStatCard({
  label,
  buckets,
}: {
  label: string;
  buckets: Array<{ key: string; count: number }>;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:col-span-2 lg:col-span-1">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      {buckets.length === 0 ? (
        <p className="mt-1 text-2xl font-semibold tabular-nums">—</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {buckets.map((bucket) => (
            <li
              key={bucket.key}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate font-medium" title={bucket.key}>
                {bucket.key}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--muted)]">{bucket.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BucketTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="headers-nowrap min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{row.key}</td>
                  <td className="px-4 py-2 tabular-nums">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminReportsSamplePage() {
  const [data, setData] = useState<SampleReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reportPayload = await fetchSampleReports(10);
      setData(reportPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overview = data?.overview;
  const summary = data?.actionLogSummary;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Reports' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Reports sample</h1>
            <p className="mt-2 max-w-2xl text-[var(--muted)]">
              Test screen that queries the FastAPI GraphQL reports service with your session token.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-[var(--muted)]">Loading sample reports…</p>
      ) : null}

      {overview ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Platform overview</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Users" value={overview.users} />
            <StatCard label="Groups" value={overview.groups} />
            <StatCard label="Assets" value={overview.assets} />
            <StatCard label="Permissions" value={overview.permissions} />
            <StatCard label="Action logs" value={overview.actionLogs} />
            <StatCard label="Surveys" value={overview.surveys} />
            <StatCard label="Survey responses" value={overview.surveyResponses} />
            <KindStatCard label="Asset kinds" buckets={overview.assetsByKind} />
          </div>
        </section>
      ) : null}

      {summary ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Action log summary</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total actions" value={summary.total} />
            <StatCard label="Successes" value={summary.successes} />
            <StatCard label="Failures" value={summary.failures} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BucketTable
              title="By resource type"
              rows={summary.byResourceType}
              empty="No action-log resource types yet."
            />
            <BucketTable
              title="By action"
              rows={summary.byAction.slice(0, 15)}
              empty="No actions recorded yet."
            />
          </div>
        </section>
      ) : null}

      {data ? (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-semibold">Top user activity</h2>
          </div>
          {data.userActivity.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">No user activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="headers-nowrap min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">User</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                    <th className="px-4 py-2 font-medium">Success</th>
                    <th className="px-4 py-2 font-medium">Failure</th>
                    <th className="px-4 py-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.userActivity.map((row) => (
                    <tr
                      key={`${row.userId || 'anon'}-${row.username}`}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-2">{row.username}</td>
                      <td className="px-4 py-2 tabular-nums">{row.actions}</td>
                      <td className="px-4 py-2 tabular-nums">{row.successes}</td>
                      <td className="px-4 py-2 tabular-nums">{row.failures}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(row.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="font-semibold">Group membership</h2>
            </div>
            {data.groupMembership.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted)]">No groups found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="headers-nowrap min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-2 font-medium">Group</th>
                      <th className="px-4 py-2 font-medium">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groupMembership.map((group) => (
                      <tr key={group.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-2">
                          <div className="font-medium">{group.name}</div>
                          {group.description ? (
                            <div className="text-xs text-[var(--muted)]">{group.description}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 tabular-nums">{group.memberCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="font-semibold">Assets by type</h2>
            </div>
            {data.assetSummary.byType.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted)]">No assets found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="headers-nowrap min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-2 font-medium">Kind</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assetSummary.byType.map((row) => (
                      <tr
                        key={`${row.kind}-${row.assetType}`}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="px-4 py-2">{row.kind}</td>
                        <td className="px-4 py-2">{row.assetType}</td>
                        <td className="px-4 py-2 tabular-nums">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {data && data.assetSummary.recent.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-semibold">Recent assets</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="headers-nowrap min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.assetSummary.recent.map((asset) => (
                  <tr key={asset.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2">{asset.name}</td>
                    <td className="px-4 py-2">{asset.kind}</td>
                    <td className="px-4 py-2">{asset.assetType}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(asset.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
