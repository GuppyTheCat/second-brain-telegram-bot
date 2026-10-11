import { createBot } from "./bot.js";
import { systemClock } from "./clock.js";
import { loadConfig } from "./config.js";
import { createInbox } from "./inbox.js";
import type { MediaFetcher } from "./media.js";
import { createVaultStore } from "./vault.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const media: MediaFetcher = {
    async fetch() {
      throw new Error("media downloads are not implemented yet");
    },
  };

  let sendReply: (chatId: number, text: string) => Promise<void> = () => {
    throw new Error("bot is not ready");
  };

  const inbox = createInbox({
    vault: createVaultStore(config.vaultPath),
    media,
    reply: {
      reply: (chatId, text) => sendReply(chatId, text),
    },
    clock: systemClock(),
    config: {
      timezone: config.timezone,
      commentWindowMs: config.commentWindowMs,
      attachmentsDir: config.attachmentsDir,
    },
  });

  const bot = createBot(config, inbox);
  sendReply = async (chatId, text) => {
    await bot.api.sendMessage(chatId, text);
  };

  await bot.start({
    allowed_updates: ["message"],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
