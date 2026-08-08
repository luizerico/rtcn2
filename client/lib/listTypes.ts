export interface ListPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export interface ListSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface PaginatedList<T> {
  items: T[];
  pagination: ListPagination;
  sort: ListSort;
}

export function buildListParams(options: {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  filters: Record<string, string>;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(options.page));
  params.set('limit', String(options.limit));
  params.set('sort', options.sort);
  params.set('order', options.order);
  for (const [key, value] of Object.entries(options.filters)) {
    if (value) params.set(key, value);
  }
  return params;
}
