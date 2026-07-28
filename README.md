# sms-gateway-receiver

Receives incoming-SMS webhooks from the
[SMS Gateway for Android](https://sms-gate.app/) app and stores them in SQLite.
See the [documentation](https://docs.sms-gate.app) for the app itself.

## Endpoints

| Method | Path                | Notes                                           |
| ------ | ------------------- | ----------------------------------------------- |
| GET    | `/health`           | Returns `ok`. Unsigned (for uptime checks).     |
| POST   | `/webhook`          | Receives app webhooks. HMAC signature required. |
| GET    | `/api/messages`     | Search/sort/paginate. OIDC bearer token.        |
| GET    | `/api/messages/:id` | One message by `messageId`. OIDC bearer token.  |
| GET    | `/api/config`       | Issuer + client id for the SPA. **No auth.**    |
| GET    | everything else     | Built frontend, if `FRONTEND_DIR` is set.       |

The write path and the read path are guarded differently: `/webhook` by the
shared HMAC signing key, `/api/*` by an OIDC ID token. `/api/config` is public 
to grab the issuer URL and client id for OIDC.

### `GET /api/messages`

| Param    | Default       | Meaning                                    |
| -------- | ------------- | ------------------------------------------ |
| `q`      | empty         | Substring match on sender or message body. |
| `sort`   | `received_at` | One of `received_at`, `sender`.            |
| `dir`    | `desc`        | `asc` or `desc`.                           |
| `limit`  | `100`         | Clamped to 1–500.                          |
| `offset` | `0`           | Row offset for pagination.                 |

Returns `{ messages, total, limit, offset }`, where `total` counts every row
matching `q` regardless of paging. Out-of-range and unrecognised values are
clamped or fall back to the default rather than erroring.

## Frontend

```bash
deno task build:web   # bundle to web/dist
deno task dev:web     # same, rebuilding on change
```

## Read API (OIDC)

| Variable         | Required                   | Meaning                                                   |
| ---------------- | -------------------------- | --------------------------------------------------------- |
| `OIDC_ISSUER`    | yes, to enable auth        | JWKS is fetched from `<issuer>/keys`.                     |
| `OIDC_CLIENT_ID` | no (default `sms-gateway`) | Expected `aud`. Must match the Dex static client.         |
| `ALLOWED_EMAIL`  | no, but see below          | Only this `email` claim is accepted. Empty = any account. |
| `FRONTEND_DIR`   | no                         | Directory of built assets served at `/`. Empty disables.  |

## Register the webhook on the phone

Run the app in **Local mode**.

**On the phone (Settings tab):**

1. **Local Server** -> note the Port (`8080`) and the `Username` / `Password`.
2. **Webhooks -> Signing Key** -> set it to `SIGNING_KEY` in `.env`.

**Register the endpoint** Run this from a machine **on the same LAN as the
phone**. Use the phone's local IP and the Local Server credentials configured on
the phone:

```bash
PHONE_IP=192.168.0.20              # phone's local IP (Home tab)
PHONE_USER=sms                     # Local Server username
PHONE_PASS=change-me               # Local Server password
DOMAIN=sms-gateway.example.com     # public host of this service (matches DOMAIN in .env)

curl -u "$PHONE_USER:$PHONE_PASS" -X POST "http://$PHONE_IP:8080/webhooks" \
  -H 'Content-Type: application/json' \
  -d '{"id":"sms-receiver","url":"https://'"$DOMAIN"'/webhook","event":"sms:received"}'
```

> Deploy the service before registering the webhook - the endpoint must be live
> at `https://<your-domain>/webhook` before you register.

## Inspect stored messages

```bash
docker compose exec sms-gateway \
  deno eval 'import{DatabaseSync}from"node:sqlite";const d=new DatabaseSync("/data/sms.db");console.log(d.prepare("select received_at,sender,message from messages order by received_at desc limit 20").all())'
```

Or copy the DB out and use `sqlite3`:

```bash
docker cp sms-gateway:/data/sms.db ./sms.db
sqlite3 ./sms.db 'select received_at, sender, message from messages;'
```

## Tests

See [TESTING.md](TESTING.md) for the test suite, the checks, and the manual
end-to-end runs.
