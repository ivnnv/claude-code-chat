// Permission management functionality

// VS Code API will be provided by ui-scripts.ts
let vscode: any;

// Note: These functions will be available at runtime through the main ui-scripts module
declare function shouldAutoScroll(messagesDiv: HTMLElement): boolean;
declare function scrollToBottomIfNeeded(messagesDiv: HTMLElement, shouldScroll?: boolean | null): void;
declare function addMessage(content: string, type?: string): void;
declare function sendStats(eventName: string): void;
declare function escapeHtml(text: string): string;
declare function updateSettings(): void;
declare function updateYoloWarning(): void;

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

export function enableYoloModeFromPermission(permissionId: string): void {
	// Hide the menu first
	togglePermissionMenu(permissionId);

	// Auto-approve this permission
	respondToPermission(permissionId, true);

	// Enable yolo mode
	enableYoloMode();
}

export function renderPermissions(permissions: any): void {
	const permissionsList = document.getElementById('permissionsList');
	if (!permissionsList) {return;}

	if (!permissions || !permissions.alwaysAllow || Object.keys(permissions.alwaysAllow).length === 0) {
		permissionsList.innerHTML = `
			<div class="permissions-empty">
				No always-allow permissions set
			</div>
		`;
		return;
	}

	let html = '';
	for (const [toolName, permission] of Object.entries(permissions.alwaysAllow)) {
		const perm = permission as any;
		if (perm === true || (Array.isArray(perm) && perm.length === 0)) {
			// Tool has blanket permission
			html += `
				<div class="permission-item">
					<div class="permission-info">
						<div class="permission-name">${toolName}</div>
						<div class="permission-description">All commands allowed</div>
					</div>
					<button class="permission-remove-btn" onclick="removePermission('${toolName}', null)">Remove</button>
				</div>
			`;
		} else if (Array.isArray(perm)) {
			// Tool has specific command permissions
			for (const command of perm) {
				html += `
					<div class="permission-item">
						<div class="permission-info">
							<div class="permission-name">${toolName}</div>
							<div class="permission-description">${escapeHtml(command)}</div>
						</div>
						<button class="permission-remove-btn" onclick="removePermission('${toolName}', '${escapeHtml(command)}')">Remove</button>
					</div>
				`;
			}
		}
	}

	permissionsList.innerHTML = html;
}

export function showAddPermissionForm(): void {
	const showBtn = document.getElementById('showAddPermissionBtn');
	const form = document.getElementById('addPermissionForm');
	if (showBtn) {showBtn.style.display = 'none';}
	if (form) {form.style.display = 'block';}

	// Focus the select element
	setTimeout(() => {
		const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
		if (toolSelect) {toolSelect.focus();}
	}, 100);
}

export function hideAddPermissionForm(): void {
	const showBtn = document.getElementById('showAddPermissionBtn');
	const form = document.getElementById('addPermissionForm');
	if (showBtn) {showBtn.style.display = 'flex';}
	if (form) {form.style.display = 'none';}

	// Reset form
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	if (toolSelect) {toolSelect.value = '';}
	if (commandInput) {
		commandInput.value = '';
		commandInput.style.display = 'none';
	}
}

export function addPermission(): void {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	const addBtn = document.getElementById('addPermissionBtn') as HTMLButtonElement;

	if (!toolSelect || !addBtn) {return;}

	const toolName = toolSelect.value;
	if (!toolName) {return;}

	addBtn.disabled = true;
	addBtn.textContent = 'Adding...';

	const permissionData: any = { toolName };
	if (toolName === 'Bash' && commandInput && commandInput.value.trim()) {
		permissionData.command = commandInput.value.trim();
	}

	vscode.postMessage({
		type: 'addPermission',
		...permissionData
	});

	// Reset button after a delay
	setTimeout(() => {
		if (addBtn) {
			addBtn.disabled = false;
			addBtn.textContent = 'Add';
		}
	}, 1000);

	hideAddPermissionForm();
}

export function removePermission(toolName: string, command: string | null): void {
	vscode.postMessage({
		type: 'removePermission',
		toolName,
		command
	});
}

export function toggleCommandInput(): void {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	const hintDiv = document.getElementById('permissionsFormHint');

	if (toolSelect && commandInput) {
		if (toolSelect.value === 'Bash') {
			commandInput.style.display = 'block';
			commandInput.placeholder = 'Command pattern (e.g., npm i *)';
			if (hintDiv) {hintDiv.textContent = 'Use * as wildcard. Example: npm i * allows any npm install command';}
		} else {
			commandInput.style.display = 'none';
			if (hintDiv) {hintDiv.textContent = '';}
		}
	}
}

export function respondToPermission(id: string, approved: boolean, alwaysAllow: boolean = false): void {
	vscode.postMessage({
		type: 'permissionResponse',
		id: id,
		approved: approved,
		alwaysAllow: alwaysAllow
	});

	// Remove the permission request message
	const messageDiv = document.querySelector(`[data-permission-id="${id}"]`);
	if (messageDiv) {
		messageDiv.remove();
	}

	// If always allow was selected, show feedback
	if (approved && alwaysAllow) {
		addMessage('✅ Permission added to always-allow list', 'system');
	}
}

export function togglePermissionMenu(permissionId: string): void {
	const menu = document.getElementById(`permissionMenu-${permissionId}`);
	if (menu) {
		menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
	}
}

export function addPermissionRequestMessage(data: any): void {
	const messagesDiv = document.getElementById('chatMessages')!;
	const shouldScroll = shouldAutoScroll(messagesDiv);
	const messageDiv = document.createElement('div');
	messageDiv.className = 'message permission-request';
	const toolName = data.tool || 'Unknown Tool';
	// Create always allow button text with command styling for Bash
	let alwaysAllowText = `Always allow ${toolName}`;
	let alwaysAllowTooltip = '';
	if (toolName === 'Bash' && data.pattern) {
		const pattern = data.pattern;
		// Remove the asterisk for display - show "npm i" instead of "npm i *"
		const displayPattern = (pattern || '').replace(' *', '');
		const truncatedPattern = displayPattern.length > 30 ? displayPattern.substring(0, 30) + '...' : displayPattern;
		alwaysAllowText = `Always allow <code>${truncatedPattern}</code>`;
		alwaysAllowTooltip = displayPattern.length > 30 ? `title="${displayPattern}"` : '';
	}
	messageDiv.innerHTML = `
		<div class="permission-header">
			<span class="icon">🔐</span>
			<span>Permission Required</span>
			<div class="permission-menu">
				<button class="permission-menu-btn" onclick="togglePermissionMenu('${data.id}')" title="More options">⋮</button>
				<div class="permission-menu-dropdown" id="permissionMenu-${data.id}" style="display: none;">
					<button class="permission-menu-item" onclick="enableYoloModeFromPermission('${data.id}')">
						<span class="menu-icon">⚡</span>
						<div class="menu-content">
							<span class="menu-title">Enable YOLO Mode</span>
							<span class="menu-subtitle">Auto-allow all permissions</span>
						</div>
					</button>
				</div>
			</div>
		</div>
		<div class="permission-content">
			<p>Allow <strong>${toolName}</strong> to execute the tool call above?</p>
			<div class="permission-buttons">
				<button class="btn deny" onclick="respondToPermission('${data.id}', false)">Deny</button>
				<button class="btn always-allow" onclick="respondToPermission('${data.id}', true, true)" ${alwaysAllowTooltip}>${alwaysAllowText}</button>
				<button class="btn allow" onclick="respondToPermission('${data.id}', true)">Allow</button>
			</div>
		</div>
	`;
	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

export function initialize(): void {
	// Expose functions to global scope for HTML onclick handlers
	Object.assign(window, {
		respondToPermission,
		addPermission,
		removePermission,
		toggleCommandInput,
		showAddPermissionForm,
		hideAddPermissionForm,
		enableYoloMode
	});
}

// Set VS Code API (called from ui-scripts.ts)
export function setVsCodeApi(api: any): void {
	vscode = api;
}
