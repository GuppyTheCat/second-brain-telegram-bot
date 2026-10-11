import { Bot, type BotConfig, type Context } from "grammy";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Config } from "./config.js";
import type { Inbox } from "./inbox.js";

export function createBot(config: Config, inbox: Inbox): Bot {
  const bot = new Bot(config.botToken, clientOptions(config.proxyUrl));

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.allowedUserId) return;
    await next();
  });

  bot.on("message", async (ctx) => {
    const outcome = await inbox.handle(ctx.message);
    if (outcome.type === "saved") console.log(`saved note: ${outcome.noteName}`);
    if (outcome.type === "duplicate" && outcome.comment === "appended") {
      console.log(`appended comment: ${outcome.noteName}`);
    }
    if (outcome.type === "duplicate" && outcome.comment === "failed") {
      console.error(`comment not appended: ${outcome.noteName}`);
    }
  });

  bot.catch((error) => {
    console.error(error);
  });

  return bot;
}

function clientOptions(proxyUrl: string | undefined): BotConfig<Context> | undefined {
  if (!proxyUrl) return undefined;
  const agent = new SocksProxyAgent(proxyUrl);
  return {
    client: {
      baseFetchConfig: {
        agent,
        compress: true,
      },
    },
  };
}
