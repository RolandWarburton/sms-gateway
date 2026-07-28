// Page heading and the controls above the table.

export const PAGE_SIZES = [25, 50, 100, 250, 500];
export const DEFAULT_PAGE_SIZE = 50;

interface Props {
  search: string;
  onSearch: (value: string) => void;
  perPage: number;
  onPerPage: (value: number) => void;
  // null when auth is disabled server-side — there is no session to end.
  onSignOut: (() => void) | null;
}

export function Toolbar(
  { search, onSearch, perPage, onPerPage, onSignOut }: Props,
) {
  return (
    <header>
      <h1>Messages</h1>
      <div class="controls">
        <input
          type="search"
          placeholder="Search sender or message…"
          value={search}
          onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
          aria-label="Search messages"
        />
        <label class="per-page">
          Show
          <select
            value={String(perPage)}
            onChange={(e) =>
              onPerPage(Number((e.target as HTMLSelectElement).value))}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {onSignOut && (
          <button type="button" class="signout" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
