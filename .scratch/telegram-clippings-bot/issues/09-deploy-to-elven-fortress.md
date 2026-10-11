# 09: Deploy to elven-fortress

**What to build:** The bot runs permanently on elven-fortress and saves posts into the vault copy that Syncthing distributes to all my devices. I'll do this deployment myself once the features are in place, following the Housekeeper Bot pattern:

- Docker Compose service with automatic restart.
- Syncthing-managed vault folder bind-mounted into the container.
- Container process running with the UID/GID that owns the Syncthing data.
- Telegram traffic through the SOCKS proxy.
- Secrets in an env file that isn't committed.
- Repository pushed to Gitea.

**Blocked by:** 01–08 (all feature tickets)

**Status:** ready-for-human

- [ ] Repository is pushed to Gitea
- [ ] The service starts on the server, survives a container restart and a server reboot
- [ ] A post forwarded from my phone appears as a note on my PC via Syncthing
- [ ] Created notes and attachments are owned by the Syncthing data owner, and Syncthing syncs them without permission errors
- [ ] A post with a comment, an album and a duplicate forward behave as in the spec on the real server
- [ ] Logs show saved notes and errors
