// bot.ts

import { apiThrottler, Bot, escapeHtml } from "./deps.ts";
import { isMessageOriginUser, isMessageOriginHiddenUser, isMessageOriginChat, isMessageOriginChannel, isMessageOriginUnknown } from "./typeGuards.ts";
import { AnyMessageOrigin } from "./types.ts";


// --------------------
// Bot Initialization
// --------------------

// Retrieve the bot token from environment variables
const token = Deno.env.get("TOKEN");
if (token === undefined) throw new Error("Env var TOKEN required for bot!");

// Initialize the bot with the retrieved token
const bot = new Bot(token);

// Apply API throttling middleware to prevent hitting rate limits
const throttler = apiThrottler();
bot.api.config.use(throttler);

// --------------------
// Helper Function
// --------------------

/**
 * Formats the update information into an HTML string for replying.
 *
 * @param update - The raw update object from Telegram.
 * @param author - The ID of the message author (optional).
 * @param forward - The forward origin object (optional).
 * @returns A formatted HTML string containing update details.
 */
function prettifyUpdate(
  update: any,
  author?: number,
  forward?: AnyMessageOrigin
): string {
  let forwardText = "";

  if (forward) {
    if (isMessageOriginUser(forward)) {
      const sender = forward.sender_user;
      forwardText += `<b>Forwarded from User:</b>\nName: ${escapeHtml(
        sender.first_name
      )} ${escapeHtml(sender.last_name || "")}\nID: <code>${sender.id}</code>\n\n`;
    } else if (isMessageOriginHiddenUser(forward)) {
      forwardText += `<b>Forwarded from Hidden User:</b>\nName: ${escapeHtml(
        forward.sender_user_name
      )}\n\n`;
    } else if (isMessageOriginChat(forward)) {
      forwardText += `<b>Forwarded from Chat:</b>\nTitle: ${escapeHtml(
        forward.sender_chat.title ?? "No Chat Title"
      )}\nID: <code>${forward.sender_chat.id}</code>\n`;
      if (forward.author_signature) {
        forwardText += `Author Signature: ${escapeHtml(
          forward.author_signature
        )}\n\n`;
      } else {
        forwardText += `\n`;
      }
    } else if (isMessageOriginChannel(forward)) {
      forwardText += `<b>Forwarded from Channel:</b>\nTitle: ${escapeHtml(
        forward.chat.title
      )}\nID: <code>${forward.chat.id}</code>\nOriginal Message ID: <code>${
        forward.message_id
      }</code>\n`;
      if (forward.author_signature) {
        forwardText += `Author Signature: ${escapeHtml(
          forward.author_signature
        )}\n\n`;
      } else {
        forwardText += `\n`;
      }
    } else if (isMessageOriginUnknown(forward)) {
      forwardText += `<b>Forwarded from Unknown Origin Type:</b> ${escapeHtml(
        forward.type
      )}\n\n`;
    } else {
      // This block is theoretically unreachable but added for exhaustive type checking
      forwardText += `<b>Forwarded from an unrecognized origin.</b>\n\n`;
    }
  }

  const authorText = author
    ? `<b>Author ID:</b> <code>${author}</code>\n\n`
    : "";

  const updateText = `<b>Raw Update:</b>\n<pre><code class="language-json">${escapeHtml(
    JSON.stringify(update, null, 2)
  )}</code></pre>`;

  return forwardText + authorText + updateText;
}

// --------------------
// Bot Handler
// --------------------

// Listen for all incoming messages
bot.on("message", async (ctx) => {
  const update = ctx.update;
  const author = ctx.from?.id;

  // Extract the forward origin if the message is forwarded
  const forwardOrigin = ctx.msg.forward_origin as AnyMessageOrigin | undefined;

  // Generate the reply text using the helper function
  const text = prettifyUpdate(update, author, forwardOrigin);

  // Reply to the user with the formatted update information
  await ctx.reply(text, { parse_mode: "HTML" });
});

// --------------------
// Export the Bot
// --------------------

// Export the bot instance for deployment purposes
export default bot;
