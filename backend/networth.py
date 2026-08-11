import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    status,
)
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from models import (
    WealthAsset,
    WealthLiability,
    NetWorthSnapshot,
)


# =====================================================
# ROUTER
# =====================================================

router = APIRouter(
    prefix="/net-worth",
    tags=["Net Worth"],
)


# =====================================================
# JWT SETTINGS
# =====================================================

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")


# =====================================================
# DATABASE
# =====================================================

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# =====================================================
# AUTHENTICATION
# =====================================================

def get_current_user_id(
    authorization: Optional[str] = Header(default=None),
) -> int:

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing",
        )

    parts = authorization.split()

    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    if parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization type",
        )

    token = parts[1]

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = (
            payload.get("user_id")
            or payload.get("id")
            or payload.get("sub")
        )

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User ID not found in token",
            )

        return int(user_id)

    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# =====================================================
# PYDANTIC MODELS - ASSET
# =====================================================

class AssetBase(BaseModel):

    category: str = Field(
        min_length=1,
        max_length=100,
    )

    asset_name: str = Field(
        min_length=1,
        max_length=255,
    )

    institution: Optional[str] = None

    current_value: float = Field(
        default=0,
        ge=0,
    )

    invested_value: Optional[float] = Field(
        default=None,
        ge=0,
    )

    currency: str = Field(
        default="JPY",
        max_length=10,
    )

    source_type: str = Field(
        default="manual",
        max_length=50,
    )

    quantity: Optional[float] = Field(
        default=None,
        ge=0,
    )

    purchase_price: Optional[float] = Field(
        default=None,
        ge=0,
    )

    linked_liability_amount: Optional[float] = Field(
        default=0,
        ge=0,
    )

    notes: Optional[str] = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):

    category: Optional[str] = None

    asset_name: Optional[str] = None

    institution: Optional[str] = None

    current_value: Optional[float] = Field(
        default=None,
        ge=0,
    )

    invested_value: Optional[float] = Field(
        default=None,
        ge=0,
    )

    currency: Optional[str] = None

    source_type: Optional[str] = None

    quantity: Optional[float] = Field(
        default=None,
        ge=0,
    )

    purchase_price: Optional[float] = Field(
        default=None,
        ge=0,
    )

    linked_liability_amount: Optional[float] = Field(
        default=None,
        ge=0,
    )

    notes: Optional[str] = None


class AssetResponse(AssetBase):

    id: int
    user_id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = ConfigDict(
        from_attributes=True
    )


# =====================================================
# PYDANTIC MODELS - LIABILITY
# =====================================================

class LiabilityBase(BaseModel):

    category: str = Field(
        default="Other",
        max_length=100,
    )

    liability_name: str = Field(
        min_length=1,
        max_length=255,
    )

    institution: Optional[str] = None

    outstanding_amount: float = Field(
        default=0,
        ge=0,
    )

    original_amount: Optional[float] = Field(
        default=None,
        ge=0,
    )

    interest_rate: Optional[float] = Field(
        default=None,
        ge=0,
    )

    monthly_payment: Optional[float] = Field(
        default=None,
        ge=0,
    )

    currency: str = Field(
        default="JPY",
        max_length=10,
    )

    notes: Optional[str] = None


class LiabilityCreate(LiabilityBase):
    pass


class LiabilityUpdate(BaseModel):

    category: Optional[str] = None

    liability_name: Optional[str] = None

    institution: Optional[str] = None

    outstanding_amount: Optional[float] = Field(
        default=None,
        ge=0,
    )

    original_amount: Optional[float] = Field(
        default=None,
        ge=0,
    )

    interest_rate: Optional[float] = Field(
        default=None,
        ge=0,
    )

    monthly_payment: Optional[float] = Field(
        default=None,
        ge=0,
    )

    currency: Optional[str] = None

    notes: Optional[str] = None


class LiabilityResponse(LiabilityBase):

    id: int
    user_id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = ConfigDict(
        from_attributes=True
    )


# =====================================================
# SUMMARY RESPONSE MODELS
# =====================================================

class AllocationItem(BaseModel):

    category: str

    value: float

    percentage: float


class SnapshotItem(BaseModel):

    date: datetime

    total_assets: float

    total_liabilities: float

    net_worth: float


class NetWorthSummary(BaseModel):

    total_assets: float

    total_liabilities: float

    net_worth: float

    previous_net_worth: float

    change_amount: float

    change_percentage: float

    allocation: list[AllocationItem]

    assets: list[AssetResponse]

    liabilities: list[LiabilityResponse]

    history: list[SnapshotItem]


# =====================================================
# HELPER - CALCULATE TOTALS
# =====================================================

def calculate_totals(
    db: Session,
    user_id: int,
):

    total_assets = (
        db.query(
            func.coalesce(
                func.sum(
                    WealthAsset.current_value
                ),
                0,
            )
        )
        .filter(
            WealthAsset.user_id == user_id
        )
        .scalar()
    )

    total_liabilities = (
        db.query(
            func.coalesce(
                func.sum(
                    WealthLiability.outstanding_amount
                ),
                0,
            )
        )
        .filter(
            WealthLiability.user_id == user_id
        )
        .scalar()
    )

    total_assets = float(
        total_assets or 0
    )

    total_liabilities = float(
        total_liabilities or 0
    )

    net_worth = (
        total_assets
        - total_liabilities
    )

    return {
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "net_worth": net_worth,
    }


# =====================================================
# HELPER - CREATE / UPDATE DAILY SNAPSHOT
# =====================================================

def create_or_update_snapshot(
    db: Session,
    user_id: int,
):

    totals = calculate_totals(
        db,
        user_id,
    )

    today_start = datetime.utcnow().replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    snapshot = (
        db.query(
            NetWorthSnapshot
        )
        .filter(
            NetWorthSnapshot.user_id
            == user_id,
            NetWorthSnapshot.snapshot_date
            >= today_start,
        )
        .first()
    )

    if snapshot:

        snapshot.total_assets = (
            totals["total_assets"]
        )

        snapshot.total_liabilities = (
            totals["total_liabilities"]
        )

        snapshot.net_worth = (
            totals["net_worth"]
        )

        snapshot.snapshot_date = (
            datetime.utcnow()
        )

    else:

        snapshot = NetWorthSnapshot(
            user_id=user_id,
            total_assets=totals[
                "total_assets"
            ],
            total_liabilities=totals[
                "total_liabilities"
            ],
            net_worth=totals[
                "net_worth"
            ],
            snapshot_date=datetime.utcnow(),
        )

        db.add(snapshot)

    db.commit()


# =====================================================
# GET NET WORTH SUMMARY
# =====================================================

@router.get(
    "/summary",
    response_model=NetWorthSummary,
)
def get_net_worth_summary(
    db: Session = Depends(get_db),
    user_id: int = Depends(
        get_current_user_id
    ),
):

    # -------------------------------------------------
    # Assets
    # -------------------------------------------------

    assets = (
        db.query(
            WealthAsset
        )
        .filter(
            WealthAsset.user_id == user_id
        )
        .order_by(
            WealthAsset.current_value.desc()
        )
        .all()
    )

    # -------------------------------------------------
    # Liabilities
    # -------------------------------------------------

    liabilities = (
        db.query(
            WealthLiability
        )
        .filter(
            WealthLiability.user_id == user_id
        )
        .order_by(
            WealthLiability
            .outstanding_amount
            .desc()
        )
        .all()
    )

    # -------------------------------------------------
    # Totals
    # -------------------------------------------------

    totals = calculate_totals(
        db,
        user_id,
    )

    # -------------------------------------------------
    # Asset allocation
    # -------------------------------------------------

    allocation_rows = (
        db.query(
            WealthAsset.category,
            func.sum(
                WealthAsset.current_value
            ).label(
                "category_value"
            ),
        )
        .filter(
            WealthAsset.user_id == user_id
        )
        .group_by(
            WealthAsset.category
        )
        .all()
    )

    allocation = []

    for row in allocation_rows:

        value = float(
            row.category_value or 0
        )

        if totals["total_assets"] > 0:

            percentage = (
                value
                / totals["total_assets"]
                * 100
            )

        else:

            percentage = 0

        allocation.append(
            AllocationItem(
                category=row.category,
                value=value,
                percentage=round(
                    percentage,
                    2,
                ),
            )
        )

    # -------------------------------------------------
    # Historical snapshots
    # -------------------------------------------------

    history_rows = (
        db.query(
            NetWorthSnapshot
        )
        .filter(
            NetWorthSnapshot.user_id
            == user_id
        )
        .order_by(
            NetWorthSnapshot
            .snapshot_date
            .asc()
        )
        .all()
    )

    history = [
        SnapshotItem(
            date=row.snapshot_date,
            total_assets=float(
                row.total_assets
            ),
            total_liabilities=float(
                row.total_liabilities
            ),
            net_worth=float(
                row.net_worth
            ),
        )
        for row in history_rows
    ]

    # -------------------------------------------------
    # Previous snapshot
    # -------------------------------------------------

    previous_snapshot = (
        db.query(
            NetWorthSnapshot
        )
        .filter(
            NetWorthSnapshot.user_id
            == user_id,
            NetWorthSnapshot.snapshot_date
            < datetime.utcnow()
            - timedelta(days=1),
        )
        .order_by(
            NetWorthSnapshot
            .snapshot_date
            .desc()
        )
        .first()
    )

    if previous_snapshot:

        previous_net_worth = float(
            previous_snapshot.net_worth
        )

    else:

        previous_net_worth = totals[
            "net_worth"
        ]

    # -------------------------------------------------
    # Change
    # -------------------------------------------------

    change_amount = (
        totals["net_worth"]
        - previous_net_worth
    )

    if previous_net_worth != 0:

        change_percentage = (
            change_amount
            / abs(previous_net_worth)
            * 100
        )

    else:

        change_percentage = 0

    return NetWorthSummary(
        total_assets=totals[
            "total_assets"
        ],
        total_liabilities=totals[
            "total_liabilities"
        ],
        net_worth=totals[
            "net_worth"
        ],
        previous_net_worth=(
            previous_net_worth
        ),
        change_amount=change_amount,
        change_percentage=round(
            change_percentage,
            2,
        ),
        allocation=allocation,
        assets=assets,
        liabilities=liabilities,
        history=history,
    )


# =====================================================
# CREATE ASSET
# =====================================================

@router.post(
    "/assets",
    response_model=AssetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_asset(
    payload: AssetCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(
        get_current_user_id
    ),
):

    asset = WealthAsset(
        user_id=user_id,
        **payload.model_dump(),
    )

    db.add(asset)

    db.commit()

    db.refresh(asset)

    create_or_update_snapshot(
        db,
        user_id,
    )

    return asset


# =====================================================
# UPDATE ASSET
# =====================================================

@router.put(
    "/assets/{asset_id}",
    response_model=AssetResponse,
)
def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(
        get_current_user_id
    ),
):

    asset = (
        db.query(
            WealthAsset
        )
        .filter(
            WealthAsset.id == asset_id,
            WealthAsset.user_id == user_id,
        )
        .first()
    )

    if not asset:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    update_data = payload.model_dump(
        exclude_unset=True
    )

    for field, value in (
        update_data.items()
    ):

        setattr(
            asset,
            field,
            value,
        )

    asset.updated_at = datetime.utcnow()

    db.commit()

    db.refresh(asset)

    create_or_update_snapshot(
        db,
        user_id,
    )

    return asset


# =====================================================
# DELETE ASSET
# =====================================================

@router.delete(
    "/assets/{asset_id}"
)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(
        get_current_user_id
    ),
):

    asset = (
        db.query(
            WealthAsset
        )
        .filter(
            WealthAsset.id == asset_id,
            WealthAsset.user_id == user_id,
        )
        .first()
    )

    if not asset:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found",
        )

    db.delete(asset)

    db.commit()

    create_or_update_snapshot(
        db,
        user_id,
    )

    return {
        "message":
        "Asset deleted successfully"
    }


# =====================================================
# CREATE LIABILITY
# =====================================================

@router.post(
    "/liabilities",
    response_model=LiabilityResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_liability(
    payload: LiabilityCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(
        get_current_user_id
    ),
):

    liability = WealthLiability(
        user_id=user_id,
        **payload.model_dump(),
    )

    db.add(liability)

    db.commit()

    db.refresh(liability)

    create_or_update_snapshot(
        db,
        user_id,
    )

    return liability


# =====================================================
# UPDATE LIABILITY
# =====================================================

@router.put(
    "/liabilities/{liability_id}",
    response_model=LiabilityResponse,
)
def update_liability(
    liability_id: int,
    payload: LiabilityUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(
        get_current_user_id
    ),
):

    liability = (
        db.query(
            WealthLiability
        )
        .filter(
            WealthLiability.id
            == liability_id,
            WealthLiability.user_id
            == user_id,
        )
        .first()
    )

    if not liability:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Liability not found",
        )

    update_data = payload.model_dump(
        exclude_unset=True
    )

    for field, value in (
        update_data.items()
    ):

        setattr(
            liability,
            field,
            value,
        )

    liability.updated_at = (
        datetime.utcnow()
    )

    db.commit()

    db.refresh(liability)

    create_or_update_snapshot(
        db,
        user_id,
    )

    return liability


# =====================================================
# DELETE LIABILITY
# =====================================================

@router.delete(
    "/liabilities/{liability_id}"
)
def delete_liability(
    liability_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(
        get_current_user_id
    ),
):

    liability = (
        db.query(
            WealthLiability
        )
        .filter(
            WealthLiability.id
            == liability_id,
            WealthLiability.user_id
            == user_id,
        )
        .first()
    )

    if not liability:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Liability not found",
        )

    db.delete(liability)

    db.commit()

    create_or_update_snapshot(
        db,
        user_id,
    )

    return {
        "message":
        "Liability deleted successfully"
    }