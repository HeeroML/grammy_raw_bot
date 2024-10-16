import { MessageOriginChannel, MessageOriginChat, MessageOriginHiddenUser, MessageOriginUser } from "https://deno.land/x/grammy_types@v3.14.0/mod.ts";

// Define the User interface
export interface User {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    // Add other User fields if necessary
  }
  
  // Define the Chat interface
  export interface Chat {
    id: number;
    title: string;
    type: string;
    // Add other Chat fields if necessary
  }
  
  // Base MessageOrigin interface
  export interface MessageOriginBase {
    type: string; // Keep as string to allow unknown types
    date: number;
  }
  
  // MessageOriginUnknown: For any other unknown types
  export interface MessageOriginUnknown extends MessageOriginBase {
    // No additional fields
  }
  
  // Union type for all possible MessageOrigin subtypes
  export type AnyMessageOrigin =
    | MessageOriginUser
    | MessageOriginHiddenUser
    | MessageOriginChat
    | MessageOriginChannel
    | MessageOriginUnknown; // Include the unknown type
  