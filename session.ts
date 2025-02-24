import { BaseContext, SessionFlavor } from "./deps.ts";
import { AnyMessageOrigin } from "./types.ts";

/**
 * Session data structure for the bot
 */
export interface SessionData {
  /**
   * Whether the bot is enabled in a particular chat
   * Default is true
   */
  enabled: boolean;
  
  /**
   * View preferences for how updates are displayed
   */
  viewPreferences: {
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
  };
}

/**
 * Default session data
 */
export const DEFAULT_SESSION: SessionData = {
  enabled: true,
  viewPreferences: {
    displayMode: 'compact',
    showForwardInfo: true,
    showAuthorInfo: true
  }
};

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
 * Helper to format update info based on display preferences
 */
export function formatUpdateInfo(
  update: any,
  preferences: SessionData['viewPreferences'],
  author?: number,
  forward?: AnyMessageOrigin
): {
  text: string;
  showRaw: boolean;
  showForward: boolean;
  showAuthor: boolean;
} {
  let text = '';
  let forwardText = '';
  let authorText = '';
  let rawUpdateText = '';
  
  // Determine what to show based on preferences
  const showRaw = preferences.displayMode === 'raw' || preferences.displayMode === 'full';
  const showForward = preferences.showForwardInfo && !!forward;
  const showAuthor = preferences.showAuthorInfo && !!author;
  
  return {
    text,
    showRaw,
    showForward,
    showAuthor
  };
}
