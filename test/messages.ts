import type {
  Chat,
  Message,
  MessageEntity,
  PhotoSize,
  User,
} from "grammy/types";

const owner: User = { id: 100, is_bot: false, first_name: "Guppy" };

function privateChat(chatId = 100): Chat.PrivateChat {
  return { id: chatId, type: "private", first_name: "Guppy" };
}

export interface ChannelForwardInput {
  text?: string;
  caption?: string;
  entities?: MessageEntity[];
  captionEntities?: MessageEntity[];
  /** Unix seconds when the user forwarded the message (`message.date`). */
  forwardedAt?: number;
  /** Unix seconds when the channel published the post (`forward_origin.date`). */
  publishedAt?: number;
  channelTitle?: string;
  /** `null` omits the username (private channel). Default is a public username. */
  username?: string | null;
  channelId?: number;
  postId?: number;
  mediaGroupId?: string;
  photo?: PhotoSize[];
  video?: Message["video"];
  animation?: Message["animation"];
  document?: Message["document"];
  audio?: Message["audio"];
  voice?: Message["voice"];
  videoNote?: Message["video_note"];
  messageId?: number;
  chatId?: number;
  fromId?: number;
}

export function channelForward(input: ChannelForwardInput = {}): Message {
  const username = input.username === undefined ? "denissexy" : input.username;
  const channel: Chat.ChannelChat = {
    id: input.channelId ?? -1001234567890,
    type: "channel",
    title: input.channelTitle ?? "Denis Sexy IT 🤖",
    ...(username ? { username } : {}),
  };
  const message: Message = {
    message_id: input.messageId ?? 1,
    date: input.forwardedAt ?? 1_775_000_000,
    chat: privateChat(input.chatId),
    from: { ...owner, id: input.fromId ?? owner.id },
    forward_origin: {
      type: "channel",
      date: input.publishedAt ?? 1_774_000_000,
      chat: channel,
      message_id: input.postId ?? 11330,
    },
  };
  if (input.text !== undefined) message.text = input.text;
  if (input.caption !== undefined) message.caption = input.caption;
  if (input.entities !== undefined) message.entities = input.entities;
  if (input.captionEntities !== undefined) message.caption_entities = input.captionEntities;
  if (input.mediaGroupId !== undefined) message.media_group_id = input.mediaGroupId;
  if (input.photo !== undefined) message.photo = input.photo;
  if (input.video !== undefined) message.video = input.video;
  if (input.animation !== undefined) message.animation = input.animation;
  if (input.document !== undefined) message.document = input.document;
  if (input.audio !== undefined) message.audio = input.audio;
  if (input.voice !== undefined) message.voice = input.voice;
  if (input.videoNote !== undefined) message.video_note = input.videoNote;
  return message;
}

export function mediaFile(fileId: string): { file_id: string; file_unique_id: string } {
  return { file_id: fileId, file_unique_id: `${fileId}-unique` };
}

export function photoSize(fileId: string, width: number, height: number, fileSize?: number): PhotoSize {
  return {
    ...mediaFile(fileId),
    width,
    height,
    ...(fileSize === undefined ? {} : { file_size: fileSize }),
  };
}

export function userForward(text = "forwarded from a user"): Message {
  return {
    message_id: 2,
    date: 1_775_000_000,
    chat: privateChat(),
    from: owner,
    text,
    forward_origin: {
      type: "user",
      date: 1_774_000_000,
      sender_user: { id: 5, is_bot: false, first_name: "Alice" },
    },
  };
}

export function hiddenUserForward(text = "forwarded from a hidden user"): Message {
  return {
    message_id: 3,
    date: 1_775_000_000,
    chat: privateChat(),
    from: owner,
    text,
    forward_origin: {
      type: "hidden_user",
      date: 1_774_000_000,
      sender_user_name: "Hidden",
    },
  };
}

export function chatForward(text = "forwarded from a group"): Message {
  return {
    message_id: 4,
    date: 1_775_000_000,
    chat: privateChat(),
    from: owner,
    text,
    forward_origin: {
      type: "chat",
      date: 1_774_000_000,
      sender_chat: { id: -30, type: "group", title: "Friends" },
    },
  };
}

export function stickerMessage(): Message {
  return {
    message_id: 5,
    date: 1_775_000_000,
    chat: privateChat(),
    from: owner,
    sticker: {
      file_id: "sticker-file",
      file_unique_id: "sticker-unique",
      type: "regular",
      width: 512,
      height: 512,
      is_animated: false,
      is_video: false,
    },
  };
}

export function photoMessage(): Message {
  return {
    message_id: 6,
    date: 1_775_000_000,
    chat: privateChat(),
    from: owner,
    photo: [
      {
        file_id: "photo-file",
        file_unique_id: "photo-unique",
        width: 100,
        height: 100,
      },
    ],
  };
}

export function plainText(text = "this will be a comment later"): Message {
  return {
    message_id: 7,
    date: 1_775_000_000,
    chat: privateChat(),
    from: owner,
    text,
  };
}
