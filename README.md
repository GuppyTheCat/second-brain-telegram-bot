# Second Brain Telegram Bot

Personal Telegram bot that writes journal entries and clipping notes into an Obsidian vault.

## What it does

Plain text and channel forwards that arrive inside `COMMENT_WINDOW_MS` become one daily-note entry. A channel forward also creates a clipping note and is recorded in the journal as a `> [!post]` wikilink to that note. Anything else gets «не поддерживается».

## Environment

Copy `.env.example` to `.env`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `BOT_TOKEN` | yes | | Telegram bot token |
| `ALLOWED_USER_ID` | yes | | Only this account can use the bot |
| `VAULT_PATH` | yes | | Vault root where notes are written |
| `PROXY_URL` | no | | SOCKS proxy for Telegram. Unset connects directly |
| `ATTACHMENTS_DIR` | no | `Attachments` | Attachments folder inside the vault |
| `TIMEZONE` | no | `Europe/Moscow` | Publication times in filenames and dates |
| `COMMENT_WINDOW_MS` | no | `3000` | How long plain text and channel forwards keep joining the same daily-note entry |
| `ALBUM_WINDOW_MS` | no | `1500` | How long to wait for more parts of the same album |
| `PUID` | compose | | Host UID that owns the vault. Compose only |
| `PGID` | compose | | Host GID that owns the vault. Compose only |

## Run locally

```sh
pnpm install
pnpm dev
```

`pnpm dev` long-polls Telegram. Forward a public channel post, or send a plain message, and the bot writes into `VAULT_PATH`.

```sh
pnpm lint
pnpm format
```

## Docker Compose

`VAULT_PATH` in `.env` is both the path the process writes to and the host directory mounted into the container at the same path. `PUID` and `PGID` are the owner of that directory. Telegram traffic uses `PROXY_URL` from the environment; there is no proxy container.

```sh
docker compose build
docker compose up -d
```

## Test

```sh
pnpm test
```
