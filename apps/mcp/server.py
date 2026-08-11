from mcp.server import MCPServer

mcp = MCPServer("chat-ai-agent-mcp")


def main() -> None:
    mcp.run(transport="streamable-http", port=8000)


if __name__ == "__main__":
    main()