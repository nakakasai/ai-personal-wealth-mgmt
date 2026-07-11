from sqlalchemy import Column, Integer, String, ForeignKey, Date, Float, DateTime, func
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    uploads = relationship("Upload", back_populates="user")


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String)
    uploaded_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="uploads")
    transactions = relationship("Transaction", back_populates="upload")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    upload_id = Column(Integer, ForeignKey("uploads.id"))
    date = Column(Date)
    description = Column(String)
    amount = Column(Float)
    category = Column(String, nullable=True)

    upload = relationship("Upload", back_populates="transactions")



class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    keyword = Column(String, index=True)   # e.g., "7-eleven"
    category = Column(String)              # e.g., "Food"
    created_at = Column(DateTime, default=datetime.utcnow)
