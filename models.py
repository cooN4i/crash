import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(16), unique=True, index=True, nullable=False)
    is_multiplayer = Column(Boolean, default=False)
    status = Column(String(32), default="active")  # active, won, lost
    # helicopter_flare, helicopter_fire, sos_sign, radio_tower
    victory_type = Column(String(64), nullable=True)
    # frostbite, wolves, hunger
    loss_reason = Column(String(64), nullable=True)
    days_survived = Column(Integer, default=1)
    fire_level = Column(Integer, default=2)
    sos_progress = Column(Integer, default=0)
    radio_repaired = Column(Boolean, default=False)
    tower_breached = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow)

    players = relationship(
        "PlayerRecord",
        back_populates="session",
        cascade="all, delete-orphan")


class PlayerRecord(Base):
    __tablename__ = "player_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        Integer,
        ForeignKey(
            "game_sessions.id",
            ondelete="CASCADE"),
        nullable=False)
    player_id = Column(String(64), nullable=False)
    player_name = Column(String(64), default="Survivor")
    role = Column(String(16), default="host")  # host, guest
    platform = Column(String(16), default="pc")  # pc, mobile
    is_alive = Column(Boolean, default=True)
    health = Column(Integer, default=100)
    warmth = Column(Integer, default=100)
    hunger = Column(Integer, default=100)
    inventory_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("GameSession", back_populates="players")
