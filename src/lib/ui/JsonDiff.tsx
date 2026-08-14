function stringify(value: unknown): string {
  if (value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Before/after diff for an audit entry: only the fields that actually changed. */
export function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  const beforeRecord = asRecord(before);
  const afterRecord = asRecord(after);
  const keys = [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])].sort();
  const changed = keys.filter(
    (key) => stringify(beforeRecord[key]) !== stringify(afterRecord[key]),
  );

  if (changed.length === 0) {
    return <p className="text-muted">No field-level changes recorded.</p>;
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead className="text-left text-muted">
        <tr>
          <th className="border-b border-line py-1 pr-3 font-medium">Field</th>
          <th className="border-b border-line py-1 pr-3 font-medium">Before</th>
          <th className="border-b border-line py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((key) => (
          <tr key={key} className="align-top">
            <td className="border-b border-line py-1 pr-3 font-mono">{key}</td>
            <td className="border-b border-line py-1 pr-3 font-mono text-red-700">
              {stringify(beforeRecord[key])}
            </td>
            <td className="border-b border-line py-1 font-mono text-green-700">
              {stringify(afterRecord[key])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
