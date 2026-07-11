# Create a basic FastAPI app with a /health endpoint returning {"status": "ok"}
from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
from models import User
import upload
import auth
import dashboard

app = FastAPI()

# allow frontend dev origin
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

Base.metadata.create_all(bind=engine)

app.include_router(auth.router)



@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(upload.router)
app.include_router(dashboard.router)

