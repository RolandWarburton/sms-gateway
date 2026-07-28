// Pager rendering as `1 … 10 11 12 … 999`.

const GAP = "…";

// First page, last page, and the current page with a neighbour either side.
// Ellipses fill any gap wider than one page. With few enough pages this
// naturally degenerates to a plain run of numbers and no ellipsis.
export function pageItems(
  current: number,
  total: number,
): (number | typeof GAP)[] {
  const wanted = [1, total, current - 1, current, current + 1];
  const shown = [...new Set(wanted)]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  const out: (number | typeof GAP)[] = [];
  let prev = 0;
  for (const page of shown) {
    if (prev && page - prev > 1) out.push(GAP);
    out.push(page);
    prev = page;
  }
  return out;
}

interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav class="pager" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        &lsaquo;
      </button>

      {pageItems(page, totalPages).map((item, i) =>
        item === GAP ? <span key={`gap${i}`} class="gap">{GAP}</span> : (
          <button
            key={item}
            type="button"
            class={item === page ? "current" : ""}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        &rsaquo;
      </button>
    </nav>
  );
}
