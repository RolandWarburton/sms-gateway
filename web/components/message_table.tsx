import { COLUMN_COUNT, MessageRow } from "./message_row.tsx";
import type { Message, SortColumn, SortDirection } from "../lib/types.ts";

const COLUMNS: { key: SortColumn | null; label: string }[] = [
  { key: "received_at", label: "Received" },
  { key: "sender", label: "From" },
  { key: null, label: "Message" },
];

interface Props {
  // undefined while the first page is still loading.
  messages: Message[] | undefined;
  sort: SortColumn;
  dir: SortDirection;
  onSort: (column: SortColumn) => void;
  expandedId: string | null;
  onToggleRow: (id: string) => void;
  // Dims the table while a newer page is in flight.
  isFetching: boolean;
  emptyMessage: string;
}

export function MessageTable(
  {
    messages,
    sort,
    dir,
    onSort,
    expandedId,
    onToggleRow,
    isFetching,
    emptyMessage,
  }: Props,
) {
  return (
    <table class={isFetching ? "stale" : ""}>
      <thead>
        <tr>
          {COLUMNS.map(({ key, label }) => (
            <th
              key={label}
              class={key ? "sortable" : ""}
              aria-sort={key === sort
                ? (dir === "asc" ? "ascending" : "descending")
                : undefined}
              onClick={key ? () => onSort(key) : undefined}
            >
              {label}
              {key === sort
                ? <span class="arrow">{dir === "asc" ? "▲" : "▼"}</span>
                : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {messages?.map((m) => (
          <MessageRow
            key={m.message_id}
            m={m}
            expanded={expandedId === m.message_id}
            onToggle={() => onToggleRow(m.message_id)}
          />
        ))}
        {messages && messages.length === 0 && (
          <tr>
            <td colSpan={COLUMN_COUNT} class="empty">{emptyMessage}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
