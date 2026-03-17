from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.db import SessionLocal, User, Ad, RoleEnum, AdStatusEnum

COUNTRIES = {
    "Россия": "₽",
    "Казахстан": "₸",
    "Беларусь": "Br",
    "Украина": "₴",
}


async def get_or_create_user(telegram_id: int, username: str | None, first_name: str) -> User:
    async with SessionLocal() as session:
        user = await session.get(User, telegram_id)
        if not user:
            user = User(telegram_id=telegram_id, username=username, first_name=first_name)
            session.add(user)
        else:
            user.username = username
            user.first_name = first_name
        await session.commit()
        await session.refresh(user)
        return user


async def ensure_chief(chief_id: int) -> None:
    async with SessionLocal() as session:
        chief = await session.get(User, chief_id)
        if chief:
            chief.role = RoleEnum.CHIEF.value
        else:
            chief = User(telegram_id=chief_id, first_name="Chief", role=RoleEnum.CHIEF.value)
            session.add(chief)
        await session.commit()


async def list_pending_ads() -> list[Ad]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Ad).options(selectinload(Ad.author)).where(Ad.status == AdStatusEnum.PENDING.value).order_by(Ad.id.desc())
        )
        return list(result.scalars().all())


async def list_published_ads() -> list[Ad]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Ad).options(selectinload(Ad.author)).where(Ad.status == AdStatusEnum.APPROVED.value).order_by(Ad.id.desc())
        )
        return list(result.scalars().all())


async def user_profile(telegram_id: int) -> dict:
    async with SessionLocal() as session:
        user = await session.get(User, telegram_id)
        if not user:
            return {"total_ads": 0, "ads": [], "role": RoleEnum.USER.value}

        total_ads = await session.scalar(select(func.count(Ad.id)).where(Ad.user_id == telegram_id, Ad.status == AdStatusEnum.APPROVED.value))
        ads = await session.execute(
            select(Ad).where(Ad.user_id == telegram_id, Ad.status == AdStatusEnum.APPROVED.value).order_by(Ad.id.desc())
        )
        return {
            "total_ads": total_ads or 0,
            "ads": list(ads.scalars().all()),
            "role": user.role,
            "user": user,
        }


async def list_moderators() -> list[User]:
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.role.in_([RoleEnum.MODERATOR.value, RoleEnum.CHIEF.value])))
        return list(result.scalars().all())
