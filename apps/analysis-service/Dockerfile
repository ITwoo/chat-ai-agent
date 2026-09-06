FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

COPY apps/analysis-service/pyproject.toml apps/analysis-service/uv.lock ./

RUN uv sync --locked --no-dev

COPY apps/analysis-service/app ./app

EXPOSE 8001

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]