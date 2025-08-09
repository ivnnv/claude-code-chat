// Permissions Security - Consolidated permission management and security functionality
import * as vscode from 'vscode';

// =====================================
// PERMISSIONS MANAGER FUNCTIONALITY
// =====================================

export class PermissionsManager {
	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public async sendPermissions(): Promise<void> {
		try {
			// Get VS Code configuration for permissions
			const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
			const allowedCommands = config.get<string[]>('permissions.allowedCommands', []) as string[];
			const yoloMode = config.get<boolean>('permissions.yoloMode', false);

			// Organize permissions by tool
			const permissionsByTool: { [key: string]: string[] } = {
				'Bash': [],
				'Read': [],
				'Edit': [],
				'Write': [],
				'MultiEdit': [],
				'Glob': [],
				'Grep': [],
				'LS': [],
				'WebSearch': [],
				'WebFetch': []
			};

			// Parse allowed commands and group by tool
			allowedCommands.forEach((command: string) => {
				const [toolName, ...commandParts] = command.split(':');
				const commandPattern = commandParts.join(':');

				if (permissionsByTool.hasOwnProperty(toolName)) {
					permissionsByTool[toolName].push(commandPattern || '*');
				}
			});

			this._postMessage({
				type: 'permissionsData',
				data: {
					permissions: permissionsByTool,
					yoloMode: yoloMode
				}
			});

		} catch (error) {
			console.error('Failed to get permissions:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to get permissions: ${error}`
			});
		}
	}

	public async addPermission(toolName: string, command?: string): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
			const allowedCommands = config.get<string[]>('permissions.allowedCommands', []) as string[];

			// Create the permission string
			const permissionString = command ? `${toolName}:${command}` : `${toolName}:*`;

			// Check if permission already exists
			if (!allowedCommands.includes(permissionString)) {
				allowedCommands.push(permissionString);
				await config.update('permissions.allowedCommands', allowedCommands, vscode.ConfigurationTarget.Global);
			}

			// Send updated permissions
			this.sendPermissions();

		} catch (error) {
			console.error('Failed to add permission:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to add permission: ${error}`
			});
		}
	}

	public async removePermission(toolName: string, command?: string): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
			const allowedCommands = config.get<string[]>('permissions.allowedCommands', []) as string[];

			// Create the permission string to remove
			const permissionString = command ? `${toolName}:${command}` : `${toolName}:*`;

			// Remove the permission
			const updatedCommands = allowedCommands.filter((cmd: string) => cmd !== permissionString);
			await config.update('permissions.allowedCommands', updatedCommands, vscode.ConfigurationTarget.Global);

			// Send updated permissions
			this.sendPermissions();

		} catch (error) {
			console.error('Failed to remove permission:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to remove permission: ${error}`
			});
		}
	}

	public handlePermissionResponse(id: string, approved: boolean, alwaysAllow: boolean = false): void {
		// Handle permission approval/denial
		console.log(`Permission ${id}: ${approved ? 'approved' : 'denied'}, alwaysAllow: ${alwaysAllow}`);

		// Note: In the actual implementation, this would communicate with the MCP permission system
		// For now, just log the response
		this._postMessage({
			type: 'permissionHandled',
			data: { id, approved, alwaysAllow }
		});
	}

	public async openPermissionsRequest(message: string): Promise<boolean> {
		const result = await vscode.window.showQuickPick(['Allow', 'Deny'], {
			placeHolder: message,
			canPickMany: false
		});

		return result === 'Allow';
	}
}

// =====================================
// PERMISSIONS UI FUNCTIONALITY
// =====================================

// VS Code API will be provided by ui-scripts.ts
let vsCodeApi: any;

// Note: These functions will be available at runtime through the main ui-scripts module
declare function addMessage(content: string, type?: string): void;
declare function sendStats(eventName: string): void;
declare function escapeHtml(text: string): string;
declare function updateSettings(): void;
declare function updateYoloWarning(): void;

export function setVsCodeApi(api: any): void {
	vsCodeApi = api;
}

export function initialize(): void {
	// Initialize permissions UI
}

export function isPermissionError(content: string): boolean {
	const permissionErrorPatterns = [
		'Error: MCP config file not found',
		'Error: MCP tool',
		'Claude requested permissions to use',
		'permission denied',
		'Permission denied',
		'permission request',
		'Permission request',
		'EACCES',
		'permission error',
		'Permission error'
	];

	return permissionErrorPatterns.some(pattern =>
		content.toLowerCase().includes(pattern.toLowerCase())
	);
}

export function enableYoloMode(): void {
	sendStats('YOLO mode enabled');

	// Update the checkbox
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	if (yoloModeCheckbox) {
		yoloModeCheckbox.checked = true;

		// Trigger the settings update
		updateSettings();

		// Show confirmation message
		addMessage('✅ Yolo Mode enabled! All permission checks will be bypassed for future commands.', 'system');

		// Update the warning banner
		updateYoloWarning();
	}
}

export function respondToPermission(id: string, approved: boolean, alwaysAllow: boolean = false): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'permissionResponse',
			id: id,
			approved: approved,
			alwaysAllow: alwaysAllow
		});
	}

	// Remove the permission request UI
	const permissionElement = document.getElementById(`permission-${id}`);
	if (permissionElement) {
		permissionElement.remove();
	}
}

export function addPermission(): void {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;

	if (!toolSelect || !toolSelect.value) {
		return;
	}

	const toolName = toolSelect.value;
	const command = commandInput && commandInput.style.display !== 'none' ? commandInput.value.trim() : null;

	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'addPermission',
			toolName: toolName,
			command: command || null
		});
	}

	// Reset form
	toolSelect.selectedIndex = 0;
	if (commandInput) {
		commandInput.value = '';
		commandInput.style.display = 'none';
	}
	hideAddPermissionForm();
}

export function removePermission(toolName: string, command: string | null): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'removePermission',
			toolName,
			command
		});
	}
}

export function showAddPermissionForm(): void {
	const form = document.getElementById('addPermissionForm');
	const button = document.getElementById('showAddPermissionBtn');
	if (form && button) {
		form.style.display = 'block';
		button.style.display = 'none';
	}
}

export function hideAddPermissionForm(): void {
	const form = document.getElementById('addPermissionForm');
	const button = document.getElementById('showAddPermissionBtn');
	if (form && button) {
		form.style.display = 'none';
		button.style.display = 'block';
	}
}

export function toggleCommandInput(): void {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	const hint = document.getElementById('permissionsFormHint');

	if (!toolSelect || !commandInput || !hint) {
		return;
	}

	const selectedTool = toolSelect.value;

	if (selectedTool === 'Bash') {
		commandInput.style.display = 'block';
		commandInput.placeholder = 'Command pattern (e.g., npm i *)';
		hint.textContent = 'Bash commands can use wildcards (*) for pattern matching.';
	} else if (selectedTool && selectedTool !== '') {
		commandInput.style.display = 'none';
		hint.textContent = `All ${selectedTool} operations will be allowed.`;
	} else {
		commandInput.style.display = 'none';
		hint.textContent = 'Select a tool to add always-allow permission.';
	}
}

export function handlePermissionsData(data: any): void {
	const permissionsList = document.getElementById('permissionsList');
	if (!permissionsList) {
		return;
	}

	// Clear existing permissions
	permissionsList.innerHTML = '';

	const permissions = data.permissions || {};
	const yoloMode = data.yoloMode || false;

	// Update yolo mode checkbox
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	if (yoloModeCheckbox) {
		yoloModeCheckbox.checked = yoloMode;
	}

	if (yoloMode) {
		permissionsList.innerHTML = `
			<div class="permissions-yolo-notice">
				<div class="yolo-warning-icon">⚠️</div>
				<div class="yolo-warning-text">
					<strong>Yolo Mode is enabled</strong><br>
					All tool permissions are automatically allowed
				</div>
			</div>
		`;
		return;
	}

	// Display permissions by tool
	let hasAnyPermissions = false;
	Object.entries(permissions).forEach(([toolName, commands]: [string, any]) => {
		if (Array.isArray(commands) && commands.length > 0) {
			hasAnyPermissions = true;

			const toolSection = document.createElement('div');
			toolSection.className = 'permissions-tool-section';
			toolSection.innerHTML = `<div class="permissions-tool-title">${toolName}</div>`;

			commands.forEach((command: string) => {
				const permissionItem = document.createElement('div');
				permissionItem.className = 'permissions-item';

				const displayCommand = command === '*' ? 'All operations' : command;

				permissionItem.innerHTML = `
					<div class="permissions-item-content">
						<span class="permissions-command">${escapeHtml(displayCommand)}</span>
					</div>
					<button class="permissions-remove-btn" onclick="removePermission('${toolName}', ${command === '*' ? 'null' : `'${command}'`})" title="Remove permission">
						🗑️
					</button>
				`;

				toolSection.appendChild(permissionItem);
			});

			permissionsList.appendChild(toolSection);
		}
	});

	if (!hasAnyPermissions) {
		permissionsList.innerHTML = `
			<div class="permissions-empty">
				<div class="permissions-empty-icon">🔒</div>
				<div class="permissions-empty-text">No automatic permissions configured</div>
				<div class="permissions-empty-hint">Add permissions to allow tools without prompting</div>
			</div>
		`;
	}
}

// Export all functions to global scope for HTML handlers
declare global {
	interface _Window {
		enableYoloMode: () => void;
		respondToPermission: (id: string, approved: boolean, alwaysAllow?: boolean) => void;
		addPermission: () => void;
		removePermission: (toolName: string, command: string | null) => void;
		showAddPermissionForm: () => void;
		hideAddPermissionForm: () => void;
		toggleCommandInput: () => void;
	}
}
