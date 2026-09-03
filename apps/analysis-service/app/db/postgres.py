from psycopg_pool import ConnectionPool

from app.core.config import settings


pool = ConnectionPool(
    conninfo=settings.analysis_database_url,
    min_size=1,
    max_size=5,
    open=False,
)