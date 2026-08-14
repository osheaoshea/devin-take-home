import Link from 'next/link';

export interface Column<Row> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: Row) => React.ReactNode;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  /** Server-driven state, read from searchParams by the page. */
  sort?: { key: string; direction: 'asc' | 'desc' };
  page?: { index: number; size: number; total: number };
  basePath: string;
  query?: Record<string, string | undefined>;
  rowHref?: (row: Row) => string;
  emptyMessage?: string;
}

function href(
  basePath: string,
  query: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...overrides })) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const search = params.toString();
  return search === '' ? basePath : `${basePath}?${search}`;
}

/** Server-rendered table: sort, filter and page live in the URL, not in client state. */
export function DataTable<Row>({
  columns,
  rows,
  sort,
  page,
  basePath,
  query = {},
  rowHref,
  emptyMessage = 'Nothing to show.',
}: DataTableProps<Row>) {
  const pageCount = page === undefined ? 1 : Math.max(1, Math.ceil(page.total / page.size));
  return (
    <div className="overflow-hidden rounded border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((column) => {
              const nextDirection =
                sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
              return (
                <th key={column.key} className="border-b border-line px-3 py-2 font-medium">
                  {column.sortable === true ? (
                    <Link
                      href={href(basePath, query, {
                        sort: column.key,
                        dir: nextDirection,
                        page: '1',
                      })}
                      className="hover:text-ink"
                    >
                      {column.header}
                      {sort?.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </Link>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-center text-muted" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-b border-line last:border-0 hover:bg-canvas">
                {columns.map((column, columnIndex) => (
                  <td key={column.key} className="px-3 py-2 align-top">
                    {rowHref !== undefined && columnIndex === 0 ? (
                      <Link href={rowHref(row)} className="text-accent underline">
                        {column.render(row)}
                      </Link>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {page !== undefined ? (
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
          <span>
            {page.total} rows · page {page.index} of {pageCount}
          </span>
          <span className="flex gap-3">
            {page.index > 1 ? (
              <Link href={href(basePath, query, { page: String(page.index - 1) })}>Previous</Link>
            ) : null}
            {page.index < pageCount ? (
              <Link href={href(basePath, query, { page: String(page.index + 1) })}>Next</Link>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
