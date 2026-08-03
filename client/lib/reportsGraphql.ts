/**
 * Client helpers for the FastAPI GraphQL reports service.
 * Defaults to http://localhost:8000 when NEXT_PUBLIC_REPORTS_URL is unset.
 */

const REPORTS_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_REPORTS_URL) ||
  'http://localhost:8000';

export class ReportsError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ReportsError';
  }
}

function reportsUrl(path: string): string {
  const base = REPORTS_BASE.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

export type CountBucket = { key: string; count: number };

export type OverviewReport = {
  users: number;
  groups: number;
  assets: number;
  permissions: number;
  actionLogs: number;
  surveys: number;
  surveyResponses: number;
  assetsByKind: CountBucket[];
};

export type ActionLogSummaryReport = {
  total: number;
  successes: number;
  failures: number;
  byResourceType: CountBucket[];
  byAction: CountBucket[];
};

export type UserActivityRow = {
  userId: string | null;
  username: string;
  actions: number;
  successes: number;
  failures: number;
  lastSeenAt: string | null;
};

export type GroupMembershipRow = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  createdAt: string | null;
};

export type AssetTypeCount = {
  kind: string;
  assetType: string;
  count: number;
};

export type RecentAsset = {
  id: string;
  name: string;
  kind: string;
  assetType: string;
  createdAt: string | null;
  ownerId: string | null;
};

export type AssetSummaryReport = {
  byType: AssetTypeCount[];
  recent: RecentAsset[];
};

export type SampleReportsData = {
  overview: OverviewReport;
  actionLogSummary: ActionLogSummaryReport;
  userActivity: UserActivityRow[];
  groupMembership: GroupMembershipRow[];
  assetSummary: AssetSummaryReport;
};

const SAMPLE_REPORTS_QUERY = `
  query SampleReports($activityLimit: Int!) {
    overview {
      users
      groups
      assets
      permissions
      actionLogs
      surveys
      surveyResponses
      assetsByKind {
        key
        count
      }
    }
    actionLogSummary {
      total
      successes
      failures
      byResourceType {
        key
        count
      }
      byAction {
        key
        count
      }
    }
    userActivity(limit: $activityLimit) {
      userId
      username
      actions
      successes
      failures
      lastSeenAt
    }
    groupMembership {
      id
      name
      description
      memberCount
      createdAt
    }
    assetSummary {
      byType {
        kind
        assetType
        count
      }
      recent {
        id
        name
        kind
        assetType
        createdAt
        ownerId
      }
    }
  }
`;

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

export function getReportsBaseUrl(): string {
  return REPORTS_BASE.replace(/\/$/, '');
}

export async function checkReportsHealth(): Promise<{
  status: string;
  service?: string;
  database?: string;
}> {
  const res = await fetch(reportsUrl('/health'), { method: 'GET' });
  if (!res.ok) {
    throw new ReportsError(`Reports health check failed (${res.status})`, res.status);
  }
  return res.json();
}

export async function graphqlQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(reportsUrl('/graphql'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ReportsError(
      `Cannot reach reports service at ${getReportsBaseUrl()}. Is the reports container running?`
    );
  }

  if (!res.ok) {
    let detail = `Reports GraphQL request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string; message?: string };
      detail = body.detail || body.message || detail;
    } catch {
      // keep default
    }
    throw new ReportsError(detail, res.status);
  }

  const payload = (await res.json()) as GraphqlResponse<T>;
  if (payload.errors?.length) {
    throw new ReportsError(payload.errors.map((e) => e.message).join('; '));
  }
  if (!payload.data) {
    throw new ReportsError('Reports GraphQL response contained no data.');
  }
  return payload.data;
}

export async function fetchSampleReports(activityLimit = 10): Promise<SampleReportsData> {
  return graphqlQuery<SampleReportsData>(SAMPLE_REPORTS_QUERY, { activityLimit });
}
