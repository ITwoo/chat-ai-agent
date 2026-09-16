import os


os.environ.setdefault(
    "ANALYSIS_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5433/board-app",
)