// The one-line result summary between the toolbar and the table.

interface Props {
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
  total: number;
  q: string;
}

export function StatusLine(
  { error, isPending, isFetching, total, q }: Props,
) {
  let content;
  if (error) {
    content = <span class="error">{String(error)}</span>;
  } else if (isPending) {
    content = "Loading…";
  } else {
    content = (
      <>
        {total.toLocaleString()} message{total === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : ""}
        {isFetching ? " · updating…" : ""}
      </>
    );
  }

  return <p class="status" aria-live="polite">{content}</p>;
}
