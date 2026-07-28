// Shapes returned by the read API. Mirrors StoredMessage in src/db.ts.

export interface Message {
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

export interface MessagePage {
  messages: Message[];
  total: number;
  limit: number;
  offset: number;
}

export interface AppConfig {
  issuer: string;
  clientId: string;
  authDisabled: boolean;
}

// Mirrors SORT_COLUMNS in src/db.ts
export type SortColumn = "received_at" | "sender";
export type SortDirection = "asc" | "desc";
