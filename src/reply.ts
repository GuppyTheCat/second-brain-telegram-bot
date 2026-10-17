export interface ReplySink {
  reply(chatId: number, messageId: number, text: string): Promise<void>;
}
