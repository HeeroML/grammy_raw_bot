import {Bot, BotError, Context, NextFunction, session, SessionFlavor, webhookCallback} from "https://deno.land/x/grammy/mod.ts";
import { escapeHtml } from "https://deno.land/x/escape/mod.ts";
//import { run } from "https://deno.land/x/grammy_runner/mod.ts";
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
interface SessionData {
  pizzaCount: number;
}

type MyContext = Context & SessionFlavor<SessionData>

const bot = new Bot<MyContext>(Deno.env.get("TOKEN") || ""); // <-- place your token inside this string

function initial(): SessionData {
  return { pizzaCount: 0 };
}
bot.use(session({ initial }));
bot.command("pizza", async (ctx) => {
  await ctx.reply(ctx.session.pizzaCount.toString());
});

bot.command("addPizza", async (ctx) => {
  ctx.session.pizzaCount += 1;
  await ctx.reply(ctx.session.pizzaCount.toString());
});

bot.command("removePizza", async (ctx) => {
  ctx.session.pizzaCount -= 1;
  await ctx.reply(ctx.session.pizzaCount.toString());
});

bot.on("msg", async (ctx) => {
  const raw_text = escapeHtml(JSON.stringify(ctx.update, null, 3) );
  if (ctx.message?.forward_from) {
    await ctx.reply(
      "<b>Telegram ID's:</b>\nForwarded User ID: <code>" +
        ctx.message.forward_from.id +
        "</code>\nOwn User ID:\n<code>" +
        ctx.from.id +
        "</code>\n\n" +
        "<b>Raw Update Data:</b>\n<code>" +
        raw_text + "</code>",
      { parse_mode: "HTML" }
    );
  } else {
    await ctx.reply(
      "<b>Own User ID:</b> <code>" +
        ctx.from?.id +
        "</code>\n\n" +
        "<b>Raw Update Data:</b>\n<code>" +
        raw_text+ "</code>",
      { parse_mode: "HTML" }
    );
  }
});
bot.catch(errorHandler);

function errorHandler(err: BotError) {
  console.error((err));
}
//run(bot)

const router = new Router();
router.get("/", (ctx) => {
  ctx.response.body = "Hello world!";
});

const app = new Application();
app.use(router.routes());
app.use(webhookCallback(bot, "oak"));
app.addEventListener(
  "listen",
  (e) => console.log("Listening on http://localhost:8080"),
);
await app.listen({ port: 8080 });
