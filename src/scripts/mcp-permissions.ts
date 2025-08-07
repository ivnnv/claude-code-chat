import { PermissionsMcpServer } from './mcp-permissions-server.js';

// Get permissions directory from environment
const PERMISSIONS_PATH = process.env.CLAUDE_PERMISSIONS_PATH;
if (!PERMISSIONS_PATH) {
  console.error("CLAUDE_PERMISSIONS_PATH environment variable not set");
  process.exit(1);
}

async function main() {
  try {
    const server = new PermissionsMcpServer(PERMISSIONS_PATH!);
    await server.start();
  } catch (error) {
    console.error("Fatal error starting MCP permissions server:", error);
    process.exit(1);
  }
}

main();
