import { createBot, createProxyAgent, logInboxOutcome } from "./bot.js";
import { systemClock } from "./clock.js";
import { loadConfig } from "./config.js";
import { createInbox } from "./inbox.js";
import { createTelegramMediaFetcher, type TelegramFileSource } from "./media.js";
import { createVaultStore } from "./vault.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const agent = createProxyAgent(config.proxyUrl);
  let getFile: TelegramFileSource["getFile"] = () => {
    throw new Error("bot is not ready");
  };
  let sendReply: (chatId: number, messageId: number, text: string) => Promise<void> = () => {
    throw new Error("bot is not ready");
  };

  const inbox = createInbox({
    vault: createVaultStore(config.vaultPath),
    media: createTelegramMediaFetcher({
      token: config.botToken,
      agent,
      getFile: (fileId) => getFile(fileId),
    }),
    reply: {
      reply: (chatId, messageId, text) => sendReply(chatId, messageId, text),
    },
    clock: systemClock(),
    onOutcome: logInboxOutcome,
    config: {
      timezone: config.timezone,
      commentWindowMs: config.commentWindowMs,
      albumWindowMs: config.albumWindowMs,
      attachmentsDir: config.attachmentsDir,
    },
  });

  const bot = createBot(config, inbox, agent);
  getFile = (fileId) => bot.api.getFile(fileId);
  sendReply = async (chatId, messageId, text) => {
    await bot.api.sendMessage(chatId, text, {
      reply_parameters: { message_id: messageId },
    });
  };

  await bot.start({
    allowed_updates: ["message"],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
