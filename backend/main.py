# Create a basic FastAPI app with a /health endpoint returning {"status": "ok"}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from models import User

import upload
import auth
import dashboard
import networth
import equities


app = FastAPI()


# =====================================================
# CORS
# =====================================================

origins = [
    "http://localhost:3000",
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================
# DATABASE TABLE CREATION
# =====================================================

Base.metadata.create_all(bind=engine)


# =====================================================
# ROUTERS
# =====================================================

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(dashboard.router)
app.include_router(networth.router)
app.include_router(equities.router)


# =====================================================
# HEALTH CHECK
# =====================================================

@app.get("/health")
def health_check():
    return {"status": "ok"}
