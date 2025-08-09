import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class PermissionsManager {
	private _permissionRequestsPath: string | undefined;
	private _permissionWatcher: vscode.FileSystemWatcher | undefined;
	private _pendingPermissionResolvers: Map<string, (approved: boolean) => void> = new Map();

	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public async initializePermissions(): Promise<void> {
		const globalStoragePath = this._context.globalStorageUri.fsPath;
		this._permissionRequestsPath = path.join(globalStoragePath, 'permission-requests');

		// Create permission requests directory if it doesn't exist
		if (!fs.existsSync(this._permissionRequestsPath)) {
			fs.mkdirSync(this._permissionRequestsPath, { recursive: true });
		}

		// Set up file watcher for permission responses
		const pattern = new vscode.RelativePattern(this._permissionRequestsPath, '*.response.json');
		this._permissionWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		this._permissionWatcher.onDidCreate(this.handlePermissionRequest.bind(this));
		this._permissionWatcher.onDidChange(this.handlePermissionRequest.bind(this));
	}

	private async handlePermissionRequest(requestUri: vscode.Uri): Promise<void> {
		try {
			const requestData = JSON.parse(await fs.promises.readFile(requestUri.fsPath, 'utf8'));

			if (requestData.type === 'permission_request') {
				// This is a new permission request from MCP
				const approved = await this.showPermissionDialog(requestData);
				this.handlePermissionResponse(requestData.id, approved, requestData.alwaysAllow);
			}
		} catch (error) {
			console.error('Error handling permission request:', error);
		}
	}

	private async showPermissionDialog(request: any): Promise<boolean> {
		const toolName = request.tool_name || 'Unknown Tool';
		const command = request.command || 'Unknown Command';

		const message = `Allow ${toolName} to execute: ${command}?`;
		const options = ['Allow', 'Deny', 'Always Allow'];

		const result = await vscode.window.showQuickPick(options, {
			placeHolder: message,
			canPickMany: false
		});

		if (result === 'Always Allow') {
			await this.saveAlwaysAllowPermission(request.id);
			return true;
		}

		return result === 'Allow';
	}

	private handlePermissionResponse(id: string, approved: boolean, alwaysAllow?: boolean): void {
		// Resolve pending promise if exists
		const resolver = this._pendingPermissionResolvers.get(id);
		if (resolver) {
			resolver(approved);
			this._pendingPermissionResolvers.delete(id);
		}

		// Send response back via webview for any UI updates
		this._postMessage({
			type: 'permissionResponse',
			data: { id, approved, alwaysAllow }
		});
	}

	private async saveAlwaysAllowPermission(requestId: string): Promise<void> {
		try {
			const configPath = this.getGlobalSettingsPath();
			let config: any = {};

			if (fs.existsSync(configPath)) {
				config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
			}

			if (!config.tools) {config.tools = {};}
			if (!config.tools.allowed) {config.tools.allowed = [];}

			// For now, we'll add a generic permission - in practice this would be more specific
			const permission = `permission-${requestId}`;
			if (!config.tools.allowed.includes(permission)) {
				config.tools.allowed.push(permission);
				await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
			}
		} catch (error) {
			console.error('Failed to save always allow permission:', error);
		}
	}

	public getCommandPattern(command: string): string {
		// Helper method to create command patterns for permissions
		const commandParts = command.split(' ');
		const baseCommand = commandParts[0];

		// Create patterns for common command variations
		const patterns = [
			baseCommand,
			`${baseCommand}:*`,
		];

		// Add specific patterns for known tools
		if (baseCommand === 'git') {
			const subCommand = commandParts[1];
			if (subCommand) {
				patterns.push(`git ${subCommand}:*`);
			}
		} else if (baseCommand === 'npm' || baseCommand === 'pnpm' || baseCommand === 'yarn') {
			const subCommand = commandParts[1];
			if (subCommand) {
				patterns.push(`${baseCommand} ${subCommand}:*`);
			}
		}

		// Return the most specific pattern
		return patterns[patterns.length - 1];
	}

	public async sendPermissions(): Promise<void> {
		try {
			const configPath = this.getGlobalSettingsPath();
			let permissions: any = { tools: { allowed: [] } };

			if (fs.existsSync(configPath)) {
				const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
				permissions = config;
			}

			this._postMessage({
				type: 'permissions',
				data: permissions.tools?.allowed || []
			});
		} catch (error) {
			console.error('Failed to load permissions:', error);
			this._postMessage({
				type: 'permissions',
				data: []
			});
		}
	}

	public async removePermission(toolName: string, command: string | null): Promise<void> {
		try {
			const configPath = this.getGlobalSettingsPath();
			let config: any = {};

			if (fs.existsSync(configPath)) {
				config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
			}

			if (!config.tools?.allowed) {
				return;
			}

			const _permissionPattern = command
				? this.getCommandPattern(`${toolName}(${command})`)
				: `${toolName}:*`;

			config.tools.allowed = config.tools.allowed.filter((p: string) =>
				!p.includes(toolName) || !p.includes(command || '')
			);

			await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
			await this.sendPermissions(); // Refresh the permissions list

		} catch (error) {
			console.error('Failed to remove permission:', error);
		}
	}

	public async addPermission(toolName: string, command: string | null): Promise<void> {
		try {
			const configPath = this.getGlobalSettingsPath();
			let config: any = {};

			if (fs.existsSync(configPath)) {
				config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
			}

			if (!config.tools) {config.tools = {};}
			if (!config.tools.allowed) {config.tools.allowed = [];}

			const _permissionPattern = command
				? this.getCommandPattern(`${toolName}(${command})`)
				: `${toolName}:*`;

			if (!config.tools.allowed.includes(_permissionPattern)) {
				config.tools.allowed.push(_permissionPattern);
				await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
			}

			await this.sendPermissions(); // Refresh the permissions list

		} catch (error) {
			console.error('Failed to add permission:', error);
		}
	}

	private getGlobalSettingsPath(): string {
		const homeDir = process.env.HOME || process.env.USERPROFILE || '';
		return path.join(homeDir, '.claude', 'settings.json');
	}

	public dispose(): void {
		this._permissionWatcher?.dispose();
	}
}
