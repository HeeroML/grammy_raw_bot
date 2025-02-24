import { serve, webhookCallback } from "./deps.ts";
import bot from "./bot.ts";

// Initialize webhook handler
const handleUpdate = webhookCallback(bot, "std/http");

// Start serving the webhook
console.log("Starting bot webhook server...");

serve(async (req: Request) => {
  if (req.method == "POST") {
    try {
      return await handleUpdate(req);
    } catch (err) {
      console.error("Error handling update:", err);
      return new Response();
    }
  }
  
  // Handle ping or health check
  if (req.method == "GET") {
    return new Response("Bot is running", { status: 200 });
  }
  
  return new Response("Method not allowed", { status: 405 });
});