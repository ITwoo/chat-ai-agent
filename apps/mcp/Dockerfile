FROM ghcr.io/astral-sh/uv:python3.12-alpine

WORKDIR /app

COPY apps/mcp/pyproject.toml apps/mcp/uv.lock ./

RUN uv sync --locked --no-dev

COPY apps/mcp/server.py ./

EXPOSE 8000

CMD ["uv", "run", "python", "server.py"]