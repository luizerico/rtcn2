/**
 * Client helpers for reports analytics.
 * Goes through the same-origin `/api/reports` proxy so the httpOnly session cookie is used.
 */

import { apiGet, apiPost, ApiError } from '@/lib/apiUtils';

export class ReportsError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ReportsError';
  }
}

function toReportsError(err: unknown): ReportsError {
  if (err instanceof ReportsError) return err;
  if (err instanceof ApiError) {
    return new ReportsError(err.message, err.status);
  }
  return new ReportsError(err instanceof Error ? err.message : 'Reports request failed.');
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
  return '/api/reports';
}

export async function checkReportsHealth(): Promise<{
  status: string;
  service?: string;
  database?: string;
}> {
  try {
    return await apiGet('/reports/health');
  } catch (err) {
    throw toReportsError(err);
  }
}

export async function graphqlQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  let payload: GraphqlResponse<T>;
  try {
    payload = await apiPost<GraphqlResponse<T>>('/reports/graphql', { query, variables });
  } catch (err) {
    throw toReportsError(err);
  }

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
