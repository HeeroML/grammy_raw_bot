import {Bot, BotError, Context, NextFunction, session, SessionFlavor} from "https://deno.land/x/grammy/mod.ts";
import { run } from "https://deno.land/x/grammy_runner/mod.ts";
import "https://deno.land/x/dotenv/load.ts";
import {langDetect} from "https://deno.land/x/grammyjs_lang@v0.0.1/src/index.ts";
import { i18n } from "https://deno.land/x/grammyjs_lang@v0.0.1/src/deps.deno.ts";
import { escapeHtml } from "https://deno.land/x/escape/mod.ts";

interface SessionData {
  pizzaCount: number;
}

interface i18nFlavor {
  i18n: i18n;
}

type i18nFlavorContext = Context & i18nFlavor & SessionFlavor<SessionData>

const bot = new Bot<i18nFlavorContext>(Deno.env.get("TOKEN") || ""); // <-- place your token inside this string
const initOptions = {
  debug: false,
  fallbackLng:"ru",
  resources: {
    en: {
      translation: {
        "key": "hello world"
      }
    },
    de: {
      translation: {
        "key": "Hallo Welt"
      }
    },
    ru: {
      translation: {
        "key": "Das kann ich nicht"
      }
    }
  }
}
function initial(): SessionData {
  return { pizzaCount: 0 };
}
bot.use(session({ initial }));
bot.use(langDetect(initOptions, true));
bot.command("i18n", async (ctx) => {
  await ctx.reply(ctx.i18n.t('key'));
});

bot.command("langen", async (ctx) => {
  await ctx.i18n.changeLanguage('en');
  await ctx.reply(ctx.i18n.t('key'));
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
run(bot);
