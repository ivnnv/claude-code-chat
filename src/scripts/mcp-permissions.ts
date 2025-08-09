// MCP Permissions Server - Basic MCP implementation for permissions handling

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

class PermissionsMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'claude-code-vsc-panel-permissions',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'manage_permissions',
            description: 'Manage VS Code extension permissions',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['list', 'add', 'remove'],
                  description: 'The permission action to perform'
                },
                tool: {
                  type: 'string',
                  description: 'The tool name for the permission'
                },
                command: {
                  type: 'string',
                  description: 'The specific command pattern'
                }
              },
              required: ['action']
            }
          },
          {
            name: 'approval_prompt',
            description: 'Request user permission to execute a tool via VS Code dialog',
            inputSchema: {
              type: 'object',
              properties: {
                tool_name: {
                  type: 'string',
                  description: 'The name of the tool requesting permission'
                },
                input: {
                  type: 'object',
                  description: 'The input for the tool'
                },
                tool_use_id: {
                  type: 'string',
                  description: 'The unique tool use request ID'
                }
              },
              required: ['tool_name', 'input']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'manage_permissions') {
        const action = args?.action as string;

        switch (action) {
          case 'list':
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Permissions management functionality would be implemented here'
                }
              ]
            };
          case 'add':
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Permission would be added for tool: ${args?.tool}`
                }
              ]
            };
          case 'remove':
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Permission would be removed for tool: ${args?.tool}`
                }
              ]
            };
          default:
            throw new McpError(ErrorCode.InvalidRequest, `Unknown action: ${action}`);
        }
      }

      if (name === 'approval_prompt') {
        const toolName = args?.tool_name as string;
        const input = args?.input as any;
        const _toolUseId = args?.tool_use_id as string;

        console.error(`Requesting permission for tool: ${toolName}`);

        // For now, allow all permissions (similar to yolo mode)
        // In a full implementation, this would show a VS Code dialog
        const approved = true;
        const behavior = approved ? "allow" : "deny";

        console.error(`Permission ${behavior}ed for tool: ${toolName}`);
        return {
          content: [
            {
              type: 'text' as const,
              text: behavior === "allow" ? JSON.stringify({
                behavior,
                updatedInput: input
              }) : JSON.stringify({
                behavior,
                reason: "Permission denied by user"
              })
            }
          ]
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    });
  }

  async run() {
    // Start MCP server with stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP permissions server started and connected');
  }
}

// Start the server
if (require.main === module) {
  const server = new PermissionsMCPServer();
  server.run().catch(console.error);
}

export { PermissionsMCPServer };
