// bot.ts

import { 
  apiThrottler, 
  Bot, 
  escapeHtml, 
  freeStorage, 
  InlineKeyboard, 
  session, 
  Update
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
  applyPrivacyMask,
  ensureCompleteSession,
  generateExportCommand,
  getDefaultSession,
  getEffectivePreferences,
  getMessageType,
  importSettings,
  isUserAdmin,
  MessageType,
  MyContext,
  shouldProcessMessageType,
  ViewPreferences
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
  initial: () => {
    // Default session without ctx access - you can't use ctx.chat?.type here
    return ensureCompleteSession({enabled: true});
  },
  getSessionKey: (ctx) => {
    // Here you can access ctx and do any logging
    console.log("Session key for chat type:", ctx.chat?.type);
    
    // Return the session key (usually chat ID or from ID)
    return ctx.chat?.id.toString() ?? "default";
  },
  storage: freeStorage(bot.token),
}));

// Add error handling for entire bot
bot.catch((err) => {
  console.error("Bot global error:", err);
});

// --------------------
// Helper Functions
// --------------------

/**
 * Creates an inline keyboard with view control buttons
 * 
 * @param preferences - Current view preferences
 * @returns Inline keyboard markup
 */
function createViewControlsKeyboard(preferences: ViewPreferences) {
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
    )
    .row()
    // Privacy options
    .text(
      preferences.privacyOptions.maskUserIds ? '✅ Mask User IDs' : '❌ Mask User IDs',
      'privacy_user_ids'
    )
    .text(
      preferences.privacyOptions.maskChatIds ? '✅ Mask Chat IDs' : '❌ Mask Chat IDs',
      'privacy_chat_ids'
    );
}

/**
 * Creates a keyboard for message type filtering
 * 
 * @param filters - Current message filters
 * @returns Inline keyboard markup
 */
function createMessageFiltersKeyboard(session: MyContext['session']) {
  const filters = session.messageFilters;
  const keyboard = new InlineKeyboard()
    .text(
      filters.respondToAll ? '✅ All Messages' : '❌ All Messages',
      'filter_all'
    )
    .row();
  
  // Create rows of message type toggles
  const messageTypes: MessageType[] = [
    'text', 'photo', 'video', 'document', 'audio', 'sticker', 
    'animation', 'voice', 'poll', 'location', 'contact', 'forward'
  ];
  
  // Add 3 types per row
  for (let i = 0; i < messageTypes.length; i += 3) {
    const row = messageTypes.slice(i, i + 3);
    for (const type of row) {
      keyboard.text(
        filters.enabledTypes[type] ? `✅ ${capitalize(type)}` : `❌ ${capitalize(type)}`,
        `filter_${type}`
      );
    }
    keyboard.row();
  }
  
  // Add save button
  keyboard.text('💾 Save Filters', 'filter_save');
  
  return keyboard;
}

/**
 * Creates a keyboard for user preferences options
 */
function createUserPrefsKeyboard(session: MyContext['session']) {
  return new InlineKeyboard()
    .text(
      session.usePerUserPreferences ? '✅ Per-User Preferences' : '❌ Per-User Preferences',
      'userprefs_toggle'
    )
    .row()
    .text('📋 View My Preferences', 'userprefs_view')
    .row()
    .text('🔄 Reset My Preferences', 'userprefs_reset');
}

/**
 * Creates admin control panel keyboard
 */
function createAdminKeyboard(session: MyContext['session']) {
  return new InlineKeyboard()
    .text(
      session.enabled ? '✅ Bot Enabled' : '❌ Bot Disabled',
      'admin_toggle'
    )
    .row()
    .text('📋 Export Settings', 'admin_export')
    .text('🔄 Reset All Settings', 'admin_reset')
    .row()
    .text('👥 User Preferences', 'admin_userprefs')
    .text('🔍 Message Filters', 'admin_filters');
}

/**
 * Capitalizes first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
  update: Update, // Replace 'any' with 'Update' type
  preferences: ViewPreferences,
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

  // Add compact information for compact mode
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

  // Add full information for full mode
  if (preferences.displayMode === 'full') {
    // First add the compact info
    const messageType = update.message?.text ? 'Text' : 
                      update.message?.photo ? 'Photo' : 
                      update.message?.video ? 'Video' : 
                      update.message?.document ? 'Document' : 
                      update.message?.sticker ? 'Sticker' : 'Other';
   
    updateText = `<b>📝 DETAILED MESSAGE INFO</b>\n`;
    updateText += `<b>Type:</b> ${messageType}\n`;
    
    if (update.message?.text) {
      updateText += `<b>Content:</b> <code>${escapeHtml(update.message.text.substring(0, 100))}</code>${update.message.text.length > 100 ? '...' : ''}\n`;
    }
    
    if (update.message?.message_id) {
      updateText += `<b>Message ID:</b> <code>${update.message.message_id}</code>\n`;
    }
    
    updateText += `<b>Chat ID:</b> <code>${update.message?.chat?.id || 'Unknown'}</code>\n\n`;
    
    // Then add the raw JSON too
    updateText += `<b>🔄 RAW UPDATE</b>\n<pre><code class="language-json">${escapeHtml(
      JSON.stringify(update, null, 2)
    )}</code></pre>`;
  }

  // Add raw update JSON for raw mode
  if (preferences.displayMode === 'raw') {
    updateText = `<b>🔄 RAW UPDATE</b>\n<pre><code class="language-json">${escapeHtml(
      JSON.stringify(update, null, 2)
    )}</code></pre>`;
  }

  // Combine all sections
  result = forwardText + authorText + updateText;
  
  // Apply privacy masks if needed (with safety check for undefined privacyOptions)
  result = applyPrivacyMask(result, preferences.privacyOptions || {
    maskUserIds: false,
    maskPhoneNumbers: true,
    maskChatIds: false
  });
  
  // Add help text for compact mode
  if (preferences.displayMode === 'compact') {
    result += `\n<i>Use the buttons below to customize the view.</i>`;
  }

  return result;
}

/**
 * Helper function for when bot is added to a chat
 */
async function handleBotAdded(ctx: MyContext) {
  console.log("Bot added to a chat:", ctx.chat?.id);
  
  // Initialize session with raw display mode for groups/channels
  ctx.session = ensureCompleteSession({}, ctx.chat?.type);
  
  // Enable the bot initially
  ctx.session.enabled = true;
  
  // Send a raw JSON of the join event as requested
  const rawJoinData = `<b>🤖 BOT ADDED TO CHAT</b>\n<pre><code class="language-json">${escapeHtml(
    JSON.stringify(ctx.update, null, 2)
  )}</code></pre>`;
  
  await ctx.reply(rawJoinData, {
    parse_mode: "HTML"
  });
  
  // Also send a welcome message
  await ctx.reply(
    "👋 Hello! I'll analyze messages and show their details.\n\n" +
    "• Use /help to learn about my commands\n" +
    "• Use /toggle to enable/disable me (admin only)\n" +
    "• Use /mode to change display settings\n" +
    "• Use /filter to set which message types I respond to\n" +
    "• Use /privacy to configure privacy options\n" +
    "• Use /admin to access admin control panel (admin only)",
    {
      parse_mode: "HTML"
    }
  );
}

// --------------------
// Bot Event Handlers
// --------------------

// Handle new chat member events
bot.on(["chat_member", "my_chat_member"], async (ctx) => {
  // For chat_member updates
  if ("chat_member" in ctx.update && ctx.update.chat_member) {
    const member = ctx.update.chat_member.new_chat_member;
    const isBot = member.user.id === ctx.me.id;
    const isAdded = member.status === "member" || member.status === "administrator";
    
    if (isBot && isAdded) {
      // Bot was added to a chat
      await handleBotAdded(ctx);
    }
  }
  // For my_chat_member updates
  else if ("my_chat_member" in ctx.update && ctx.update.my_chat_member) {
    const member = ctx.update.my_chat_member.new_chat_member;
    const isBot = member.user.id === ctx.me.id;
    const isAdded = member.status === "member" || member.status === "administrator";
    
    if (isBot && isAdded) {
      // Bot was added to a chat
      await handleBotAdded(ctx);
    }
  }
});

// --------------------
// Bot Commands
// --------------------

// Start command
bot.command("start", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  const startText = `
<b>👋 Welcome to Message Inspector Bot!</b>

This bot helps you analyze messages and understand how they're structured.

<b>Getting Started:</b>
- Try sending any message to see its details
- Use the buttons that appear to customize the view
- Type /help to see all available commands

<b>Quick Commands:</b>
/mode - Change how messages are displayed
/filter - Choose which message types to analyze
/privacy - Configure privacy settings

Just send me any message to get started!
`;

  await ctx.reply(startText, { 
    parse_mode: "HTML",
  });
});

// Help command
bot.command("help", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  const helpText = `
<b>📋 Bot Commands:</b>

/help - Show this help message
/toggle - Enable/disable bot in groups (admin only)
/mode - Change display mode (compact/full/raw)
/filter - Set message types to respond to
/privacy - Configure privacy options
/userprefs - Configure per-user preferences
/admin - Access admin control panel (admin only)
/export - Export your current settings
/import - Import settings (format: /import [code])

<b>Features:</b>
- Shows details about any message you send
- Analyzes forwarded messages with interactive buttons
- Customize which message types trigger responses
- Privacy options to mask sensitive data
- Per-user preference settings
- Export/import settings across chats

<b>How to use:</b>
Just send or forward any message to get its details.
Use the buttons below the response to change display options.
`;

  await ctx.reply(helpText, { 
    parse_mode: "HTML",
  });
});

// Toggle command (admin only in groups)
bot.command("toggle", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
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
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Get effective preferences for the user
  const preferences = getEffectivePreferences(ctx.session, ctx.from?.id);
  
  // Create a keyboard for mode selection
  const keyboard = createViewControlsKeyboard(preferences);
  
  await ctx.reply("Select your preferred display options:", {
    reply_markup: keyboard
  });
});

// Filter command
bot.command("filter", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Create a keyboard for filter settings
  const keyboard = createMessageFiltersKeyboard(ctx.session);
  
  const messageList = Object.entries(ctx.session.messageFilters.enabledTypes)
    .filter(([_, enabled]) => enabled)
    .map(([type]) => capitalize(type))
    .join(", ");
  
  const filterText = ctx.session.messageFilters.respondToAll
    ? "I currently respond to all message types."
    : `I currently respond to: ${messageList || "No message types (bot is effectively disabled)"}`;
  
  await ctx.reply(`${filterText}\n\nSelect message types to toggle:`, {
    reply_markup: keyboard
  });
});

// Privacy command
bot.command("privacy", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Get effective preferences for the user
  const preferences = getEffectivePreferences(ctx.session, ctx.from?.id);
  
  const privacyText = `
<b>🔒 Privacy Settings</b>

Configure how sensitive information is displayed:

- User IDs: ${preferences.privacyOptions.maskUserIds ? '✅ Masked' : '❌ Visible'}
- Chat IDs: ${preferences.privacyOptions.maskChatIds ? '✅ Masked' : '❌ Visible'}
- Phone Numbers: Always Masked

Use the buttons below to toggle settings:
`;
  
  // Create a keyboard with only privacy options
  const keyboard = new InlineKeyboard()
    .text(
      preferences.privacyOptions.maskUserIds ? '✅ Mask User IDs' : '❌ Mask User IDs',
      'privacy_user_ids'
    )
    .row()
    .text(
      preferences.privacyOptions.maskChatIds ? '✅ Mask Chat IDs' : '❌ Mask Chat IDs',
      'privacy_chat_ids'
    );
  
  await ctx.reply(privacyText, {
    parse_mode: "HTML",
    reply_markup: keyboard
  });
});

// User preferences command
bot.command("userprefs", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  const keyboard = createUserPrefsKeyboard(ctx.session);
  
  const userPrefsText = `
<b>👤 User Preferences</b>

Each user can have their own display settings when "Per-User Preferences" is enabled.

Current status: ${ctx.session.usePerUserPreferences ? '✅ Enabled' : '❌ Disabled'}

When enabled, each user's display preferences will be saved and applied only to their interactions with the bot.
`;
  
  await ctx.reply(userPrefsText, {
    parse_mode: "HTML",
    reply_markup: keyboard
  });
});

// Admin command
bot.command("admin", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Check if in private chat or user is admin
  const isPrivate = ctx.chat?.type === "private";
  const isAdmin = await isUserAdmin(ctx);
  
  if (!isPrivate && !isAdmin) {
    return ctx.reply("⚠️ Only group admins can use this command.");
  }
  
  const adminText = `
<b>⚙️ Admin Control Panel</b>

Bot status: ${ctx.session.enabled ? '✅ Enabled' : '❌ Disabled'}
Display mode: ${ctx.session.viewPreferences.displayMode}
Per-user prefs: ${ctx.session.usePerUserPreferences ? '✅ Enabled' : '❌ Disabled'}
Responding to: ${ctx.session.messageFilters.respondToAll ? 'All message types' : 'Selected types only'}

Use the buttons below to manage settings:
`;
  
  const keyboard = createAdminKeyboard(ctx.session);
  
  await ctx.reply(adminText, {
    parse_mode: "HTML",
    reply_markup: keyboard
  });
});

// Export command
bot.command("export", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  const exportCommand = generateExportCommand(ctx.session);
  
  await ctx.reply(
    "<b>📤 Export Settings</b>\n\n" +
    "Copy the command below and use it in any chat with this bot to import these settings:\n\n" +
    `<code>${exportCommand}</code>`,
    {
      parse_mode: "HTML"
    }
  );
});

// Import command
bot.command("import", async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  const args = ctx.message?.text.split(/\s+/);
  
  if (!args || args.length < 2) {
    return ctx.reply(
      "⚠️ Please provide the settings code to import.\n\n" +
      "Usage: /import [code]"
    );
  }
  
  const importCode = args[1];
  const importedSettings = importSettings(importCode);
  
  if (!importedSettings) {
    return ctx.reply("❌ Invalid import code. Please check and try again.");
  }
  
  // Apply the imported settings
  if (importedSettings.viewPreferences) {
    ctx.session.viewPreferences = importedSettings.viewPreferences;
  }
  
  if (importedSettings.messageFilters) {
    ctx.session.messageFilters = importedSettings.messageFilters;
  }
  
  if (importedSettings.usePerUserPreferences !== undefined) {
    ctx.session.usePerUserPreferences = importedSettings.usePerUserPreferences;
  }
  
  await ctx.reply("✅ Settings imported successfully!");
});

// --------------------
// Button Handlers
// --------------------

// Handle view mode changes
bot.callbackQuery(/^view_(compact|full|raw)$/, async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Extract the mode from the callback data
  const mode = ctx.match[1] as 'compact' | 'full' | 'raw';
  
  // Update preferences in the appropriate place
  if (ctx.session.usePerUserPreferences && ctx.from) {
    // Ensure user has a preferences object
    if (!ctx.session.userPreferences[ctx.from.id]) {
      ctx.session.userPreferences[ctx.from.id] = {
        viewPreferences: { ...ctx.session.viewPreferences }
      };
    }
    
    // Update the user's preferences
    ctx.session.userPreferences[ctx.from.id].viewPreferences.displayMode = mode;
  } else {
    // Update global preferences
    ctx.session.viewPreferences.displayMode = mode;
  }
  
  // Notify the user
  await ctx.answerCallbackQuery(`Display mode changed to: ${mode}`);
  
  // Try to edit the original message if it exists
  try {
    const preferences = getEffectivePreferences(ctx.session, ctx.from?.id);
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

// Handle section toggle buttons
bot.callbackQuery(/^toggle_(forward|author)$/, async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Extract the section from the callback data
  const section = ctx.match[1] as 'forward' | 'author';
  
  // Get the right preferences object to update
  let preferences: ViewPreferences;
  if (ctx.session.usePerUserPreferences && ctx.from) {
    // Ensure user has a preferences object
    if (!ctx.session.userPreferences[ctx.from.id]) {
      ctx.session.userPreferences[ctx.from.id] = {
        viewPreferences: { ...ctx.session.viewPreferences }
      };
    }
    
    preferences = ctx.session.userPreferences[ctx.from.id].viewPreferences;
  } else {
    preferences = ctx.session.viewPreferences;
  }
  
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
    const effectivePrefs = getEffectivePreferences(ctx.session, ctx.from?.id);
    const keyboard = createViewControlsKeyboard(effectivePrefs);
    
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

// Handle privacy option toggles
bot.callbackQuery(/^privacy_(user_ids|chat_ids)$/, async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Extract the privacy option from the callback data
  const option = ctx.match[1] as 'user_ids' | 'chat_ids';
  
  // Get the right preferences object to update
  let preferences: ViewPreferences;
  if (ctx.session.usePerUserPreferences && ctx.from) {
    // Ensure user has a preferences object
    if (!ctx.session.userPreferences[ctx.from.id]) {
      ctx.session.userPreferences[ctx.from.id] = {
        viewPreferences: { ...ctx.session.viewPreferences }
      };
    }
    
    preferences = ctx.session.userPreferences[ctx.from.id].viewPreferences;
  } else {
    preferences = ctx.session.viewPreferences;
  }
  
  // Update the appropriate flag
  if (option === 'user_ids') {
    preferences.privacyOptions.maskUserIds = !preferences.privacyOptions.maskUserIds;
    await ctx.answerCallbackQuery(
      preferences.privacyOptions.maskUserIds ? 
      "User IDs will be masked" : 
      "User IDs will be shown"
    );
  } else if (option === 'chat_ids') {
    preferences.privacyOptions.maskChatIds = !preferences.privacyOptions.maskChatIds;
    await ctx.answerCallbackQuery(
      preferences.privacyOptions.maskChatIds ? 
      "Chat IDs will be masked" : 
      "Chat IDs will be shown"
    );
  }
  
  // Update the message keyboard
  try {
    const effectivePrefs = getEffectivePreferences(ctx.session, ctx.from?.id);
    const keyboard = createViewControlsKeyboard(effectivePrefs);
    
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

// Handle message filter toggles
bot.callbackQuery(/^filter_(all|text|photo|video|document|audio|sticker|animation|voice|poll|location|contact|forward|save)$/, async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Extract the filter option from the callback data
  const option = ctx.match[1];
  
  // Handle save button
  if (option === 'save') {
    await ctx.answerCallbackQuery("Filter settings saved!");
    return await ctx.editMessageText(
      "✅ Message filter settings have been saved.\n\n" +
      "Use /filter to change them again.",
      { reply_markup: { inline_keyboard: [] } }
    );
  }
  
  // Handle filter toggles
  if (option === 'all') {
    // Toggle respond to all
    ctx.session.messageFilters.respondToAll = !ctx.session.messageFilters.respondToAll;
    await ctx.answerCallbackQuery(
      ctx.session.messageFilters.respondToAll ?
      "Now responding to all message types" :
      "Now responding only to selected types"
    );
  } else {
    // Toggle individual message type
    const messageType = option as MessageType;
    ctx.session.messageFilters.enabledTypes[messageType] = !ctx.session.messageFilters.enabledTypes[messageType];
    
    await ctx.answerCallbackQuery(
      ctx.session.messageFilters.enabledTypes[messageType] ?
      `Now responding to ${messageType} messages` :
      `No longer responding to ${messageType} messages`
    );
  }
  
  // Update the keyboard
  try {
    const keyboard = createMessageFiltersKeyboard(ctx.session);
    
    if (ctx.callbackQuery.message) {
      await ctx.editMessageReplyMarkup({
        reply_markup: keyboard
      });
    }
  } catch (error) {
    console.error("Error updating filter keyboard:", error);
  }
});

// Handle user preferences toggles
bot.callbackQuery(/^userprefs_(toggle|view|reset)$/, async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Extract the option from the callback data
  const option = ctx.match[1];
  
  if (option === 'toggle') {
    // Toggle per-user preferences
    ctx.session.usePerUserPreferences = !ctx.session.usePerUserPreferences;
    
    await ctx.answerCallbackQuery(
      ctx.session.usePerUserPreferences ?
      "Per-user preferences enabled" :
      "Per-user preferences disabled"
    );
    
    // Update the keyboard
    try {
      const keyboard = createUserPrefsKeyboard(ctx.session);
      
      if (ctx.callbackQuery.message) {
        await ctx.editMessageReplyMarkup({
          reply_markup: keyboard
        });
      }
    } catch (error) {
      console.error("Error updating user prefs keyboard:", error);
    }
  } else if (option === 'view' && ctx.from) {
    // View user's current preferences
    const preferences = getEffectivePreferences(ctx.session, ctx.from.id);
    
    const prefsText = `
<b>👤 Your Current Preferences</b>

Display mode: ${preferences.displayMode}
Show forward info: ${preferences.showForwardInfo ? 'Yes' : 'No'}
Show author info: ${preferences.showAuthorInfo ? 'Yes' : 'No'}
Mask user IDs: ${preferences.privacyOptions.maskUserIds ? 'Yes' : 'No'}
Mask chat IDs: ${preferences.privacyOptions.maskChatIds ? 'Yes' : 'No'}
`;
    
    await ctx.answerCallbackQuery("Showing your preferences");
    await ctx.reply(prefsText, { parse_mode: "HTML" });
  } else if (option === 'reset' && ctx.from) {
    // Reset user preferences to group defaults
    if (ctx.from.id in ctx.session.userPreferences) {
      delete ctx.session.userPreferences[ctx.from.id];
      await ctx.answerCallbackQuery("Your preferences have been reset to group defaults");
    } else {
      await ctx.answerCallbackQuery("You're already using group defaults");
    }
  }
});

// Handle admin panel actions
bot.callbackQuery(/^admin_(toggle|export|reset|userprefs|filters)$/, async (ctx) => {
  // Ensure session is properly initialized
  ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
  
  // Check if user is admin
  const isPrivate = ctx.chat?.type === "private";
  const isAdmin = await isUserAdmin(ctx);
  
  if (!isPrivate && !isAdmin) {
    return ctx.answerCallbackQuery("⚠️ Only admins can use this feature");
  }
  
  // Extract the option from the callback data
  const option = ctx.match[1];
  
  if (option === 'toggle') {
    // Toggle bot enabled state
    ctx.session.enabled = !ctx.session.enabled;
    
    await ctx.answerCallbackQuery(
      ctx.session.enabled ?
      "Bot enabled in this chat" :
      "Bot disabled in this chat"
    );
    
    // Update the keyboard
    try {
      const keyboard = createAdminKeyboard(ctx.session);
      
      if (ctx.callbackQuery.message) {
        await ctx.editMessageReplyMarkup({
          reply_markup: keyboard
        });
      }
    } catch (error) {
      console.error("Error updating admin keyboard:", error);
    }
  } else if (option === 'export') {
    // Generate export command
    const exportCommand = generateExportCommand(ctx.session);
    
    await ctx.answerCallbackQuery("Generated export command");
    await ctx.reply(
      "<b>📤 Export Settings</b>\n\n" +
      "Copy the command below and use it in any chat with this bot to import these settings:\n\n" +
      `<code>${exportCommand}</code>`,
      {
        parse_mode: "HTML"
      }
    );
  } else if (option === 'reset') {
    // Reset all settings to defaults
    ctx.session = ensureCompleteSession({}, ctx.chat?.type);
    
    // But keep the bot enabled
    ctx.session.enabled = true;
    
    await ctx.answerCallbackQuery("All settings reset to defaults");
    
    // Update the admin panel message
    const adminText = `
<b>⚙️ Admin Control Panel</b>

All settings have been reset to defaults.

Bot status: ✅ Enabled
Display mode: ${ctx.session.viewPreferences.displayMode}
Per-user prefs: ❌ Disabled
Responding to: All message types
`;
    
    await ctx.editMessageText(adminText, {
      parse_mode: "HTML",
      reply_markup: createAdminKeyboard(ctx.session)
    });
  } else if (option === 'userprefs') {
    // Go to user preferences panel
    await ctx.answerCallbackQuery("Opening user preferences panel");
    
    const userPrefsText = `
<b>👤 User Preferences</b>

Each user can have their own display settings when "Per-User Preferences" is enabled.

Current status: ${ctx.session.usePerUserPreferences ? '✅ Enabled' : '❌ Disabled'}

When enabled, each user's display preferences will be saved and applied only to their interactions with the bot.
`;
    
    await ctx.editMessageText(userPrefsText, {
      parse_mode: "HTML",
      reply_markup: createUserPrefsKeyboard(ctx.session)
    });
  } else if (option === 'filters') {
    // Go to message filters panel
    await ctx.answerCallbackQuery("Opening message filters panel");
    
    const messageList = Object.entries(ctx.session.messageFilters.enabledTypes)
      .filter(([_, enabled]) => enabled)
      .map(([type]) => capitalize(type))
      .join(", ");
    
    const filterText = ctx.session.messageFilters.respondToAll
      ? "Bot currently responds to all message types."
      : `Bot currently responds to: ${messageList || "No message types (bot is effectively disabled)"}`;
    
    await ctx.editMessageText(`${filterText}\n\nSelect message types to toggle:`, {
      reply_markup: createMessageFiltersKeyboard(ctx.session)
    });
  }
});

// --------------------
// Message Handler
// --------------------

// Handle all messages
bot.on("message", async (ctx) => {
  try {
    console.log("Received message:", ctx.message);
    
    // Ensure session is properly initialized
    ctx.session = ensureCompleteSession(ctx.session, ctx.chat?.type);
    
    // Skip processing if bot is disabled in this chat
    if (!ctx.session.enabled) {
      return;
    }
    
    // Check message type and apply filter if needed
    const messageType = getMessageType(ctx);
    if (messageType && !shouldProcessMessageType(ctx.session.messageFilters, messageType)) {
      return;
    }
    
    const update = ctx.update;
    const author = ctx.from?.id;

    // Extract the forward origin if the message is forwarded
    const forwardOrigin = ctx.message?.forward_origin as AnyMessageOrigin | undefined;

    // Get effective preferences for this user and ensure it has all required fields
    const preferences = getEffectivePreferences(ctx.session, author);
    
    // Make sure privacyOptions exists
    if (!preferences.privacyOptions) {
      preferences.privacyOptions = {
        maskUserIds: false,
        maskPhoneNumbers: true,
        maskChatIds: false
      };
    }

    // Generate the reply text using the helper function
    const text = prettifyUpdate(
      update, 
      preferences,
      author, 
      forwardOrigin
    );

    // Create keyboard for view controls
    const keyboard = createViewControlsKeyboard(preferences);

    // Reply to the user with the formatted update information and buttons
    await ctx.reply(text, { 
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  } catch (error) {
    console.error("Error in message handler:", error);
    await ctx.reply("Sorry, I encountered an error while processing your message.");
  }
});

// --------------------
// Export the Bot
// --------------------

// Export the bot instance for deployment purposes
export default bot;