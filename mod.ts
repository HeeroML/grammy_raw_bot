import { Bot, webhookCallback } from "https://deno.land/x/grammy/mod.ts";
// You might modify this to the correct way to import your `Bot` object.
import bot from "./bot.ts";

import { serve } from "https://deno.land/std/http/server.ts";

const handleUpdate = webhookCallback(bot, "std/http");

serve(async (req: any) => {
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