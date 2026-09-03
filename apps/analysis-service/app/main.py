from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.analysis.router import router as analysis_router
from app.db.postgres import pool

import logging

@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    yield
    pool.close()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("app.log"),
        logging.StreamHandler()
    ]
)

app = FastAPI(
    title="Chat AI Agent Analysis Service",
    lifespan=lifespan,
)
logger = logging.getLogger(__name__)
app.include_router(analysis_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}