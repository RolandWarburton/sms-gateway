// Expanded row: the fields the table has no room for, plus the stored payload.

import { useQuery } from "@tanstack/preact-query";
import { getMessage } from "../lib/api.ts";
import { absoluteTime } from "../lib/format.ts";

function prettyJson(raw: string | null): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function MessageDetail({ id }: { id: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ["message", id],
    queryFn: () => getMessage(id),
    staleTime: 5 * 60_000,
  });

  if (isPending) return <div class="detail muted">Loading…</div>;
  if (error) return <div class="detail error">{String(error)}</div>;

  const m = data.message;
  return (
    <div class="detail">
      <dl>
        <dt>Message</dt>
        <dd class="full-message">{m.message ?? "—"}</dd>

        <dt>Message ID</dt>
        <dd>
          <code>{m.message_id}</code>
        </dd>

        <dt>Event</dt>
        <dd>{m.event ?? "—"}</dd>

        <dt>Device</dt>
        <dd>
          <code>{m.device_id ?? "—"}</code>
        </dd>

        <dt>SIM</dt>
        <dd>{m.sim_number ?? "—"}</dd>

        <dt>Received</dt>
        <dd>{absoluteTime(m.received_at) || "—"}</dd>

        <dt>Stored</dt>
        <dd>{absoluteTime(m.created_at) || "—"}</dd>
      </dl>

      <details>
        <summary>Raw payload</summary>
        <pre>{prettyJson(m.raw_json)}</pre>
      </details>
    </div>
  );
}
