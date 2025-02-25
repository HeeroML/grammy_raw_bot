# Telegram Message Inspector Bot

Outputs RAW-Data or Formats out for human reading

## Commands

- `/help` - Show available commands and features
- `/toggle` - Enable/disable the bot (admin only in groups)
- `/mode` - Change display mode (compact/full/raw)
- `/filter` - Set which message types trigger responses
- `/privacy` - Configure privacy options
- `/userprefs` - Configure per-user preferences
- `/admin` - Access admin control panel (admin only)
- `/export` - Export your current settings
- `/import` - Import settings (format: `/import [code]`)

## Setup

### Prerequisites
- Deno runtime
- Telegram Bot Token (obtain from @BotFather)

### Installation
1. Clone this repository
2. Set the `TOKEN` environment variable with your Telegram bot token
3. Run with Deno: `deno run --allow-net --allow-env mod.ts`

### Commands
Set the following commands in BotFather:
```
help - Show usage instructions and available commands
toggle - Enable or disable the bot (admin only in groups)
mode - Change display mode and settings
filter - Set which message types trigger bot responses
privacy - Configure privacy and masking options
userprefs - Set up personal display preferences
admin - Access admin control panel (admin only)
export - Export your current settings
import - Import settings from another chat
```
