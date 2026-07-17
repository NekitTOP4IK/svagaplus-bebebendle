"""Bebebendle Telegram Bot - Python implementation using aiogram."""

import asyncio
import logging
import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Literal

import aiofiles
import aiohttp
from aiogram import Bot, Dispatcher, F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from dotenv import load_dotenv

from database import Database, PendingSuggestionLimitError
from health import start_health_server

# Load .env from project root if available (for non-Docker runs)
root_env = Path(__file__).resolve().parents[2] / ".env"
if root_env.exists():
    load_dotenv(root_env)
else:
    load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Bot configuration
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN environment variable is not set")

# Internal bebebendle API config for SVAGA+ subscriber status (used by bot suggestions)
BEBEBENDLE_INTERNAL_URL = os.getenv("BEBEBENDLE_INTERNAL_URL", "http://next:3000")
BEBEBENDLE_INTERNAL_SECRET = os.getenv("BEBEBENDLE_INTERNAL_SECRET")

# Initialize bot and dispatcher
bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(storage=storage)
router = Router()

# Initialize database
db = Database()

_uploads = os.getenv("UPLOADS_DIR")
if _uploads:
    UPLOADS_DIR = Path(_uploads)
elif Path.cwd() == Path("/app"):
    UPLOADS_DIR = Path("/app/uploads")
else:
    UPLOADS_DIR = Path.cwd().parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


async def save_uploaded_photo(file_id: str) -> str:
    file = await bot.get_file(file_id)
    if not file.file_path:
        raise ValueError("File path not available")

    file_content = await bot.download_file(file.file_path)
    if not file_content:
        raise ValueError("Failed to download file content")

    file_ext = Path(file.file_path).suffix or ".jpg"
    filename = f"{uuid.uuid4()}{file_ext}"
    local_path = UPLOADS_DIR / filename

    async with aiofiles.open(local_path, "wb") as f:
        await f.write(file_content.read())

    return f"/cdn/{filename}"


def get_media_input(image_url: str) -> str | FSInputFile:
    if image_url.startswith("/cdn/"):
        local_path = UPLOADS_DIR / image_url.replace("/cdn/", "")
        return FSInputFile(str(local_path))
    if image_url.startswith("/api/images/"):
        local_path = UPLOADS_DIR / image_url.replace("/api/images/", "")
        return FSInputFile(str(local_path))
    if image_url.startswith("/uploads/"):
        local_path = UPLOADS_DIR / image_url.replace("/uploads/", "")
        return FSInputFile(str(local_path))
    return image_url


@dataclass(frozen=True)
class SubscriberSnapshot:
    is_subscriber: bool | None
    checked_at: datetime | None
    source: Literal["fresh", "cache", "stale_cache", "unknown"]


def _unknown_snapshot() -> SubscriberSnapshot:
    return SubscriberSnapshot(None, None, "unknown")


def _parse_checked_at(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def get_svaga_subscriber_status(telegram_id: str) -> SubscriberSnapshot:
    """Fetch SVAGA+ subscriber status for a Telegram user via bebebendle's internal API.

    Never converts outages into a confirmed non-subscriber result.
    """
    if not BEBEBENDLE_INTERNAL_URL or not BEBEBENDLE_INTERNAL_SECRET:
        logger.warning(
            "BEBEBENDLE_INTERNAL_URL or BEBEBENDLE_INTERNAL_SECRET not configured; status unknown"
        )
        return _unknown_snapshot()

    url = f"{BEBEBENDLE_INTERNAL_URL.rstrip('/')}/api/internal/svaga/subscription-status"
    params = {"telegram_id": telegram_id}
    headers = {"X-Internal-Secret": BEBEBENDLE_INTERNAL_SECRET}
    timeout = aiohttp.ClientTimeout(total=5.0)

    try:
        async with (
            aiohttp.ClientSession(timeout=timeout) as session,
            session.get(url, params=params, headers=headers) as response,
        ):
            if response.status != 200:
                text = await response.text()
                logger.warning(
                    "SVAGA status fetch failed for %s: HTTP %s %s",
                    telegram_id,
                    response.status,
                    text[:200],
                )
                return _unknown_snapshot()

            data = await response.json()
            source = data.get("source")
            if source not in ("fresh", "cache", "stale_cache", "unknown"):
                return _unknown_snapshot()

            raw_sub = data.get("isSubscriber")
            if source == "unknown":
                return SubscriberSnapshot(None, None, "unknown")
            if not isinstance(raw_sub, bool):
                return _unknown_snapshot()

            checked_at = _parse_checked_at(data.get("checkedAt"))
            logger.info(
                "Fetched SVAGA subscriber status for telegram_id=%s: "
                "isSubscriber=%s source=%s",
                telegram_id,
                raw_sub,
                source,
            )
            return SubscriberSnapshot(raw_sub, checked_at, source)
    except TimeoutError:
        logger.error(f"Timeout fetching SVAGA subscriber status for {telegram_id}")
        return _unknown_snapshot()
    except Exception as e:
        logger.error(f"Error fetching SVAGA subscriber status for {telegram_id}: {e}")
        return _unknown_snapshot()


class SuggestStates(StatesGroup):
    """States for the suggest scran wizard."""

    photo = State()
    name = State()
    description = State()
    price = State()
    confirmation = State()


@asynccontextmanager
async def database_session() -> AsyncIterator[Database]:
    """Async context manager for database sessions."""
    await db.connect()
    try:
        yield db
    finally:
        await db.close()


@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    """Handle /start command."""
    welcome_text = (
        "👋 Привет! Я овсянка, бот бебебендла.\n\n"
        "Я помогу тебе предложить новое блюдо для дейлика.\n\n"
        "📋 Доступные команды:\n"
        "/suggest - Предложить новое блюдо\n"
        "/help - Показать помощь\n\n"
    )
    await message.answer(welcome_text)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    """Handle /help command."""
    help_text = (
        "🤖 Помощь по боту бебебендла\n\n"
        "Как предложить блюдо:\n"
        "1. Используй команду /suggest\n"
        "2. Отправь фото блюда\n"
        "3. Напиши название (2-100 символов)\n"
        "4. Добавь описание (или пропусти)\n"
        "5. Укажи примерную себестоимость в рублях\n"
        "6. Подтверди предложение\n\n"
        "Ограничения:\n"
        "• Можно предлагать блюда круглосуточно\n"
        "• Администратор проверяет предложения перед публикацией\n"
        "• Не допускаются неприемлемые изображения\n\n"
        "Команды:\n"
        "/suggest - Предложить блюдо\n"
        "/vote - Проголосовать за блюда\n"
        "/help - Эта помощь\n\n"
        "Психологическая помощь по РФ:\n"
        "8 (800) 333-44-34\n"
        "Звонок бесплатный"
    )
    await message.answer(help_text)


@router.message(Command("vote"))
async def cmd_vote(message: Message, user_id: str | None = None) -> None:
    """Handle /vote command - start voting for a single scran."""
    try:
        if not message.from_user:
            await message.answer("Ошибка: не удалось получить информацию о пользователе.")
            return

        telegram_id = str(message.from_user.id)
        logger.info(f"{telegram_id=}")

        if user_id:
            telegram_id = user_id

        async with database_session() as database:
            # Get 1 least-voted scran that user hasn't voted for yet
            available_scrans = await database.get_least_voted_scrans(
                limit=1, telegram_id=telegram_id
            )

            logger.info(f"{available_scrans=}")

            if not available_scrans:
                await message.answer(
                    "🎉 Ты проголосовал за все доступные блюда! "
                    "Приходи позже, когда появятся новые."
                )
                return

            scran = available_scrans[0]

            # Build caption with name, description and price
            caption = f"<b>{escape(str(scran['name']))}</b>"
            if scran.get("description"):
                caption += f"\n\n{escape(str(scran['description']))}"
            caption += f"\n\n💰 {scran['price']:.2f} ₽"
            logger.info(f"{caption=}")

            # Handle local files vs external URLs
            media = get_media_input(scran["image_url"])

            logger.info(f"{media=}")

            # Create inline keyboard with like/dislike buttons
            keyboard = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="🤩 Слопал бы",
                            callback_data=f"vote:{scran['id']}:like",
                        ),
                        InlineKeyboardButton(
                            text="💩 Слоп",
                            callback_data=f"vote:{scran['id']}:dislike",
                        ),
                    ]
                ]
            )

            # Send photo with caption and buttons
            await message.answer_photo(
                photo=media,
                caption=caption,
                reply_markup=keyboard,
                parse_mode="HTML",
            )
            logger.error("Готово")

    except Exception as e:
        logger.error(f"Error in vote command: {e}")
        await message.answer("😜 Хаха попался ламер xd. Нажми еще раз /vote или офай")


@router.callback_query(F.data.startswith("vote:"))
async def process_vote(callback: CallbackQuery) -> None:
    """Handle vote callback."""
    try:
        if not callback.data:
            await callback.answer("Ошибка в данных голосования")
            return

        if not callback.from_user:
            await callback.answer("Ошибка: не удалось получить информацию о пользователе")
            return

        telegram_id = str(callback.from_user.id)

        # Parse callback data: vote:scran_id:like|dislike
        data_parts = callback.data.split(":")
        if len(data_parts) != 3:
            await callback.answer("Ошибка в данных голосования")
            return

        _, scran_id_raw, vote_type = data_parts
        scran_id = int(scran_id_raw)
        is_like = vote_type == "like"

        async with database_session() as database:
            # Check if user already voted for this scran
            voted_ids = await database.get_voted_scran_ids(telegram_id)
            if scran_id in voted_ids:
                await callback.answer("Ты уже голосовал за это блюдо!")
                return

            # Update scran likes/dislikes
            await database.vote_for_scran(scran_id, is_like=is_like)

            # Record the vote in telegram_votes table
            await database.record_telegram_vote(telegram_id, scran_id, is_like)

        # Replace buttons with confirmation text
        if callback.message and isinstance(callback.message, Message):
            try:
                current_caption = callback.message.caption or ""
                await callback.message.edit_caption(
                    caption=current_caption + "\n\n✅ Голос принят!",
                    reply_markup=None,
                )
            except TelegramAPIError:
                # Message might be too old or inaccessible
                pass

        await callback.answer()

        # Show next scran after successful vote
        await cmd_vote(callback.message, telegram_id)

    except Exception as e:
        logger.error(f"Error processing vote: {e}")
        await callback.answer("❌ Ошибка при сохранении голоса")


@router.message(Command("suggest"))
async def cmd_suggest(message: Message, state: FSMContext) -> None:
    """Handle /suggest command - start the wizard."""
    if not message.from_user:
        await message.answer("Ошибка: не удалось получить информацию о пользователе.")
        return

    # Clear any existing state
    await state.clear()

    # Store user info
    await state.update_data(
        telegram_id=str(message.from_user.id),
        telegram_username=message.from_user.username,
    )

    cancel_keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="❌ Отменить")]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )

    await message.answer(
        "📸 Отлично! Давай добавим новое блюдо.\n\nШаг 1/4: Отправь фото блюда (только одно фото)",
        reply_markup=cancel_keyboard,
    )
    await state.set_state(SuggestStates.photo)


@router.message(SuggestStates.photo)
async def process_photo(message: Message, state: FSMContext) -> None:
    """Process photo step."""
    if message.text == "❌ Отменить":
        await cancel_suggestion(message, state)
        return

    if not message.photo:
        await message.answer("Пожалуйста, отправь фото блюда (только одно фото).")
        return

    # Get the largest photo
    photo = message.photo[-1]
    file_id = photo.file_id

    # Download and save photo locally
    try:
        local_url = await save_uploaded_photo(file_id)
        await state.update_data(photo_url=local_url)

        cancel_keyboard = ReplyKeyboardMarkup(
            keyboard=[[KeyboardButton(text="❌ Отменить")]],
            resize_keyboard=True,
        )

        await message.answer(
            "✅ Фото получено!\n\nШаг 2/4: Отправь название блюда (2-100 символов)",
            reply_markup=cancel_keyboard,
        )
        await state.set_state(SuggestStates.name)
    except Exception as e:
        logger.error(f"Error getting photo: {e}")
        await message.answer("Ошибка при получении фото. Попробуй другое фото.")


@router.message(SuggestStates.name)
async def process_name(message: Message, state: FSMContext) -> None:
    """Process name step."""
    if not message.text:
        await message.answer("Пожалуйста, отправь текстовое сообщение.")
        return

    if message.text == "❌ Отменить":
        await cancel_suggestion(message, state)
        return

    name = message.text.strip()

    if len(name) < 2 or len(name) > 100:
        await message.answer("Название должно быть от 2 до 100 символов. Попробуй ещё раз.")
        return

    await state.update_data(name=name)

    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="-"), KeyboardButton(text="❌ Отменить")]],
        resize_keyboard=True,
    )

    await message.answer(
        f'✅ Название: "{name}"\n\n'
        'Шаг 3/4: Отправь описание блюда (или напиши "-" чтобы пропустить)',
        reply_markup=keyboard,
    )
    await state.set_state(SuggestStates.description)


@router.message(SuggestStates.description)
async def process_description(message: Message, state: FSMContext) -> None:
    """Process description step."""
    if not message.text:
        await message.answer("Пожалуйста, отправь текстовое сообщение.")
        return

    if message.text == "❌ Отменить":
        await cancel_suggestion(message, state)
        return

    description = None if message.text == "-" else message.text.strip()

    if description and len(description) > 200:
        await message.answer("Описание слишком длинное (максимум 200 символов). Попробуй покороче.")
        return

    await state.update_data(description=description)

    cancel_keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="❌ Отменить")]],
        resize_keyboard=True,
    )

    status = "✅ Описание получено" if description else "✅ Без описания"
    await message.answer(
        f"{status}\n\nШаг 4/4: Отправь примерную себестоимость в рублях "
        f"(только число, например: 299.99)",
        reply_markup=cancel_keyboard,
    )
    await state.set_state(SuggestStates.price)


@router.message(SuggestStates.price)
async def process_price(message: Message, state: FSMContext) -> None:
    """Process price step."""
    if not message.text:
        await message.answer("Пожалуйста, отправь текстовое сообщение с ценой.")
        return

    if message.text == "❌ Отменить":
        await cancel_suggestion(message, state)
        return

    try:
        price_text = message.text.replace(",", ".")
        price = float(price_text)

        if price < 0 or price > 1000000:
            await message.answer("Некорректная цена. Введи число от 0 до 1000000.")
            return

        await state.update_data(price=price)

        # Get all data for preview
        data = await state.get_data()

        preview = (
            "📋 Проверь данные:\n\n"
            f"🖼 Фото: {'✅' if data.get('photo_url') else '❌'}\n"
            f"📝 Название: {data['name']}\n"
            f"📄 Описание: {data.get('description') or '(нет)'}\n"
            f"💰 Цена: {price:.2f} ₽\n\n"
            "Всё верно?"
        )

        confirm_keyboard = ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text="✅ Да, отправить")],
                [KeyboardButton(text="❌ Нет, отменить")],
            ],
            resize_keyboard=True,
            one_time_keyboard=True,
        )

        await message.answer(preview, reply_markup=confirm_keyboard)
        await state.set_state(SuggestStates.confirmation)

    except ValueError:
        await message.answer("Пожалуйста, отправь цену числом.")


@router.message(SuggestStates.confirmation)
async def process_confirmation(message: Message, state: FSMContext) -> None:
    """Process confirmation step."""
    if message.text == "✅ Да, отправить":
        data = await state.get_data()

        try:
            async with database_session() as database:
                pending = await database.count_pending_scrans(data["telegram_id"])
                if pending >= 6:
                    await message.answer(
                        "У тебя уже 6 или больше предложений на модерации. "
                        "Дождись их рассмотрения, прежде чем предлагать новые.",
                        reply_markup=ReplyKeyboardRemove(),
                    )
                    await state.clear()
                    return

                snapshot = await get_svaga_subscriber_status(data["telegram_id"])
                await database.insert_scran(
                    image_url=data["photo_url"],
                    name=data["name"],
                    description=data.get("description"),
                    price=data["price"],
                    telegram_id=data["telegram_id"],
                    is_subscriber=snapshot.is_subscriber,
                    subscriber_checked_at=snapshot.checked_at,
                )

            await message.answer(
                "🎉 Отлично!\n\nТвоё предложение отправлено на рассмотрение администратору.",
                reply_markup=ReplyKeyboardRemove(),
            )
            logger.info(
                f"New scran suggested by user {data['telegram_id']}: {data['name']} "
                f"(subscriber={snapshot.is_subscriber}, source={snapshot.source})"
            )

        except PendingSuggestionLimitError:
            await message.answer(
                "У тебя уже 6 или больше предложений на модерации. "
                "Дождись их рассмотрения, прежде чем предлагать новые.",
                reply_markup=ReplyKeyboardRemove(),
            )
            await state.clear()
            return
        except Exception as e:
            logger.error(f"Error saving scran: {e}")
            await message.answer(
                "❌ Произошла ошибка при сохранении. Попробуй позже.",
                reply_markup=ReplyKeyboardRemove(),
            )
    else:
        await message.answer(
            "❌ Предложение отменено. Используй /suggest чтобы начать заново.",
            reply_markup=ReplyKeyboardRemove(),
        )

    await state.clear()


async def cancel_suggestion(message: Message, state: FSMContext) -> None:
    """Cancel the suggestion wizard."""
    await state.clear()
    await message.answer(
        "❌ Предложение отменено. Используй /suggest чтобы начать заново.",
        reply_markup=ReplyKeyboardRemove(),
    )


@router.message(Command("status"))
async def cmd_status(message: Message) -> None:
    """Handle /status command."""
    if not message.from_user:
        await message.answer("Ошибка: не удалось получить информацию о пользователе.")
        return

    telegram_id = str(message.from_user.id)

    try:
        async with database_session() as database:
            user_scrans = await database.get_user_scrans(telegram_id)

        if not user_scrans:
            await message.answer(
                "У тебя пока нет предложений. Используй /suggest чтобы добавить блюдо!"
            )
            return

        response = "📊 Твои предложения:\n\n"
        for i, scran in enumerate(user_scrans, 1):
            status = "✅" if scran["approved"] else "⏳"
            response += f"{i}. {scran['name']} - {status}"

            if scran["date"] is not None:
                response += f" {scran['date']}"

            response += "\n"

        response += "\n\n✅ - одобрено"
        response += "\n⏳ - на ожидании (если давно - скорее всего не одобрено)"
        response += "\nдата - дата в которую блюдо было на дейлике"

        await message.answer(response)

    except Exception as e:
        logger.error(f"Error fetching status: {e}")
        await message.answer("Произошла ошибка при получении статуса. Попробуй позже.")


@router.message(F.text)
async def handle_unknown(message: Message) -> None:
    """Handle unknown messages."""
    await message.answer(
        "Я не понимаю это сообщение. Используй /suggest чтобы предложить блюдо "
        "или /help для помощи."
    )


async def main() -> None:
    """Main entry point."""
    # Include router
    dp.include_router(router)

    await bot.get_me()
    health_host = os.getenv("BOT_HEALTH_HOST", "127.0.0.1")
    health_port = int(os.getenv("BOT_HEALTH_PORT", "3011"))
    health_server = await start_health_server(health_host, health_port)
    logger.info("Bot health listening on %s:%s", health_host, health_port)

    try:
        logger.info("Starting bot...")
        await dp.start_polling(bot)
    finally:
        health_server.close()
        await health_server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
