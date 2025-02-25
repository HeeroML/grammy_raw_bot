import { BaseContext, SessionFlavor } from "./deps.ts";

/**
 * Message types the bot can filter on
 */
export type MessageType = 'text' | 'photo' | 'video' | 'document' | 'audio' | 'sticker' | 'animation' | 'voice' | 'poll' | 'location' | 'contact' | 'forward';

/**
 * View preferences for display settings
 */
export interface ViewPreferences {
  /**
   * Display mode for the update information
   * - 'compact': Shows a summarized version
   * - 'full': Shows all details
   * - 'raw': Shows only raw JSON
   */
  displayMode: 'compact' | 'full' | 'raw';
  
  /**
   * Whether to show forward information when available
   */
  showForwardInfo: boolean;
  
  /**
   * Whether to show the author information
   */
  showAuthorInfo: boolean;
  
  /**
   * Privacy options for sensitive data
   */
  privacyOptions: {
    /**
     * Whether to mask user IDs
     */
    maskUserIds: boolean;
    
    /**
     * Whether to mask phone numbers
     */
    maskPhoneNumbers: boolean;
    
    /**
     * Whether to mask chat IDs
     */
    maskChatIds: boolean;
  };
}

/**
 * Message type filters
 */
export interface MessageFilters {
  /**
   * Enabled message types
   */
  enabledTypes: Record<MessageType, boolean>;
  
  /**
   * Whether to respond to all message types
   */
  respondToAll: boolean;
}

/**
 * User preferences within a chat
 */
export interface UserPreferences {
  /**
   * View preferences for this user
   */
  viewPreferences: ViewPreferences;
}

/**
 * Session data structure for the bot
 */
export interface SessionData {
  /**
   * Whether the bot is enabled in a particular chat
   */
  enabled: boolean;
  
  /**
   * Group-wide view preferences (default for all users)
   */
  viewPreferences: ViewPreferences;
  
  /**
   * Message type filters
   */
  messageFilters: MessageFilters;
  
  /**
   * Whether to use per-user preferences
   */
  usePerUserPreferences: boolean;
  
  /**
   * User-specific preferences, keyed by user ID
   */
  userPreferences: Record<number, UserPreferences>;
}

/**
 * Get default message filters
 */
export function getDefaultMessageFilters(): MessageFilters {
  return {
    enabledTypes: {
      text: true,
      photo: true,
      video: true,
      document: true,
      audio: true,
      sticker: true,
      animation: true,
      voice: true,
      poll: true,
      location: true,
      contact: true,
      forward: true
    },
    respondToAll: true
  };
}

/**
 * Get default view preferences
 */
export function getDefaultViewPreferences(isGroup = false): ViewPreferences {
  return {
    // Use raw JSON for groups/channels by default, compact for private
    displayMode: isGroup ? 'raw' : 'compact',
    showForwardInfo: true,
    showAuthorInfo: true,
    privacyOptions: {
      maskUserIds: false,
      maskPhoneNumbers: true,
      maskChatIds: false
    }
  };
}

/**
 * Get default session data based on chat type
 */
export function getDefaultSession(chatType?: string): SessionData {
  // Check if group/channel
  const isGroup = chatType === 'group' || chatType === 'supergroup' || chatType === 'channel';
  
  return {
    // Enable by default only in private chats
    enabled: chatType === 'private',
    
    // Default view preferences
    viewPreferences: getDefaultViewPreferences(isGroup),
    
    // Default message filters
    messageFilters: getDefaultMessageFilters(),
    
    // Disable per-user preferences by default
    usePerUserPreferences: false,
    
    // Empty user preferences
    userPreferences: {}
  };
}

/**
 * Context type with session flavor
 */
export type MyContext = BaseContext & SessionFlavor<SessionData>;

/**
 * Helper to check if user is admin in a group chat
 */
export async function isUserAdmin(ctx: MyContext): Promise<boolean> {
  // If not in a group or supergroup, return false
  if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
    return false;
  }

  // If no user, return false
  if (!ctx.from) {
    return false;
  }

  try {
    // Get chat member info for the user
    const chatMember = await ctx.getChatMember(ctx.from.id);
    
    // Check if user is an admin or creator
    return ['administrator', 'creator'].includes(chatMember.status);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Ensures session has all required properties
 * Adds missing properties with defaults if needed
 */
export function ensureCompleteSession(session: Partial<SessionData>, chatType?: string): SessionData {
  const isGroup = chatType === 'group' || chatType === 'supergroup' || chatType === 'channel';
  
  // Create a complete session by merging with defaults for any missing parts
  const completeSession: SessionData = {
    // Use existing enabled status or default based on chat type
    enabled: session.enabled ?? (chatType === 'private'),
    
    // Use existing view preferences or defaults
    viewPreferences: session.viewPreferences ?? getDefaultViewPreferences(isGroup),
    
    // Use existing message filters or defaults
    messageFilters: session.messageFilters ?? getDefaultMessageFilters(),
    
    // Use existing per-user preference setting or default to false
    usePerUserPreferences: session.usePerUserPreferences ?? false,
    
    // Use existing user preferences or empty object
    userPreferences: session.userPreferences ?? {}
  };
  
  return completeSession;
}

/**
 * Get effective view preferences for a user with safety checks
 */
export function getEffectivePreferences(
  sessionData: Partial<SessionData>, 
  userId?: number
): ViewPreferences {
  // Ensure we have a complete session to work with
  const session = ensureCompleteSession(sessionData);
  
  // If per-user preferences are disabled or no user ID, return group preferences
  if (!session.usePerUserPreferences || !userId) {
    return session.viewPreferences;
  }
  
  // If user has preferences, return those
  if (session.userPreferences[userId]) {
    return session.userPreferences[userId].viewPreferences;
  }
  
  // Otherwise, return group preferences
  return session.viewPreferences;
}

/**
 * Check if a message type should be processed based on filters
 * With added safety checks for undefined values
 */
export function shouldProcessMessageType(
  filters: MessageFilters | undefined,
  messageType: MessageType
): boolean {
  // If filters are undefined or missing, default to true (process all messages)
  if (!filters) {
    return true;
  }
  
  // If respondToAll is true or undefined (for backward compatibility), return true
  if (filters.respondToAll !== false) {
    return true;
  }
  
  // Check if the specific message type is enabled
  // If enabledTypes is undefined or the type isn't defined, default to true
  if (!filters.enabledTypes) {
    return true;
  }
  
  return filters.enabledTypes[messageType] || false;
}

/**
 * Get message type from context
 */
export function getMessageType(ctx: MyContext): MessageType | null {
  if (!ctx.message) {
    return null;
  }
  
  // Check for forwarded message using forward_origin instead of forward_date
  if (ctx.message.forward_origin) {
    return 'forward';
  } else if (ctx.message.text) {
    return 'text';
  } else if (ctx.message.photo) {
    return 'photo';
  } else if (ctx.message.video) {
    return 'video';
  } else if (ctx.message.document) {
    return 'document';
  } else if (ctx.message.audio) {
    return 'audio';
  } else if (ctx.message.sticker) {
    return 'sticker';
  } else if (ctx.message.animation) {
    return 'animation';
  } else if (ctx.message.voice) {
    return 'voice';
  } else if (ctx.message.poll) {
    return 'poll';
  } else if (ctx.message.location) {
    return 'location';
  } else if (ctx.message.contact) {
    return 'contact';
  }
  
  return null;
}
/**
 * Generate export command for current settings
 */
export function generateExportCommand(sessionData: SessionData): string {
  // Create a compressed representation of settings
  const exportObj = {
    v: sessionData.viewPreferences,
    f: sessionData.messageFilters,
    u: sessionData.usePerUserPreferences
  };
  
  // Convert to Base64
  const jsonStr = JSON.stringify(exportObj);
  const base64 = btoa(jsonStr);
  
  return `/import ${base64}`;
}

/**
 * Import settings from export command
 */
export function importSettings(base64: string): Partial<SessionData> | null {
  try {
    // Decode Base64
    const jsonStr = atob(base64);
    const importObj = JSON.parse(jsonStr);
    
    // Validate and convert back to session data
    return {
      viewPreferences: importObj.v,
      messageFilters: importObj.f,
      usePerUserPreferences: importObj.u
    };
  } catch (error) {
    console.error('Error importing settings:', error);
    return null;
  }
}

/**
 * Apply privacy mask if needed
 */
export function applyPrivacyMask(
  text: string, 
  privacyOptions: ViewPreferences['privacyOptions']
): string {
  let result = text;
  
  // Mask user IDs
  if (privacyOptions.maskUserIds) {
    // Replace user IDs (commonly shown as digits within 8-10 digits)
    result = result.replace(/(\d{8,10})/g, '****$1****');
  }
  
  // Mask phone numbers
  if (privacyOptions.maskPhoneNumbers) {
    // Common phone number patterns
    result = result.replace(/(\+\d{1,3})\d{6,}/g, '$1******');
  }
  
  // Mask chat IDs
  if (privacyOptions.maskChatIds) {
    // Chat IDs often start with -100 for groups/channels
    result = result.replace(/(-100\d{6,})/g, '****$1****');
  }
  
  return result;
}