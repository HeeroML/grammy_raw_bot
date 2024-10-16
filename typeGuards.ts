// --------------------
// Type Guards
// --------------------

import { MessageOriginChannel, MessageOriginChat, MessageOriginHiddenUser, MessageOriginUser } from "https://deno.land/x/grammy_types@v3.14.0/mod.ts";
import { AnyMessageOrigin, MessageOriginUnknown } from "./types.ts";

// Type guard for MessageOriginUser
export function isMessageOriginUser(origin: AnyMessageOrigin): origin is MessageOriginUser {
  return origin.type === "user";
}

// Type guard for MessageOriginHiddenUser
export function isMessageOriginHiddenUser(origin: AnyMessageOrigin): origin is MessageOriginHiddenUser {
  return origin.type === "hidden_user";
}

// Type guard for MessageOriginChat
export function isMessageOriginChat(origin: AnyMessageOrigin): origin is MessageOriginChat {
  return origin.type === "chat";
}

// Type guard for MessageOriginChannel
export function isMessageOriginChannel(origin: AnyMessageOrigin): origin is MessageOriginChannel {
  return origin.type === "channel";
}

// Type guard for MessageOriginUnknown
export function isMessageOriginUnknown(origin: AnyMessageOrigin): origin is MessageOriginUnknown {
  return !["user", "hidden_user", "chat", "channel"].includes(origin.type);
}