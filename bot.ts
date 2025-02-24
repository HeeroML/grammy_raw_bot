// bot.ts

import { 
  apiThrottler, 
  Bot, 
  escapeHtml, 
  freeStorage, 
  InlineKeyboard, 
  session 
} from "./deps.ts";
import { 
  isMessageOriginUser, 
  isMessageOriginHiddenUser, 
  isMessageOriginChat, 
  isMessageOriginChannel, 
  isMessageOriginUnknown 
} from "./typeGuards.ts";
import { AnyMessageOrigin } from "./types.ts";
import { 
  DEFAULT_SESSION, 
  isUserAdmin, 
  MyContext, 
  SessionData 
} from "./session.ts";

// --------------------
// Bot Initialization
// --------------------

// Retrieve the bot token from environment variables
const token = Deno.env.get("TOKEN");
if (token === undefined) throw new Error("Env var TOKEN required for bot!");

// Initialize the bot with the retrieved token and specify our context type
const bot = new Bot<MyContext>(token);

// Apply API throttling middleware to prevent hitting rate limits
const throttler = apiThrottler();
bot.api.config.use(throttler);

// Initialize the session middleware with free storage provider
bot.use(session({
  initial: () => structuredClone(DEFAULT_SESSION),
  storage: freeStorage<SessionData>(bot.token),
}));

// --------------------
// Helper Functions
// --------------------

/**
 * Creates an inline keyboard with view control buttons
 * 
 * @param preferences - Current view preferences
 * @returns Inline keyboard markup
 */
function createViewControlsKeyboard(preferences: SessionData['viewPreferences']) {
  return new InlineKeyboard()
    // Display mode buttons
    .text(
      preferences.displayMode === 'compact' ? '✅ Compact' : 'Compact', 
      'view_compact'
    )
    .text(
      preferences.displayMode === 'full' ? '✅ Full' : 'Full', 
      'view_full'
    )
    .text(
      preferences.displayMode === 'raw' ? '✅ Raw JSON' : 'Raw JSON', 
      'view_raw'
    )
    .row()
    // Toggle buttons for specific sections
    .text(
      preferences.showForwardInfo ? '✅ Forward Info' : '❌ Forward Info', 
      'toggle_forward'
    )
    .text(
      preferences.showAuthorInfo ? '✅ Author Info' : '❌ Author Info', 
      'toggle_author'
    );
}

/**
 * Formats the update information into an HTML string for replying.
 *
 * @param update - The raw update object from Telegram.
 * @param preferences - View preferences for formatting
 * @param author - The ID of the message author (optional).
 * @param forward - The forward origin object (optional).
 * @returns A formatted HTML string containing update details.
 */
function prettifyUpdate(
  update: any,
  preferences: SessionData['viewPreferences'],
  author?: number,
  forward?: AnyMessageOrigin
): string {
  let forwardText = "";
  let authorText = "";
  let updateText = "";
  let result = "";

  // Format forward information if available and enabled
  if (forward && preferences.showForwardInfo) {
    forwardText = "<b>📨 FORWARDED MESSAGE</b>\n";
    
    if (isMessageOriginUser(forward)) {
      const sender = forward.sender_user;
      forwardText += `<b>From User:</b>\nName: ${escapeHtml(
        sender.first_name
      )} ${escapeHtml(sender.last_name || "")}\nID: <code>${sender.id}</code>\n\n`;
    } else if (isMessageOriginHiddenUser(forward)) {
      forwardText += `<b>From Hidden User:</b>\nName: ${escapeHtml(
        forward.sender_user_name
      )}\n\n`;
    } else if (isMessageOriginChat(forward)) {
      forwardText += `<b>From Chat:</b>\nTitle: ${escapeHtml(
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
      forwardText += `<b>From Channel:</b>\nTitle: ${escapeHtml(
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
      forwardText += `<b>From Unknown Origin Type:</b> ${escapeHtml(
        forward.type
      )}\n\n`;
    } else {
      // This block is theoretically unreachable but added for exhaustive type checking
      forwardText += `<b>From an unrecognized origin.</b>\n\n`;
    }
  }

  // Add author information if available and enabled
  if (author && preferences.showAuthorInfo) {
    authorText = `<b>👤 AUTHOR</b>\n<b>ID:</b> <code>${author}</code>\n\n`;
  }

  // Add compact information for all display modes
  if (preferences.displayMode === 'compact') {
    // Add message type and ID
    const messageType = update.message?.text ? 'Text' : 
                       update.message?.photo ? 'Photo' : 
                       update.message?.video ? 'Video' : 
                       update.message?.document ? 'Document' : 
                       update.message?.sticker ? 'Sticker' : 'Other';
    
    updateText = `<b>📝 MESSAGE INFO</b>\n`;
    updateText += `<b>Type:</b> ${messageType}\n`;
    
    if (update.message?.text) {
      updateText += `<b>Content:</b> <code>${escapeHtml(update.message.text.substring(0, 100))}</code>${update.message.text.length > 100 ? '...' : ''}\n`;
    }
    
    if (update.message?.message_id) {
      updateText += `<b>Message ID:</b> <code>${update.message.message_id}</code>\n`;
    }
    
    updateText += `<b>Chat ID:</b> <code>${update.message?.chat?.id || 'Unknown'}</code>\n\n`;
  }

  // Add raw update JSON if enabled
  if (preferences.displayMode === 'raw' || preferences.displayMode === 'full') {
    updateText += `<b>🔄 RAW UPDATE</b>\n<pre><code class="language-json">${escapeHtml(
      JSON.stringify(update, null, 2)
    )}</code></pre>`;
  }

  // Combine all sections
  result = forwardText + authorText + updateText;
  
  // Add help text for compact mode
  if (preferences.displayMode === 'compact') {
    result += `\n<i>Use the buttons below to customize the view.</i>`;
  }

  return result;
}

// --------------------
// Bot Commands
// --------------------

// Help command
bot.command("help", async (ctx) => {
  const helpText = `
<b>📋 Bot Commands:</b>

/help - Show this help message
/toggle - Enable/disable bot in groups (admin only)
/mode - Change display mode (compact/full/raw)

<b>Features:</b>
• Shows details about any message you send
• Analyzes forwarded messages
• Interactive buttons to customize the view
• Can be toggled on/off in groups

<b>How to use:</b>
Just send or forward any message to get its details.
Use the buttons below the response to change the display options.
`;

  await ctx.reply(helpText, { 
    parse_mode: "HTML",
  });
});

// Toggle command (admin only in groups)
bot.command("toggle", async (ctx) => {
  // Check if in private chat or user is admin
  const isPrivate = ctx.chat?.type === "private";
  const isAdmin = await isUserAdmin(ctx);
  
  if (!isPrivate && !isAdmin) {
    return ctx.reply("⚠️ Only group admins can use this command.");
  }
  
  // Toggle the bot state
  ctx.session.enabled = !ctx.session.enabled;
  
  const statusText = ctx.session.enabled 
    ? "✅ Bot is now enabled in this chat."
    : "🔕 Bot is now disabled in this chat.";
    
  await ctx.reply(statusText);
});

// Mode command
bot.command("mode", async (ctx) => {
  // Create a keyboard for mode selection
  const keyboard = createViewControlsKeyboard(ctx.session.viewPreferences);
  
  await ctx.reply("Select your preferred display options:", {
    reply_markup: keyboard
  });
});

// --------------------
// Button Handlers
// --------------------

// Handle view mode changes
bot.callbackQuery(/^view_(compact|full|raw)$/, async (ctx) => {
  // Extract the mode from the callback data
  const mode = ctx.match[1] as 'compact' | 'full' | 'raw';
  
  // Update the session
  ctx.session.viewPreferences.displayMode = mode;
  
  // Notify the user
  await ctx.answerCallbackQuery(`Display mode changed to: ${mode}`);
  
  // Try to edit the original message if it exists
  try {
    const keyboard = createViewControlsKeyboard(ctx.session.viewPreferences);
    
    // If we have the callback message, update it
    if (ctx.callbackQuery.message) {
      await ctx.editMessageReplyMarkup({ 
        reply_markup: keyboard 
      });
    }
  } catch (error) {
    console.error("Error updating message:", error);
  }
});

// Handle section toggle buttons
bot.callbackQuery(/^toggle_(forward|author)$/, async (ctx) => {
  // Extract the section from the callback data
  const section = ctx.match[1] as 'forward' | 'author';
  
  // Get the preferences object
  const preferences = ctx.session.viewPreferences;
  
  // Update the appropriate flag
  if (section === 'forward') {
    preferences.showForwardInfo = !preferences.showForwardInfo;
    await ctx.answerCallbackQuery(
      preferences.showForwardInfo ? 
      "Forward info enabled" : 
      "Forward info disabled"
    );
  } else if (section === 'author') {
    preferences.showAuthorInfo = !preferences.showAuthorInfo;
    await ctx.answerCallbackQuery(
      preferences.showAuthorInfo ? 
      "Author info enabled" : 
      "Author info disabled"
    );
  }
  
  // Update the message keyboard
  try {
    const keyboard = createViewControlsKeyboard(preferences);
    
    // If we have the callback message, update it
    if (ctx.callbackQuery.message) {
      await ctx.editMessageReplyMarkup({ 
        reply_markup: keyboard 
      });
    }
  } catch (error) {
    console.error("Error updating message:", error);
  }
});

// --------------------
// Message Handler
// --------------------

// Handle all messages
bot.on("message", async (ctx) => {
  // Skip processing if bot is disabled in this chat
  if (!ctx.session.enabled) {
    return;
  }
  
  const update = ctx.update;
  const author = ctx.from?.id;

  // Extract the forward origin if the message is forwarded
  const forwardOrigin = ctx.msg.forward_origin as AnyMessageOrigin | undefined;

  // Generate the reply text using the helper function
  const text = prettifyUpdate(
    update, 
    ctx.session.viewPreferences,
    author, 
    forwardOrigin
  );

  // Create keyboard for view controls
  const keyboard = createViewControlsKeyboard(ctx.session.viewPreferences);

  // Reply to the user with the formatted update information and buttons
  await ctx.reply(text, { 
    parse_mode: "HTML",
    reply_markup: keyboard
  });
});

// --------------------
// Export the Bot
// --------------------

// Export the bot instance for deployment purposes
export default bot;