import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class MCPServerManager {
	private _mcpConfigPath: string | undefined;

	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public async initializeMCPConfig(): Promise<void> {
		const globalStoragePath = this._context.globalStorageUri.fsPath;
		this._mcpConfigPath = path.join(globalStoragePath, 'mcp-config.json');

		// Create MCP config directory if it doesn't exist
		if (!fs.existsSync(globalStoragePath)) {
			fs.mkdirSync(globalStoragePath, { recursive: true });
		}

		// Create default MCP config if it doesn't exist
		if (!fs.existsSync(this._mcpConfigPath)) {
			const defaultConfig = {
				mcpServers: {
					"claude-code-vsc-panel-permissions": {
						command: "node",
						args: [path.join(__dirname, "mcp-permissions-bundled.js")],
						env: {}
					}
				}
			};

			await fs.promises.writeFile(this._mcpConfigPath, JSON.stringify(defaultConfig, null, 2));
		}
	}

	public async loadMCPServers(): Promise<void> {
		if (!this._mcpConfigPath || !fs.existsSync(this._mcpConfigPath)) {
			this._postMessage({ type: 'mcpServers', data: {} });
			return;
		}

		try {
			const data = await fs.promises.readFile(this._mcpConfigPath, 'utf8');
			const config = JSON.parse(data);
			this._postMessage({
				type: 'mcpServers',
				data: config.mcpServers || {}
			});
		} catch (error) {
			console.error('Failed to load MCP servers:', error);
			this._postMessage({ type: 'mcpServers', data: {} });
		}
	}

	public async saveMCPServer(name: string, config: any): Promise<void> {
		if (!this._mcpConfigPath) {
			this._postMessage({
				type: 'error',
				data: 'MCP config not initialized'
			});
			return;
		}

		try {
			let mcpConfig: any = { mcpServers: {} };

			if (fs.existsSync(this._mcpConfigPath)) {
				const data = await fs.promises.readFile(this._mcpConfigPath, 'utf8');
				mcpConfig = JSON.parse(data);
			}

			if (!mcpConfig.mcpServers) {
				mcpConfig.mcpServers = {};
			}

			mcpConfig.mcpServers[name] = config;

			await fs.promises.writeFile(this._mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

			this._postMessage({
				type: 'mcpServerSaved',
				data: { success: true, name, config }
			});

			// Refresh servers list
			await this.loadMCPServers();

		} catch (error) {
			console.error('Failed to save MCP server:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to save MCP server: ${error}`
			});
		}
	}

	public async deleteMCPServer(name: string): Promise<void> {
		if (!this._mcpConfigPath || !fs.existsSync(this._mcpConfigPath)) {
			return;
		}

		try {
			const data = await fs.promises.readFile(this._mcpConfigPath, 'utf8');
			const mcpConfig = JSON.parse(data);

			if (mcpConfig.mcpServers && mcpConfig.mcpServers[name]) {
				delete mcpConfig.mcpServers[name];

				await fs.promises.writeFile(this._mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

				this._postMessage({
					type: 'mcpServerDeleted',
					data: { success: true, name }
				});

				// Refresh servers list
				await this.loadMCPServers();
			}

		} catch (error) {
			console.error('Failed to delete MCP server:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to delete MCP server: ${error}`
			});
		}
	}

	public getMCPConfigPath(): string | undefined {
		return this._mcpConfigPath;
	}

	public convertToWSLPath(windowsPath: string): string {
		if (process.platform !== 'win32') {
			return windowsPath;
		}

		// Convert Windows path to WSL path
		// C:\Users\... -> /mnt/c/Users/...
		return windowsPath.replace(/^([A-Za-z]):/, '/mnt/$1').replace(/\\/g, '/').toLowerCase();
	}
}
