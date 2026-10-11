export interface ReplySink {
  reply(chatId: number, text: string): Promise<void>;
}
