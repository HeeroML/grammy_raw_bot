import { serve, webhookCallback } from "./deps.ts";
import bot from "./bot.ts";

const handleUpdate = webhookCallback(bot, "std/http");

serve(async (req: Request) => {
  if (req.method == "POST") {
    try {
      return await handleUpdate(req);
    } catch (err) {
      console.error(err);
      return new Response();
    }
  }
  return new Response();
});
