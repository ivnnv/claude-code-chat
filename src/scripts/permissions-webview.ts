// Permissions Webview - Browser-side permission functions (no Node.js dependencies)

// VS Code API will be provided by ui-scripts.ts
let vsCodeApi: any;

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
	// Update the checkbox
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	if (yoloModeCheckbox) {
		yoloModeCheckbox.checked = true;

		// Trigger the settings update via message
		if (vsCodeApi) {
			vsCodeApi.postMessage({
				type: 'updateSettings',
				settings: {
					yoloMode: true
				}
			});
		}
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

function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Export functions to global scope for HTML handlers
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
