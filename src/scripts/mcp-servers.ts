// MCP server management functionality

// VS Code API will be provided by ui-scripts.ts
let vscode: any;

// Note: This function will be available at runtime through the main ui-scripts module
declare function sendStats(eventName: string): void;

// Global variable for tracking editing state
let editingServerName: string | null = null;

export function updateServerForm(): void {
	const serverType = (document.getElementById('serverType') as HTMLSelectElement)?.value;
	const commandGroup = document.getElementById('commandGroup');
	const urlGroup = document.getElementById('urlGroup');
	const argsGroup = document.getElementById('argsGroup');
	const envGroup = document.getElementById('envGroup');
	const headersGroup = document.getElementById('headersGroup');

	if (serverType === 'stdio') {
		if (commandGroup) {commandGroup.style.display = 'block';}
		if (urlGroup) {urlGroup.style.display = 'none';}
		if (argsGroup) {argsGroup.style.display = 'block';}
		if (envGroup) {envGroup.style.display = 'block';}
		if (headersGroup) {headersGroup.style.display = 'none';}
	} else if (serverType === 'http' || serverType === 'sse') {
		if (commandGroup) {commandGroup.style.display = 'none';}
		if (urlGroup) {urlGroup.style.display = 'block';}
		if (argsGroup) {argsGroup.style.display = 'none';}
		if (envGroup) {envGroup.style.display = 'none';}
		if (headersGroup) {headersGroup.style.display = 'block';}
	}
}

function loadMCPServers(): void {
	vscode.postMessage({ type: 'loadMCPServers' });
}

export function showMCPModal(): void {
	const modal = document.getElementById('mcpModal');
	if (modal) {
		modal.style.display = 'flex';
		loadMCPServers();
	}
}

export function hideMCPModal(): void {
	const modal = document.getElementById('mcpModal');
	if (modal) {
		modal.style.display = 'none';
		hideAddServerForm();
	}
}

export function showAddServerForm(): void {
	const addServerBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addServerForm = document.getElementById('addServerForm');
	if (addServerBtn) {addServerBtn.style.display = 'none';}
	if (popularServers) {popularServers.style.display = 'none';}
	if (addServerForm) {addServerForm.style.display = 'block';}
}

export function hideAddServerForm(): void {
	const addServerBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addServerForm = document.getElementById('addServerForm');
	if (addServerBtn) {addServerBtn.style.display = 'block';}
	if (popularServers) {popularServers.style.display = 'block';}
	if (addServerForm) {addServerForm.style.display = 'none';}
	// Reset form title and button
	const formTitle = document.querySelector('#addServerForm h5');
	if (formTitle) {formTitle.remove();}
	const submitBtn = document.querySelector('#addServerForm .btn');
	if (submitBtn) {submitBtn.textContent = 'Add Server';}
}

export function saveMCPServer(): void {
	sendStats('MCP server added');
	const name = (document.getElementById('serverName') as HTMLInputElement).value.trim();
	const type = (document.getElementById('serverType') as HTMLSelectElement).value;
	if (!name) {
		// Use a simple notification instead of alert which is blocked
		const notification = document.createElement('div');
		notification.textContent = 'Server name is required';
		notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
		document.body.appendChild(notification);
		setTimeout(() => notification.remove(), 3000);
		return;
	}
	// If editing, we can use the same name; if adding, check for duplicates
	if (!editingServerName) {
		const serversList = document.getElementById('mcpServersList');
		if (!serversList) {return;}
		const existingServers = serversList.querySelectorAll('.server-name');
		for (let i = 0; i < existingServers.length; i++) {
			const server = existingServers[i];
			if (server.textContent === name) {
				const notification = document.createElement('div');
				notification.textContent = `Server "${name}" already exists`;
				notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
				document.body.appendChild(notification);
				setTimeout(() => notification.remove(), 3000);
				return;
			}
		}
	}
	const serverConfig: any = { type };
	if (type === 'stdio') {
		const command = (document.getElementById('serverCommand') as HTMLInputElement).value.trim();
		if (!command) {
			const notification = document.createElement('div');
			notification.textContent = 'Command is required for stdio servers';
			notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
			document.body.appendChild(notification);
			setTimeout(() => notification.remove(), 3000);
			return;
		}
		serverConfig.command = command;
		const argsText = (document.getElementById('serverArgs') as HTMLTextAreaElement).value.trim();
		if (argsText) {
			serverConfig.args = argsText.split('\n').filter(line => line.trim());
		}
		const envText = (document.getElementById('serverEnv') as HTMLTextAreaElement).value.trim();
		if (envText) {
			serverConfig.env = {};
			envText.split('\n').forEach(line => {
				const [key, ...valueParts] = line.split('=');
				if (key && valueParts.length > 0) {
					serverConfig.env[key.trim()] = valueParts.join('=').trim();
				}
			});
		}
	} else if (type === 'http' || type === 'sse') {
		const url = (document.getElementById('serverUrl') as HTMLInputElement).value.trim();
		if (!url) {
			const notification = document.createElement('div');
			notification.textContent = 'URL is required for HTTP/SSE servers';
			notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
			document.body.appendChild(notification);
			setTimeout(() => notification.remove(), 3000);
			return;
		}
		serverConfig.url = url;
		const headersText = (document.getElementById('serverHeaders') as HTMLTextAreaElement).value.trim();
		if (headersText) {
			serverConfig.headers = {};
			headersText.split('\n').forEach(line => {
				const [key, ...valueParts] = line.split('=');
				if (key && valueParts.length > 0) {
					serverConfig.headers[key.trim()] = valueParts.join('=').trim();
				}
			});
		}
	}
	vscode.postMessage({
		type: 'saveMCPServer',
		name: name,
		config: serverConfig
	});
	hideAddServerForm();
}

export function deleteMCPServer(serverName: string): void {
	// Just delete without confirmation
	vscode.postMessage({
		type: 'deleteMCPServer',
		name: serverName
	});
}

export function addPopularServer(name: string, config: any): void {
	vscode.postMessage({
		type: 'saveMCPServer',
		serverName: name,
		config
	});
}

export function editMCPServer(name: string, config: any): void {
	// Set editing state
	editingServerName = name;

	// Hide add button and popular servers
	const addBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addForm = document.getElementById('addServerForm');

	if (addBtn) {addBtn.style.display = 'none';}
	if (popularServers) {popularServers.style.display = 'none';}
	if (addForm) {addForm.style.display = 'block';}

	// Update form title and button
	if (!document.querySelector('#addServerForm h5')) {
		addForm?.insertAdjacentHTML('afterbegin', '<h5 style="margin: 0 0 20px 0; font-size: 14px; font-weight: 600;">Edit MCP Server</h5>');
	} else {
		const title = document.querySelector('#addServerForm h5');
		if (title) {title.textContent = 'Edit MCP Server';}
	}

	// Update save button text
	const saveBtn = document.querySelector('#addServerForm .btn:not(.outlined)');
	if (saveBtn) {saveBtn.textContent = 'Update Server';}

	// Populate form with existing values
	const serverName = document.getElementById('serverName') as HTMLInputElement;
	const serverType = document.getElementById('serverType') as HTMLSelectElement;
	const serverCommand = document.getElementById('serverCommand') as HTMLInputElement;
	const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
	const serverArgs = document.getElementById('serverArgs') as HTMLTextAreaElement;
	const serverEnv = document.getElementById('serverEnv') as HTMLTextAreaElement;
	const serverHeaders = document.getElementById('serverHeaders') as HTMLTextAreaElement;

	if (serverName) {
		serverName.value = name;
		serverName.disabled = true; // Don't allow name changes when editing
	}

	if (serverType) {serverType.value = config.type || 'stdio';}

	if (config.command && serverCommand) {
		serverCommand.value = config.command;
	}
	if (config.url && serverUrl) {
		serverUrl.value = config.url;
	}
	if (config.args && Array.isArray(config.args) && serverArgs) {
		serverArgs.value = config.args.join('\n');
	}
	if (config.env && serverEnv) {
		const envLines = Object.entries(config.env).map(([key, value]) => `${key}=${value}`);
		serverEnv.value = envLines.join('\n');
	}
	if (config.headers && serverHeaders) {
		const headerLines = Object.entries(config.headers).map(([key, value]) => `${key}=${value}`);
		serverHeaders.value = headerLines.join('\n');
	}

	// Update form field visibility
	updateServerForm();

	const toolsList = document.querySelector('.tools-list') as HTMLElement;
	if (toolsList) {
		toolsList.scrollTop = toolsList.scrollHeight;
	}
}

export function displayMCPServers(servers: any): void {
	const serversList = document.getElementById('mcpServersList');
	if (!serversList) {return;}

	serversList.innerHTML = '';

	if (Object.keys(servers).length === 0) {
		serversList.innerHTML = '<div class="no-servers">No MCP servers configured</div>';
		return;
	}

	for (const [name, config] of Object.entries(servers)) {
		const serverItem = document.createElement('div');
		serverItem.className = 'mcp-server-item';

		// Defensive check for config structure
		if (!config || typeof config !== 'object') {
			console.error('Invalid config for server:', name, config);
			continue;
		}

		const serverConfig = config as any;
		const serverType = serverConfig.type || 'stdio';
		let configDisplay = '';

		if (serverType === 'stdio') {
			configDisplay = `Command: ${serverConfig.command || 'Not specified'}`;
			if (serverConfig.args && Array.isArray(serverConfig.args)) {
				configDisplay += `<br>Args: ${serverConfig.args.join(' ')}`;
			}
		} else if (serverType === 'http' || serverType === 'sse') {
			configDisplay = `URL: ${serverConfig.url || 'Not specified'}`;
		} else {
			configDisplay = `Type: ${serverType}`;
		}

		serverItem.innerHTML = `
			<div class="server-info">
				<div class="server-name">${name}</div>
				<div class="server-type">${serverType.toUpperCase()}</div>
				<div class="server-config">${configDisplay}</div>
			</div>
			<div class="server-actions">
				<button class="btn outlined server-edit-btn" onclick="editMCPServer('${name}', ${JSON.stringify(serverConfig).replace(/"/g, '&quot;')})">Edit</button>
				<button class="btn outlined server-delete-btn" onclick="deleteMCPServer('${name}')">Delete</button>
			</div>
		`;

		serversList.appendChild(serverItem);
	}
}

export function initialize(): void {
	// Expose functions to global scope for HTML onclick handlers
	Object.assign(window, {
		showMCPModal,
		hideMCPModal,
		showAddServerForm,
		hideAddServerForm,
		updateServerForm,
		saveMCPServer,
		deleteMCPServer,
		addPopularServer,
		editMCPServer
	});
}

// Set VS Code API (called from ui-scripts.ts)
export function setVsCodeApi(api: any): void {
	vscode = api;
}
