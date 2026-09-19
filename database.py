import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/crash_db"
)

# Convert standard postgres:// or postgresql:// to postgresql+asyncpg://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("sqlite://") and not DATABASE_URL.startswith("sqlite+aiosqlite://"):
    DATABASE_URL = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://", 1)

try:
    engine = create_async_engine(DATABASE_URL, echo=False)
except Exception:
    DATABASE_URL = "sqlite+aiosqlite:///crash_game.db"
    engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()


async def init_db():
    global engine
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"PostgreSQL connection failed ({e}). Falling back to SQLite...")
        sqlite_url = "sqlite+aiosqlite:///crash_game.db"
        engine = create_async_engine(sqlite_url, echo=False)
        AsyncSessionLocal.configure(bind=engine)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
