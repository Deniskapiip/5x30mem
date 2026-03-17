from pydantic import BaseModel
from dotenv import load_dotenv
import os

load_dotenv()


class Settings(BaseModel):
    bot_token: str = os.getenv("BOT_TOKEN", "")
    bot_username: str = os.getenv("BOT_USERNAME", "")
    app_base_url: str = os.getenv("APP_BASE_URL", "http://localhost:8000")
    chief_moderator_id: int = int(os.getenv("CHIEF_MODERATOR_ID", "0"))
    moderators_chat_id: int = int(os.getenv("MODERATORS_CHAT_ID", "0"))
    channel_chat_id: int = int(os.getenv("CHANNEL_CHAT_ID", "0"))
    db_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data.db")


settings = Settings()
