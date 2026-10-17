# Second Brain Telegram Bot

Personal Telegram bot that writes journal entries and clipping notes into an Obsidian vault.

## What it does

Plain text and channel forwards that arrive inside `COMMENT_WINDOW_MS` become one daily-note entry. A channel forward also creates a clipping note and is recorded in the journal as a `> [!post]` wikilink to that note. An album is still one clipping. When the window closes, the bot sends one plain-text summary as a reply to the first message of that entry. It does not set a parse mode, and a clipping does not get its own reply.

The vault name in the links comes from `OBSIDIAN_VAULT` (default `second-brain`). A new clipping is «Сохранил». A duplicate is «Уже было» and has no media line, because a repeat does not download. «не скачано» appears only on «Сохранил».

```
Записал в журнал 2026-10-17 18:28
obsidian://open?vault=second-brain&file=Periodic%2FDaily%2F2026-10-17

Сохранил: 2026-10-17 12-01 Channel
obsidian://open?vault=second-brain&file=2026-10-17%2012-01%20Channel
```

If the daily note cannot be written, the bot still answers. It sends «Не записал в журнал» once for that unchanged buffer and retries. A later success sends the normal summary. A new clipping that joins after the failure answer can produce another failure reply on the next failed flush.

Anything else is refused at once, as a reply to that message, and is not part of the summary:

- forward origin is not a channel: `Пересылка не из канала. Принимаю обычный текст и посты каналов.`
- sticker: `Стикер не сохраняю. Принимаю обычный текст и посты каналов.`
- own photo, video, animation, document, audio, voice, or video note: `Своё медиа не сохраняю. Принимаю обычный текст и посты каналов.`
- anything else: `Такой тип сообщения не сохраняю. Принимаю обычный текст и посты каналов.`

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
| `OBSIDIAN_VAULT` | no | `second-brain` | Vault name in `obsidian://` reply links |
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
