import asyncio
import json
from contextlib import asynccontextmanager

import httpx
import uvicorn
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select

from app.auth import validate_init_data
from app.config import settings
from app.db import init_db, SessionLocal, User, Ad, RoleEnum, AdStatusEnum
from app.services import get_or_create_user, ensure_chief, list_pending_ads, list_published_ads, COUNTRIES, user_profile, list_moderators

bot = Bot(token=settings.bot_token)
dp = Dispatcher()
templates = Jinja2Templates(directory="app/templates")


def format_ad(ad: Ad, username: str | None) -> str:
    kind = {"buy": "🟢 Покупка", "sell": "🔵 Продажа", "exchange": "🟣 Обмен"}.get(ad.ad_type, ad.ad_type)
    user_link = f"@{username}" if username else "Пользователь"
    clickable = f"<a href='https://t.me/{username}'>{user_link}</a>" if username else user_link
    return (
        f"{kind}\n"
        f"🌍 Страна: {ad.country}\n"
        f"📌 Название: <b>{ad.title}</b>\n"
        f"📝 Описание: {ad.description}\n"
        f"💵 Цена: {ad.price} {ad.currency}\n"
        f"👤 Автор: {clickable}"
    )


@dp.message(CommandStart())
async def start_handler(message: Message) -> None:
    await get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
    )

    kb = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="🚀 Открыть мини‑приложение", web_app=WebAppInfo(url=f"{settings.app_base_url}/webapp"))]]
    )
    await message.answer(
        "Добро пожаловать! Открой мини‑приложение, чтобы подать объявление, посмотреть профиль и модерировать заявки.",
        reply_markup=kb,
    )


async def run_bot_polling() -> None:
    await dp.start_polling(bot)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if settings.chief_moderator_id:
        await ensure_chief(settings.chief_moderator_id)
    polling_task = asyncio.create_task(run_bot_polling())
    yield
    polling_task.cancel()


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/webapp", response_class=HTMLResponse)
async def webapp_page(request: Request):
    return templates.TemplateResponse("webapp.html", {"request": request, "bot_username": settings.bot_username})


def require_user(req: dict) -> dict:
    user_raw = req.get("user")
    if not user_raw:
        raise HTTPException(status_code=401, detail="No user")
    return json.loads(user_raw)


@app.post("/api/bootstrap")
async def bootstrap(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")

    tg_user = require_user(verified)
    user = await get_or_create_user(tg_user["id"], tg_user.get("username"), tg_user.get("first_name", ""))
    profile = await user_profile(user.telegram_id)

    return {
        "user": {
            "id": user.telegram_id,
            "username": user.username,
            "first_name": user.first_name,
            "role": user.role,
        },
        "countries": COUNTRIES,
        "profile": {
            "total_ads": profile["total_ads"],
            "ads": [{"id": ad.id, "title": ad.title, "link": f"https://t.me/c/{abs(settings.channel_chat_id)}/{ad.channel_message_id}" if ad.channel_message_id else None} for ad in profile["ads"]],
        },
    }


@app.post("/api/ad")
async def create_ad(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)

    ad_type = payload.get("ad_type")
    country = payload.get("country")
    title = payload.get("title", "").strip()
    description = payload.get("description", "").strip()
    price = payload.get("price", "").strip()
    photo_file_id = payload.get("photo_file_id")

    if ad_type in ["sell", "exchange"] and not photo_file_id:
        raise HTTPException(status_code=400, detail="Фото обязательно для продажи и обмена")
    if country not in COUNTRIES:
        raise HTTPException(status_code=400, detail="Неверная страна")
    if not title or not description or not price:
        raise HTTPException(status_code=400, detail="Заполните все поля")

    await get_or_create_user(tg_user["id"], tg_user.get("username"), tg_user.get("first_name", ""))

    async with SessionLocal() as session:
        ad = Ad(
            user_id=tg_user["id"],
            ad_type=ad_type,
            country=country,
            currency=COUNTRIES[country],
            title=title,
            description=description,
            price=price,
            photo_file_id=photo_file_id,
            status=AdStatusEnum.PENDING.value,
        )
        session.add(ad)
        await session.commit()
        await session.refresh(ad)

        text = format_ad(ad, tg_user.get("username"))
        await bot.send_message(
            chat_id=settings.moderators_chat_id,
            text=f"🆕 Новое объявление на модерацию #ID{ad.id}\n\n{text}",
            parse_mode="HTML",
        )

        return {"ok": True, "ad_id": ad.id}


@app.get("/api/moderation/pending")
async def moderation_pending(initData: str):
    verified = validate_init_data(initData)
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)

    async with SessionLocal() as session:
        user = await session.get(User, tg_user["id"])
        if not user or user.role not in [RoleEnum.MODERATOR.value, RoleEnum.CHIEF.value]:
            raise HTTPException(status_code=403, detail="No rights")

    ads = await list_pending_ads()
    return [
        {
            "id": ad.id,
            "title": ad.title,
            "description": ad.description,
            "price": ad.price,
            "country": ad.country,
            "currency": ad.currency,
            "ad_type": ad.ad_type,
            "photo_file_id": ad.photo_file_id,
            "author": ad.author.username,
        }
        for ad in ads
    ]


@app.post("/api/moderation/approve")
async def moderation_approve(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)

    ad_id = int(payload.get("ad_id"))
    async with SessionLocal() as session:
        moderator = await session.get(User, tg_user["id"])
        if not moderator or moderator.role not in [RoleEnum.MODERATOR.value, RoleEnum.CHIEF.value]:
            raise HTTPException(status_code=403, detail="No rights")

        ad = await session.get(Ad, ad_id)
        if not ad or ad.status != AdStatusEnum.PENDING.value:
            raise HTTPException(status_code=404, detail="Ad not found")

        author = await session.get(User, ad.user_id)
        text = format_ad(ad, author.username if author else None)

        if ad.photo_file_id:
            msg = await bot.send_photo(settings.channel_chat_id, ad.photo_file_id, caption=text, parse_mode="HTML")
        else:
            msg = await bot.send_message(settings.channel_chat_id, text, parse_mode="HTML")

        ad.status = AdStatusEnum.APPROVED.value
        ad.moderator_id = tg_user["id"]
        ad.channel_message_id = msg.message_id
        await session.commit()

    return {"ok": True}


@app.post("/api/moderation/reject")
async def moderation_reject(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)
    ad_id = int(payload.get("ad_id"))
    reason = payload.get("reason", "Без причины")

    async with SessionLocal() as session:
        moderator = await session.get(User, tg_user["id"])
        if not moderator or moderator.role not in [RoleEnum.MODERATOR.value, RoleEnum.CHIEF.value]:
            raise HTTPException(status_code=403, detail="No rights")

        ad = await session.get(Ad, ad_id)
        if not ad or ad.status != AdStatusEnum.PENDING.value:
            raise HTTPException(status_code=404, detail="Ad not found")

        ad.status = AdStatusEnum.REJECTED.value
        ad.reject_reason = reason
        ad.moderator_id = tg_user["id"]
        await session.commit()

        await bot.send_message(ad.user_id, f"Ваше объявление #{ad.id} отклонено. Причина: {reason}")

    return {"ok": True}


@app.get("/api/moderation/published")
async def moderation_published(initData: str):
    verified = validate_init_data(initData)
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)
    async with SessionLocal() as session:
        user = await session.get(User, tg_user["id"])
        if not user or user.role != RoleEnum.CHIEF.value:
            raise HTTPException(status_code=403, detail="No rights")
    ads = await list_published_ads()
    return [
        {
            "id": ad.id,
            "title": ad.title,
            "description": ad.description,
            "price": ad.price,
            "country": ad.country,
            "currency": ad.currency,
            "ad_type": ad.ad_type,
        }
        for ad in ads
    ]


@app.post("/api/moderation/edit")
async def moderation_edit(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)

    async with SessionLocal() as session:
        chief = await session.get(User, tg_user["id"])
        if not chief or chief.role != RoleEnum.CHIEF.value:
            raise HTTPException(status_code=403, detail="No rights")

        ad = await session.get(Ad, int(payload.get("ad_id")))
        if not ad or ad.status != AdStatusEnum.APPROVED.value:
            raise HTTPException(status_code=404, detail="Ad not found")

        ad.title = payload.get("title", ad.title)
        ad.description = payload.get("description", ad.description)
        ad.price = payload.get("price", ad.price)

        author = await session.get(User, ad.user_id)
        text = format_ad(ad, author.username if author else None)
        if ad.photo_file_id:
            await bot.edit_message_caption(chat_id=settings.channel_chat_id, message_id=ad.channel_message_id, caption=text, parse_mode="HTML")
        else:
            await bot.edit_message_text(text, chat_id=settings.channel_chat_id, message_id=ad.channel_message_id, parse_mode="HTML")

        await session.commit()
    return {"ok": True}


@app.post("/api/moderation/delete")
async def moderation_delete(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)

    async with SessionLocal() as session:
        chief = await session.get(User, tg_user["id"])
        if not chief or chief.role != RoleEnum.CHIEF.value:
            raise HTTPException(status_code=403, detail="No rights")
        ad = await session.get(Ad, int(payload.get("ad_id")))
        if not ad or ad.status != AdStatusEnum.APPROVED.value:
            raise HTTPException(status_code=404, detail="Ad not found")

        await bot.delete_message(chat_id=settings.channel_chat_id, message_id=ad.channel_message_id)
        ad.status = AdStatusEnum.DELETED.value
        await session.commit()
    return {"ok": True}


@app.get("/api/moderators")
async def moderators(initData: str):
    verified = validate_init_data(initData)
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)

    async with SessionLocal() as session:
        chief = await session.get(User, tg_user["id"])
        if not chief or chief.role != RoleEnum.CHIEF.value:
            raise HTTPException(status_code=403, detail="No rights")

    items = await list_moderators()
    return [{"telegram_id": u.telegram_id, "username": u.username, "role": u.role} for u in items]


@app.post("/api/moderators/add")
async def moderators_add(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)
    target_id = int(payload.get("target_id"))

    async with SessionLocal() as session:
        chief = await session.get(User, tg_user["id"])
        if not chief or chief.role != RoleEnum.CHIEF.value:
            raise HTTPException(status_code=403, detail="No rights")

        target = await session.get(User, target_id)
        if not target:
            target = User(telegram_id=target_id, first_name="Moderator", role=RoleEnum.MODERATOR.value)
            session.add(target)
        else:
            target.role = RoleEnum.MODERATOR.value

        await session.commit()
    return {"ok": True}


@app.post("/api/moderators/remove")
async def moderators_remove(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)
    target_id = int(payload.get("target_id"))

    async with SessionLocal() as session:
        chief = await session.get(User, tg_user["id"])
        if not chief or chief.role != RoleEnum.CHIEF.value:
            raise HTTPException(status_code=403, detail="No rights")
        target = await session.get(User, target_id)
        if target and target.role != RoleEnum.CHIEF.value:
            target.role = RoleEnum.USER.value
            await session.commit()
    return {"ok": True}


@app.post("/api/upload-photo")
async def upload_photo(payload: dict):
    verified = validate_init_data(payload.get("initData", ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Bad initData")
    tg_user = require_user(verified)

    file_id = payload.get("file_id")
    if not file_id:
        raise HTTPException(status_code=400, detail="Только загрузка через Telegram file_id")

    await get_or_create_user(tg_user["id"], tg_user.get("username"), tg_user.get("first_name", ""))
    return {"file_id": file_id}


@app.get("/api/avatar/{user_id}")
async def user_avatar(user_id: int):
    photos = await bot.get_user_profile_photos(user_id=user_id, limit=1)
    if photos.total_count == 0:
        return Response(status_code=404)
    file_id = photos.photos[0][-1].file_id
    file = await bot.get_file(file_id)
    url = f"https://api.telegram.org/file/bot{settings.bot_token}/{file.file_path}"

    async with httpx.AsyncClient() as client:
        res = await client.get(url)
    return Response(content=res.content, media_type="image/jpeg")


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
