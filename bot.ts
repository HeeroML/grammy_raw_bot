import { apiThrottler, Bot, escapeHtml } from "./deps.ts";

const token = Deno.env.get("TOKEN");
if (token === undefined) throw new Error("Env var TOKEN required for bot!");
const bot = new Bot(token);

const throttler = apiThrottler();
bot.api.config.use(throttler);

bot.on("msg", async (ctx) => {
  const update = ctx.update;
  const author = ctx.from?.id;
  const forward = ctx.msg.forward_from?.id;
  const text = prettifyUpdate(update, author, forward);
  await ctx.reply(text, { parse_mode: "HTML" });
});

function prettifyUpdate(
  update: unknown,
  author?: number,
  forward?: number,
): string {
  const updateText = `<code>${escapeHtml(JSON.stringify(update, null, 2))}</code>`
  const authorText = author
    ? `<b>Telegram ID's:</b>\nForwarded User ID: <code>${author}</code>\n\n`
    : "";
  const forwardText = forward
    ? `<b>Telegram ID's: </b>\nForwarded User ID: <code>${forward}</code>\n\n`
    : "";
  return forwardText + authorText + updateText;
}

export default bot;
