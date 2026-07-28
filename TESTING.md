# Testing

Unit + handler tests (offline, no network), plus lint/format/type checks:

```bash
deno task test    # signature, storage, and request-handler tests
deno task check   # type-check server + frontend
deno task lint
deno task fmt
```

The frontend has no automated tests; check it by hand with a local run.

## Manual end-to-end

Against a running instance:

```bash
SIGNING_KEY=test ./scripts/test-webhook.ts               # store a new message
SIGNING_KEY=test ./scripts/test-webhook.ts http://127.0.0.1:8080/webhook fixed-id-1   # repeat -> idempotent
```

To exercise the UI locally, run with auth off and the built assets:

```bash
deno task build:web
SIGNING_KEY=test DB_PATH=./sms.db FRONTEND_DIR=./web/dist deno task start
```

The Dex client only registers the production redirect URI, so the sign-in flow
itself can only be exercised against the deployed instance.
