# create_tables.py
from database import Base, engine
from models import User  # later you can add more models here
import os
from dotenv import load_dotenv
load_dotenv()
print("DATABASE_URL env:", os.getenv("DATABASE_URL"))


print("Using engine:", engine)

# This will create all tables defined on Base subclasses (e.g. User)
Base.metadata.create_all(bind=engine)

print("Tables created (if no errors).")
