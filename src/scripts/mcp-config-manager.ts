import * as vscode from 'vscode';
import * as path from 'path';
import { convertToWSLPath } from './extension-utils';

export interface MCPServerConfig {
	command: string;
	args?: string[];
	env?: { [key: string]: string };
}

export interface MCPConfig {
	mcpServers: { [key: string]: MCPServerConfig };
}

export class MCPConfigManager {
	private _mcpConfigPath: string | undefined;

	constructor(private _context: vscode.ExtensionContext, private _extensionUri: vscode.Uri) {}

	public async initializeMCPConfig(): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) {
				console.error('No workspace storage available for MCP configuration');
				return;
			}

			const mcpConfigDir = path.join(storagePath, 'mcp');

			// Create MCP config directory if it doesn't exist
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(mcpConfigDir));
			} catch {
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(mcpConfigDir));
			}

			// Create or update mcp-servers.json with permissions server, preserving existing servers
			const mcpConfigPath = path.join(mcpConfigDir, 'mcp-servers.json');
			const mcpPermissionsPath = convertToWSLPath(path.join(this._extensionUri.fsPath, 'out', 'scripts', 'mcp-permissions-bundled.js'));
			const permissionRequestsPath = convertToWSLPath(path.join(storagePath, 'permission-requests'));

			// Load existing config or create new one
			let mcpConfig: MCPConfig = { mcpServers: {} };
			const mcpConfigUri = vscode.Uri.file(mcpConfigPath);

			try {
				const existingContent = await vscode.workspace.fs.readFile(mcpConfigUri);
				mcpConfig = JSON.parse(new TextDecoder().decode(existingContent));
				console.log('Loaded existing MCP config, preserving user servers');
			} catch {
				console.log('No existing MCP config found, creating new one');
			}

			// Ensure mcpServers exists
			if (!mcpConfig.mcpServers) {
				mcpConfig.mcpServers = {};
			}

			// Add or update the permissions server entry
			mcpConfig.mcpServers['claude-code-vsc-panel-permissions'] = {
				command: 'node',
				args: [mcpPermissionsPath],
				env: {
					CLAUDE_PERMISSIONS_PATH: permissionRequestsPath
				}
			};

			const configContent = new TextEncoder().encode(JSON.stringify(mcpConfig, null, 2));
			await vscode.workspace.fs.writeFile(mcpConfigUri, configContent);

			this._mcpConfigPath = mcpConfigPath;
			console.log(`Updated MCP config at: ${mcpConfigPath}`);
		} catch (error: any) {
			console.error('Failed to initialize MCP config:', error.message);
		}
	}

	public async loadMCPServers(postMessage: (msg: any) => void): Promise<void> {
		try {
			if (!this._mcpConfigPath) {
				postMessage({
					type: 'mcpServers',
					data: {}
				});
				return;
			}

			const mcpConfigUri = vscode.Uri.file(this._mcpConfigPath);
			let mcpConfig: MCPConfig = { mcpServers: {} };

			try {
				const content = await vscode.workspace.fs.readFile(mcpConfigUri);
				mcpConfig = JSON.parse(new TextDecoder().decode(content));
			} catch {
				// File doesn't exist, use empty config
			}

			// Filter out the permissions server from the list sent to UI
			const filteredServers = { ...mcpConfig.mcpServers };
			delete filteredServers['claude-code-vsc-panel-permissions'];

			postMessage({
				type: 'mcpServers',
				data: filteredServers
			});
		} catch (error) {
			console.error('Error loading MCP servers:', error);
			postMessage({
				type: 'mcpServers',
				data: {}
			});
		}
	}

	public async saveMCPServer(name: string, config: MCPServerConfig, postMessage: (msg: any) => void): Promise<void> {
		try {
			if (!this._mcpConfigPath) {
				throw new Error('MCP config path not initialized');
			}

			const mcpConfigUri = vscode.Uri.file(this._mcpConfigPath);
			let mcpConfig: MCPConfig = { mcpServers: {} };

			try {
				const content = await vscode.workspace.fs.readFile(mcpConfigUri);
				mcpConfig = JSON.parse(new TextDecoder().decode(content));
			} catch {
				// File doesn't exist, use empty config
			}

			// Ensure mcpServers exists
			if (!mcpConfig.mcpServers) {
				mcpConfig.mcpServers = {};
			}

			// Don't allow overwriting the permissions server
			if (name === 'claude-code-vsc-panel-permissions') {
				throw new Error('Cannot modify the built-in permissions server');
			}

			// Add or update the server
			mcpConfig.mcpServers[name] = config;

			// Save updated config
			const configContent = JSON.stringify(mcpConfig, null, 2);
			await vscode.workspace.fs.writeFile(mcpConfigUri, Buffer.from(configContent));

			// Reload and send updated server list
			await this.loadMCPServers(postMessage);

			postMessage({
				type: 'mcpServerSaved',
				data: { name, success: true }
			});

		} catch (error) {
			console.error('Error saving MCP server:', error);
			postMessage({
				type: 'mcpServerSaved',
				data: { name, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
			});
		}
	}

	public async deleteMCPServer(name: string, postMessage: (msg: any) => void): Promise<void> {
		try {
			if (!this._mcpConfigPath) {
				throw new Error('MCP config path not initialized');
			}

			// Don't allow deleting the permissions server
			if (name === 'claude-code-vsc-panel-permissions') {
				throw new Error('Cannot delete the built-in permissions server');
			}

			const mcpConfigUri = vscode.Uri.file(this._mcpConfigPath);
			let mcpConfig: MCPConfig = { mcpServers: {} };

			try {
				const content = await vscode.workspace.fs.readFile(mcpConfigUri);
				mcpConfig = JSON.parse(new TextDecoder().decode(content));
			} catch {
				// File doesn't exist, nothing to delete
				postMessage({
					type: 'mcpServerDeleted',
					data: { name, success: false, error: 'Config file not found' }
				});
				return;
			}

			// Remove the server
			if (mcpConfig.mcpServers && mcpConfig.mcpServers[name]) {
				delete mcpConfig.mcpServers[name];

				// Save updated config
				const configContent = JSON.stringify(mcpConfig, null, 2);
				await vscode.workspace.fs.writeFile(mcpConfigUri, Buffer.from(configContent));

				// Reload and send updated server list
				await this.loadMCPServers(postMessage);

				postMessage({
					type: 'mcpServerDeleted',
					data: { name, success: true }
				});
			} else {
				postMessage({
					type: 'mcpServerDeleted',
					data: { name, success: false, error: 'Server not found' }
				});
			}

		} catch (error) {
			console.error('Error deleting MCP server:', error);
			postMessage({
				type: 'mcpServerDeleted',
				data: { name, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
			});
		}
	}

	public getMCPConfigPath(): string | undefined {
		return this._mcpConfigPath;
	}
}
