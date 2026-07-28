import { useEffect, useState } from "preact/hooks";
import { keepPreviousData, useQuery } from "@tanstack/preact-query";
import { listMessages, UnauthorizedError } from "../lib/api.ts";
import { Pagination } from "./pagination.tsx";
import { DEFAULT_PAGE_SIZE, Toolbar } from "./toolbar.tsx";
import { StatusLine } from "./status_line.tsx";
import { MessageTable } from "./message_table.tsx";
import type { SortColumn, SortDirection } from "../lib/types.ts";

const SEARCH_DEBOUNCE_MS = 300;

export function App({ onSignOut }: { onSignOut: (() => void) | null }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortColumn>("received_at");
  const [dir, setDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce typing so each keystroke doesn't hit the API.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending, error, isFetching } = useQuery({
    queryKey: ["messages", q, sort, dir, perPage, page],
    queryFn: () =>
      listMessages({
        q,
        sort,
        dir,
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // A shrinking result set (new search, deleted rows) can leave us past the end.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function toggleSort(column: SortColumn) {
    if (column === sort) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(column);
      // Time reads best newest-first; names read best A-Z.
      setDir(column === "received_at" ? "desc" : "asc");
    }
    setPage(1);
  }

  if (error && error instanceof UnauthorizedError) {
    return (
      <p class="error">Session expired. Please reload to sign in again.</p>
    );
  }

  return (
    <div class="app">
      <Toolbar
        search={search}
        onSearch={setSearch}
        perPage={perPage}
        onPerPage={(n) => {
          setPerPage(n);
          setPage(1);
        }}
        onSignOut={onSignOut}
      />

      <StatusLine
        error={error}
        isPending={isPending}
        isFetching={isFetching}
        total={total}
        q={q}
      />

      <MessageTable
        messages={data?.messages}
        sort={sort}
        dir={dir}
        onSort={toggleSort}
        expandedId={expandedId}
        onToggleRow={(id) => setExpandedId(expandedId === id ? null : id)}
        isFetching={isFetching}
        emptyMessage={q ? "No messages match that search." : "No messages yet."}
      />

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
