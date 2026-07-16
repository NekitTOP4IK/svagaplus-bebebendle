# 🤖 Bebebendle Telegram Bot (Python + aiogram)

Python implementation of the Telegram bot for Bebebendle using aiogram framework.

## 📋 Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Same SQLite database as the frontend (`../db/bebendle.sqlite`)

## 🚀 Quick Start

### 1. Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Setup Environment

```bash
cd bot
cp ../.env.sample .env
```

Edit `.env` and add your bot token from @BotFather:
```env
BOT_TOKEN=your_bot_token_here
```

### 3. Install Dependencies

```bash
uv sync
```

### 4. Run the Bot

```bash
uv run python src/main.py
```

## 📁 Structure

```
bot/
├── src/
│   ├── __init__.py      # Package initialization
│   ├── main.py          # Bot entry point with handlers
│   └── database.py      # Database connection module
├── .env                 # Environment variables (not in git)
├── .env.example         # Example environment file
├── pyproject.toml       # Project configuration and dependencies
└── README.md            # This file
```

## 🎯 Features

- **/start** - Welcome message
- **/suggest** - Multi-step wizard to suggest new scran
  1. Photo upload
  2. Name input
  3. Description (optional)
  4. Price
  5. Confirmation
- **/status** - Check your suggestions status
- **/help** - Show help information

## 🗄️ Database

The bot connects to the shared PostgreSQL database (configured via env, typically via docker-compose):
- **Engine**: asyncpg via `DATABASE_URL` (preferred) or `POSTGRES_*` fallback
- **Tables involved**: `scrans` (incl. `telegram_id`, nullable `is_subscriber_at_submit`, `subscriber_checked_at`, `submitted_by_user_id`), plus `users` for accounts/cache
- **Library**: asyncpg

When a user suggests a scran:
- `approved` is set to false
- `telegram_id` stores the user's Telegram ID
- `is_subscriber_at_submit` is `true`/`false` when confirmed, or `null` when status is unknown
- pending suggestions are capped at 6 with a transaction advisory lock to close races
- Admin can approve it via the web admin panel

## 🛠️ Development

### Install dev dependencies

```bash
uv sync --extra dev
```

### Run linter

```bash
uv run ruff check src/
uv run ruff check --fix src/
```

### Run type checker

```bash
uv run mypy src/
```

### Run tests

```bash
uv run pytest
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | Yes |
| `BEBEBENDLE_INTERNAL_URL` | Base URL for bebebendle (e.g. http://next:3000) | No (defaults to docker service) |
| `BEBEBENDLE_INTERNAL_SECRET` | Secret for calling Bebebendle internal APIs | Yes for SVAGA+ features |
| `DATABASE_URL` | Authoritative PostgreSQL DSN | Preferred |
| `POSTGRES_*` | Host/port/db/user/pass fallback when `DATABASE_URL` is unset | Local Compose |

### Bot Commands

Set up commands in BotFather:

```
start - Запустить бота
suggest - Предложить блюдо
status - Проверить статус предложений
help - Показать помощь
```

## 📱 Bot Flow

1. User sends `/suggest`
2. Bot asks for photo
3. Bot asks for name (2-100 chars)
4. Bot asks for description (optional, max 500 chars)
5. Bot asks for price (0-1,000,000 rubles)
6. Bot shows preview and asks for confirmation
7. On confirmation, bot fetches Olesha-scoped SVAGA+ status via Bebebendle internal API
8. Saves with `approved=false` and a nullable `is_subscriber_at_submit` snapshot
9. Admin can approve via web panel at `/admin` (subscriber badges, null = «Не проверено»)

## 🔗 Integration with Frontend

The bot and frontend share the same PostgreSQL DB:
- Frontend reads scrans for the daily game
- Bot inserts new scrans as "pending" (with nullable subscriber snapshot)
- Admin panel shows pending scrans (hybrid queue; only confirmed subscribers get priority)
- Once approved, scran becomes available for the daily game

## 🔗 SVAGA+ Subscriber Status

- On `/suggest` confirmation, bot calls:
  `GET /api/internal/svaga/subscription-status?telegram_id=...`
  with `X-Internal-Secret: $BEBEBENDLE_INTERNAL_SECRET`
- Response contract: `{ isSubscriber, source, checkedAt, error }` where
  `source` is `fresh` | `cache` | `stale_cache` | `unknown`
- `unknown` / outages become `is_subscriber_at_submit = null` (never invented `false`)
- Six-pending cap is enforced with a transactional advisory lock
- Profile UI checks subscription via «Проверить подписку» (not «link account»)

Anonymous play on the web is unaffected (fingerprint + session only).

## 📝 Notes

- User sessions are stored in memory (FSMContext from aiogram)
- Sessions timeout after being inactive (handled by aiogram)
- Database connections are managed per-operation using async context managers
- The bot uses polling mode (no webhook setup required for local development)

## 🐛 Troubleshooting

**Bot doesn't start?**
- Check if `BOT_TOKEN` is set in `.env`
- Verify database file exists at `../db/bebendle.sqlite`

**Database errors?**
- Ensure migrations are run in the main project: `bunx drizzle-kit migrate`
- Check file permissions on the database

**Import errors?**
- Make sure you're running from the `bot` directory
- Use `uv run python src/main.py` instead of `python src/main.py`
