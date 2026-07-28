// One table row, plus the detail panel it expands into.

import { absoluteTime, relativeTime } from "../lib/format.ts";
import { CopyButton } from "./copy_button.tsx";
import { MessageDetail } from "./message_detail.tsx";
import type { Message } from "../lib/types.ts";

// Kept in step with the column count in message_table.tsx so the detail panel
// spans the full width.
export const COLUMN_COUNT = 3;

interface Props {
  m: Message;
  expanded: boolean;
  onToggle: () => void;
}

export function MessageRow({ m, expanded, onToggle }: Props) {
  return (
    <>
      <tr
        class={expanded ? "expanded" : ""}
        onClick={onToggle}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td class="time" title={absoluteTime(m.received_at)}>
          {relativeTime(m.received_at)}
        </td>
        <td class="num">{m.sender ?? "—"}</td>
        <td class="msg">
          <span class="msg-text">{m.message ?? "—"}</span>
          {m.message ? <CopyButton text={m.message} /> : null}
        </td>
      </tr>
      {expanded && (
        <tr class="detail-row">
          <td colSpan={COLUMN_COUNT}>
            <MessageDetail id={m.message_id} />
          </td>
        </tr>
      )}
    </>
  );
}
