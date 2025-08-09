import * as vscode from 'vscode';
import * as path from 'path';
import { getCommandPattern } from './extension-utils';

export interface PermissionRequest {
	id: string;
	toolName: string;
	input: any;
	timestamp: string;
}

export class PermissionManager {
	private _permissionRequestsPath: string | undefined;
	private _permissionWatcher: vscode.FileSystemWatcher | undefined;
	private _pendingPermissionResolvers: Map<string, (approved: boolean) => void> = new Map();

	constructor(private _context: vscode.ExtensionContext) {}

	public async initializePermissions(disposables: vscode.Disposable[]): Promise<void> {
		try {

			if (this._permissionWatcher) {
				this._permissionWatcher.dispose();
				this._permissionWatcher = undefined;
			}

			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) { return; }

			// Create permission requests directory
			this._permissionRequestsPath = path.join(path.join(storagePath, 'permission-requests'));
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(this._permissionRequestsPath));
			} catch {
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(this._permissionRequestsPath));
				console.log(`Created permission requests directory at: ${this._permissionRequestsPath}`);
			}

			console.log("DIRECTORY-----", this._permissionRequestsPath);

			// Set up file watcher for *.request files
			this._permissionWatcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(this._permissionRequestsPath, '*.request')
			);

			this._permissionWatcher.onDidCreate(async (uri) => {
				console.log("----file", uri);
				// Only handle file scheme URIs, ignore vscode-userdata scheme
				if (uri.scheme === 'file') {
					await this.handlePermissionRequestFile(uri);
				}
			});

			disposables.push(this._permissionWatcher);

		} catch (error: any) {
			console.error('Failed to initialize permissions:', error.message);
		}
	}

	private async handlePermissionRequestFile(requestUri: vscode.Uri): Promise<void> {
		try {
			// Read the request file
			const content = await vscode.workspace.fs.readFile(requestUri);
			const request = JSON.parse(new TextDecoder().decode(content));

			// Show permission dialog
			const approved = await this.showPermissionDialog(request, (_msg) => {
				// This needs to be connected to the main postMessage function
				// For now, we'll use VS Code native dialog
			});

			// Write response file
			const responseFile = requestUri.fsPath.replace('.request', '.response');
			const response = {
				id: request.id,
				approved: approved,
				timestamp: new Date().toISOString()
			};

			const responseContent = new TextEncoder().encode(JSON.stringify(response));
			await vscode.workspace.fs.writeFile(vscode.Uri.file(responseFile), responseContent);

			// Clean up request file
			await vscode.workspace.fs.delete(requestUri);

		} catch (error: any) {
			console.error('Failed to handle permission request:', error.message);
		}
	}

	private async handlePermissionRequest(requestUri: vscode.Uri): Promise<void> {
		try {
			const content = await vscode.workspace.fs.readFile(requestUri);
			const response = JSON.parse(new TextDecoder().decode(content));

			// Handle the permission response
			this.handlePermissionResponse(response.id, response.approved, response.alwaysAllow);

			// Clean up the response file
			await vscode.workspace.fs.delete(requestUri);
		} catch (error) {
			console.error('Error handling permission request:', error);
		}
	}

	public async showPermissionDialog(request: PermissionRequest, postMessage: (msg: any) => void): Promise<boolean> {
		const toolName = request.toolName || 'Unknown';
		let message = `Allow ${toolName}`;
		let details = '';

		// Generate pattern for Bash commands
		let pattern = undefined;
		if (toolName === 'Bash' && request.input?.command) {
			pattern = getCommandPattern(request.input.command);
		}

		// Send permission request to the UI
		postMessage({
			type: 'permissionRequest',
			data: {
				id: request.id,
				toolName: toolName,
				input: request.input,
				message: message,
				details: details,
				pattern: pattern
			}
		});

		// Return a promise that will be resolved when permission response is received
		return new Promise<boolean>((resolve) => {
			this._pendingPermissionResolvers.set(request.id, resolve);

			// Set a timeout to auto-deny after 30 seconds
			setTimeout(() => {
				if (this._pendingPermissionResolvers.has(request.id)) {
					this._pendingPermissionResolvers.delete(request.id);
					resolve(false);
				}
			}, 30000);
		});
	}

	private handlePermissionResponse(id: string, approved: boolean, alwaysAllow?: boolean): void {
		// Handle always allow
		if (approved && alwaysAllow) {
			void this.saveAlwaysAllowPermission(id);
		}

		// Resolve pending promise
		const resolver = this._pendingPermissionResolvers.get(id);
		if (resolver) {
			this._pendingPermissionResolvers.delete(id);
			resolver(approved);
		}
	}

	private async saveAlwaysAllowPermission(requestId: string): Promise<void> {
		try {
			if (!this._permissionRequestsPath) { return; }

			const requestFilePath = path.join(this._permissionRequestsPath, `${requestId}.json`);
			const requestUri = vscode.Uri.file(requestFilePath);

			let request: any = {};
			try {
				const content = await vscode.workspace.fs.readFile(requestUri);
				request = JSON.parse(new TextDecoder().decode(content));
			} catch {
				// Request file might have been cleaned up already
				return;
			}

			const toolName = request.toolName || 'Unknown';
			if (toolName === 'Bash' && request.input?.command) {
				const storagePath = this._context.storageUri?.fsPath;
				if (!storagePath) { return; }

				const permissionsPath = path.join(storagePath, 'permission-requests', 'permissions.json');
				const permissionsUri = vscode.Uri.file(permissionsPath);

				let permissions: any = { alwaysAllow: {} };
				try {
					const content = await vscode.workspace.fs.readFile(permissionsUri);
					permissions = JSON.parse(new TextDecoder().decode(content));
				} catch {
					// File doesn't exist yet, use default structure
				}

				if (!permissions.alwaysAllow[toolName]) {
					permissions.alwaysAllow[toolName] = [];
				}
				if (Array.isArray(permissions.alwaysAllow[toolName])) {
					const command = request.input.command.trim();
					const pattern = getCommandPattern(command);
					if (!permissions.alwaysAllow[toolName].includes(pattern)) {
						permissions.alwaysAllow[toolName].push(pattern);
					}
				}

				// Save updated permissions
				const updatedContent = JSON.stringify(permissions, null, 2);
				await vscode.workspace.fs.writeFile(permissionsUri, Buffer.from(updatedContent));
			}
		} catch (error) {
			console.error('Error saving always-allow permission:', error);
		}
	}

	public async sendPermissions(postMessage: (msg: any) => void): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) {
				postMessage({
					type: 'permissionsData',
					data: { alwaysAllow: {} }
				});
				return;
			}

			const permissionsUri = vscode.Uri.file(path.join(storagePath, 'permission-requests', 'permissions.json'));
			let permissions: any = { alwaysAllow: {} };

			try {
				const content = await vscode.workspace.fs.readFile(permissionsUri);
				permissions = JSON.parse(new TextDecoder().decode(content));
			} catch {
				// File doesn't exist or can't be read, use default permissions
			}

			postMessage({
				type: 'permissionsData',
				data: permissions
			});
		} catch (error) {
			console.error('Error sending permissions:', error);
			postMessage({
				type: 'permissionsData',
				data: { alwaysAllow: {} }
			});
		}
	}

	public async removePermission(toolName: string, command: string | null, postMessage: (msg: any) => void): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) { return; }

			const permissionsPath = path.join(storagePath, 'permission-requests', 'permissions.json');
			const permissionsUri = vscode.Uri.file(permissionsPath);

			let permissions: any = { alwaysAllow: {} };
			try {
				const content = await vscode.workspace.fs.readFile(permissionsUri);
				permissions = JSON.parse(new TextDecoder().decode(content));
			} catch {
				// File doesn't exist, nothing to remove
				return;
			}

			if (command === null) {
				// Remove entire tool
				delete permissions.alwaysAllow[toolName];
			} else {
				// Remove specific command
				if (Array.isArray(permissions.alwaysAllow[toolName])) {
					permissions.alwaysAllow[toolName] = permissions.alwaysAllow[toolName].filter((c: string) => c !== command);

					// If no commands left, remove the tool entirely
					if (permissions.alwaysAllow[toolName].length === 0) {
						delete permissions.alwaysAllow[toolName];
					}
				}
			}

			// Save updated permissions
			const updatedContent = JSON.stringify(permissions, null, 2);
			await vscode.workspace.fs.writeFile(permissionsUri, Buffer.from(updatedContent));

			// Send updated permissions to UI
			await this.sendPermissions(postMessage);

		} catch (error) {
			console.error('Error removing permission:', error);
		}
	}

	public async addPermission(toolName: string, command: string | null, postMessage: (msg: any) => void): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) { return; }

			const permissionsPath = path.join(storagePath, 'permission-requests', 'permissions.json');
			const permissionsUri = vscode.Uri.file(permissionsPath);

			let permissions: any = { alwaysAllow: {} };
			try {
				const content = await vscode.workspace.fs.readFile(permissionsUri);
				permissions = JSON.parse(new TextDecoder().decode(content));
			} catch {
				// File doesn't exist yet, use default structure
			}

			if (command === null) {
				// Add tool with wildcard
				permissions.alwaysAllow[toolName] = ['*'];
			} else {
				// Add specific command
				if (!permissions.alwaysAllow[toolName]) {
					permissions.alwaysAllow[toolName] = [];
				}
				if (Array.isArray(permissions.alwaysAllow[toolName])) {
					// For Bash commands, convert to pattern using existing logic
					let commandToAdd = command;
					if (toolName === 'Bash') {
						commandToAdd = getCommandPattern(command);
					}

					// Add if not already present
					if (!permissions.alwaysAllow[toolName].includes(commandToAdd)) {
						permissions.alwaysAllow[toolName].push(commandToAdd);
					}
				}
			}

			// Save updated permissions
			const updatedContent = JSON.stringify(permissions, null, 2);
			await vscode.workspace.fs.writeFile(permissionsUri, Buffer.from(updatedContent));

			// Send updated permissions to UI
			await this.sendPermissions(postMessage);

		} catch (error) {
			console.error('Error adding permission:', error);
		}
	}

	public dispose(): void {
		this._permissionWatcher?.dispose();
	}

	public getPermissionRequestsPath(): string | undefined {
		return this._permissionRequestsPath;
	}
}
