from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Date,
    Float,
    DateTime,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from database import Base


# =====================================================
# USER
# =====================================================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    uploads = relationship("Upload", back_populates="user")

    # NEW - Wealth Management relationships
    wealth_assets = relationship(
        "WealthAsset",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    wealth_liabilities = relationship(
        "WealthLiability",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    net_worth_snapshots = relationship(
        "NetWorthSnapshot",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# =====================================================
# UPLOAD
# =====================================================

class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String)
    uploaded_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="uploads")

    transactions = relationship(
        "Transaction",
        back_populates="upload",
    )


# =====================================================
# TRANSACTION
# =====================================================

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)

    upload_id = Column(
        Integer,
        ForeignKey("uploads.id"),
    )

    date = Column(Date)
    description = Column(String)
    amount = Column(Float)

    category = Column(String, nullable=True)

    # Bank / card source
    # Examples:
    # AEON
    # ORICO
    # AMEX
    # SMBC
    source = Column(
        String,
        nullable=True,
        index=True,
    )

    upload = relationship(
        "Upload",
        back_populates="transactions",
    )


# =====================================================
# CATEGORY RULE
# =====================================================

class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        index=True,
    )

    keyword = Column(
        String,
        index=True,
    )

    category = Column(String)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )


# =====================================================
# WEALTH ASSET
# =====================================================

class WealthAsset(Base):
    __tablename__ = "wealth_assets"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Examples:
    # Cash & Deposits
    # Debt Funds
    # Equity
    # Real Estate
    # Pension Fund
    # Gold
    # Angel Investment
    # Crypto
    category = Column(
        String,
        nullable=False,
        index=True,
    )

    # Example:
    # SBI Equity Portfolio
    # SMBC Savings Account
    # Tokyo House
    # EPF India
    asset_name = Column(
        String,
        nullable=False,
    )

    # Example:
    # SBI Securities
    # SMBC
    # Rakuten Securities
    institution = Column(
        String,
        nullable=True,
    )

    # Current estimated / market value
    current_value = Column(
        Float,
        nullable=False,
        default=0,
    )

    # Original investment amount
    invested_value = Column(
        Float,
        nullable=True,
    )

    currency = Column(
        String,
        nullable=False,
        default="JPY",
    )

    # manual / bank / brokerage / csv / api
    source_type = Column(
        String,
        nullable=False,
        default="manual",
    )

    # Useful for Gold / fund units etc.
    quantity = Column(
        Float,
        nullable=True,
    )

    # Useful especially for property
    purchase_price = Column(
        Float,
        nullable=True,
    )

    # Optional linked debt figure.
    # Example:
    # Property value = 100M
    # Loan balance = 60M
    # Equity = 40M
    linked_liability_amount = Column(
        Float,
        nullable=True,
        default=0,
    )

    notes = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship(
        "User",
        back_populates="wealth_assets",
    )


# =====================================================
# WEALTH LIABILITY
# =====================================================

class WealthLiability(Base):
    __tablename__ = "wealth_liabilities"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Home Loan
    # Car Loan
    # Personal Loan
    # Credit Card
    # Other
    category = Column(
        String,
        nullable=False,
        default="Other",
    )

    # Example:
    # Tokyo Home Loan
    liability_name = Column(
        String,
        nullable=False,
    )

    institution = Column(
        String,
        nullable=True,
    )

    # Current outstanding amount
    outstanding_amount = Column(
        Float,
        nullable=False,
        default=0,
    )

    original_amount = Column(
        Float,
        nullable=True,
    )

    # Stored as percentage.
    # Example: 1.4 means 1.4%
    interest_rate = Column(
        Float,
        nullable=True,
    )

    monthly_payment = Column(
        Float,
        nullable=True,
    )

    currency = Column(
        String,
        nullable=False,
        default="JPY",
    )

    notes = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship(
        "User",
        back_populates="wealth_liabilities",
    )


# =====================================================
# NET WORTH HISTORY
# =====================================================

class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    total_assets = Column(
        Float,
        nullable=False,
        default=0,
    )

    total_liabilities = Column(
        Float,
        nullable=False,
        default=0,
    )

    net_worth = Column(
        Float,
        nullable=False,
        default=0,
    )

    snapshot_date = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    user = relationship(
        "User",
        back_populates="net_worth_snapshots",
    )