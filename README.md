# Second Brain Telegram Bot

Personal Telegram bot that saves forwarded channel posts into an Obsidian vault as clipping notes.

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
| `COMMENT_WINDOW_MS` | no | `3000` | How long a comment stays attached to following forwards |
| `ALBUM_WINDOW_MS` | no | `1500` | How long to wait for more parts of the same album |

## Run locally

```sh
pnpm install
pnpm dev
```

`pnpm dev` long-polls Telegram. Forward a public channel post to the bot and a note appears at `VAULT_PATH`.

## Test

```sh
pnpm test
```
