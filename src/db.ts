import { DatabaseSync } from "node:sqlite";

export interface WebhookBody {
  id?: string;
  deviceId?: string;
  event?: string;
  payload?: Record<string, unknown>;
}

export interface StoredMessage {
  message_id: string;
  event_id: string | null;
  device_id: string | null;
  event: string | null;
  sender: string | null;
  recipient: string | null;
  message: string | null;
  sim_number: number | null;
  received_at: string | null;
  raw_json: string | null;
  created_at: string;
}

// Columns the read API is allowed to sort by. Sort/direction cannot be bound as
// SQL parameters, so they are interpolated — only ever from these whitelists.
//
// `recipient` is deliberately absent: the app omits it for inbound events, so
// it is NULL for every row and sorting by it did nothing. Search still covers
// the column, so it will work if the phone ever starts sending a value.
export const SORT_COLUMNS = ["received_at", "sender"] as const;
export type SortColumn = typeof SORT_COLUMNS[number];
export type SortDirection = "asc" | "desc";

export interface QueryOptions {
  // Substring match against sender, recipient and message. Empty = no filter.
  q?: string;
  sort?: SortColumn;
  dir?: SortDirection;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  rows: StoredMessage[];
  // Total matching `q`, ignoring limit/offset — drives the pager.
  total: number;
}

// Escapes the LIKE metacharacters so a search for "50%" matches a literal "50%"
// rather than "50" followed by anything. Paired with ESCAPE '\' in the SQL.
function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class MessageStore {
  #db: DatabaseSync;
  #insert: ReturnType<DatabaseSync["prepare"]>;
  #getOne: ReturnType<DatabaseSync["prepare"]>;
  #recent: ReturnType<DatabaseSync["prepare"]>;
  // Prepared statements for query(), keyed by the shape of the SQL. There are
  // only a handful of variants (3 columns x 2 directions x filtered/unfiltered).
  #queryCache = new Map<string, ReturnType<DatabaseSync["prepare"]>>();

  constructor(dbPath: string) {
    this.#db = new DatabaseSync(dbPath);
    this.#db.exec("PRAGMA journal_mode = WAL");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id  TEXT PRIMARY KEY,
        event_id    TEXT,
        device_id   TEXT,
        event       TEXT,
        sender      TEXT,
        recipient   TEXT,
        message     TEXT,
        sim_number  INTEGER,
        received_at TEXT,
        raw_json    TEXT,
        created_at  TEXT DEFAULT (datetime('now'))
      )
    `);
    // Support ordering and filtering without a full scan as the log grows.
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages (received_at);
      CREATE INDEX IF NOT EXISTS idx_messages_sender      ON messages (sender);
      CREATE INDEX IF NOT EXISTS idx_messages_recipient   ON messages (recipient);
    `);
    this.#insert = this.#db.prepare(`
      INSERT OR IGNORE INTO messages
        (message_id, event_id, device_id, event, sender, recipient, message, sim_number, received_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.#getOne = this.#db.prepare(
      "SELECT * FROM messages WHERE message_id = ?",
    );
    this.#recent = this.#db.prepare(
      "SELECT * FROM messages ORDER BY received_at DESC LIMIT ?",
    );
  }

  // Stores a message event. Returns true if a new row was inserted, false if a
  // duplicate messageId was ignored (retry/idempotency). Assumes the caller has
  // validated that payload.messageId is present.
  store(body: WebhookBody, rawJson: string): boolean {
    const p = body.payload ?? {};
    const result = this.#insert.run(
      p.messageId as string,
      body.id ?? null,
      body.deviceId ?? null,
      body.event ?? null,
      (p.sender as string) ?? null,
      (p.recipient as string) ?? null,
      (p.message as string) ?? null,
      (p.simNumber as number) ?? null,
      (p.receivedAt as string) ?? null,
      rawJson,
    );
    return Number(result.changes) > 0;
  }

  // Returns a stored message by its messageId, or undefined if not found.
  get(messageId: string): StoredMessage | undefined {
    return this.#getOne.get(messageId) as StoredMessage | undefined;
  }

  // Returns the most recently received messages, newest first.
  recent(limit = 20): StoredMessage[] {
    return this.#recent.all(limit) as unknown as StoredMessage[];
  }

  // Searchable, sortable, paginated read for the frontend. `total` counts every
  // row matching `q` so the pager knows how many pages exist.
  query(opts: QueryOptions = {}): QueryResult {
    const q = opts.q ?? "";
    const sort: SortColumn = opts.sort ?? "received_at";
    const dir: SortDirection = opts.dir ?? "desc";
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    // Three columns searched, so the term is bound three times.
    const where = q
      ? `WHERE sender LIKE ? ESCAPE '\\' OR recipient LIKE ? ESCAPE '\\'` +
        ` OR message LIKE ? ESCAPE '\\'`
      : "";
    const terms = q ? [likeTerm(q), likeTerm(q), likeTerm(q)] : [];

    // message_id breaks ties so LIMIT/OFFSET paging is stable: without a fully
    // deterministic order, rows can repeat or vanish between pages.
    const order = `ORDER BY ${sort} ${dir === "asc" ? "ASC" : "DESC"}` +
      `, created_at DESC, message_id ASC`;

    const rows = this.#cached(
      `rows|${sort}|${dir}|${q ? "f" : "u"}`,
      `SELECT * FROM messages ${where} ${order} LIMIT ? OFFSET ?`,
    ).all(...terms, limit, offset) as unknown as StoredMessage[];

    const counted = this.#cached(
      `count|${q ? "f" : "u"}`,
      `SELECT COUNT(*) AS total FROM messages ${where}`,
    ).get(...terms) as { total: number } | undefined;

    return { rows, total: Number(counted?.total ?? 0) };
  }

  #cached(key: string, sql: string): ReturnType<DatabaseSync["prepare"]> {
    let stmt = this.#queryCache.get(key);
    if (!stmt) {
      stmt = this.#db.prepare(sql);
      this.#queryCache.set(key, stmt);
    }
    return stmt;
  }
}
