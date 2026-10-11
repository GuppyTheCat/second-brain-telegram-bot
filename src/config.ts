export interface Config {
  botToken: string;
  allowedUserId: number;
  proxyUrl: string | undefined;
  vaultPath: string;
  attachmentsDir: string;
  timezone: string;
  commentWindowMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const timezone = optional(env, "TIMEZONE") ?? "Europe/Moscow";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`Invalid TIMEZONE: ${timezone}`);
  }

  return {
    botToken: required(env, "BOT_TOKEN"),
    allowedUserId: requiredUserId(env),
    proxyUrl: optional(env, "PROXY_URL"),
    vaultPath: required(env, "VAULT_PATH"),
    attachmentsDir: optional(env, "ATTACHMENTS_DIR") ?? "Attachments",
    timezone,
    commentWindowMs: optionalInt(env, "COMMENT_WINDOW_MS", 3000),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function requiredUserId(env: NodeJS.ProcessEnv): number {
  const raw = required(env, "ALLOWED_USER_ID");
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error("ALLOWED_USER_ID must be a positive integer");
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) {
    throw new Error("ALLOWED_USER_ID must be a positive integer");
  }
  return id;
}

function optionalInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a non-negative integer`);
  return value;
}
