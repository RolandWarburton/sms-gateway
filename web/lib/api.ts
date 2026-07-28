// Typed calls against the read API, with the bearer token attached.

import { clearToken, getToken } from "./auth.ts";
import type {
  Message,
  MessagePage,
  SortColumn,
  SortDirection,
} from "./types.ts";

// Thrown on 401 so the UI can drop back to the sign-in screen rather than
// showing a generic error.
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

async function get<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) {
    clearToken();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return await res.json() as T;
}

export interface ListParams {
  q: string;
  sort: SortColumn;
  dir: SortDirection;
  limit: number;
  offset: number;
}

export function listMessages(params: ListParams): Promise<MessagePage> {
  const search = new URLSearchParams({
    sort: params.sort,
    dir: params.dir,
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.q) search.set("q", params.q);
  return get<MessagePage>(`/api/messages?${search}`);
}

export function getMessage(id: string): Promise<{ message: Message }> {
  return get<{ message: Message }>(
    `/api/messages/${encodeURIComponent(id)}`,
  );
}
