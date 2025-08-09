// MCP Webview - MCP UI functionality for webview (no Node.js dependencies)
import '../types/global';

// VS Code API will be provided by ui-scripts.ts
let vsCodeApi: any;

export function setVsCodeApi(api: any): void {
	vsCodeApi = api;
}

export function initialize(): void {
	// Initialize MCP servers UI
}

function loadMCPServers(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'loadMCPServers' });
	}
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
	}
}

export function showAddServerForm(): void {
	const form = document.getElementById('addServerForm');
	const button = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	if (form && button && popularServers) {
		form.style.display = 'block';
		button.style.display = 'none';
		popularServers.style.display = 'none';
	}
}

export function hideAddServerForm(): void {
	const form = document.getElementById('addServerForm');
	const button = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	if (form && button && popularServers) {
		form.style.display = 'none';
		button.style.display = 'block';
		popularServers.style.display = 'block';
	}

	// Reset form
	const serverName = document.getElementById('serverName') as HTMLInputElement;
	const serverType = document.getElementById('serverType') as HTMLSelectElement;
	const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
	const serverCommand = document.getElementById('serverCommand') as HTMLInputElement;
	const serverArgs = document.getElementById('serverArgs') as HTMLTextAreaElement;
	const serverEnv = document.getElementById('serverEnv') as HTMLTextAreaElement;
	const serverHeaders = document.getElementById('serverHeaders') as HTMLTextAreaElement;

	if (serverName) {serverName.value = '';}
	if (serverType) {serverType.selectedIndex = 0;}
	if (serverUrl) {serverUrl.value = '';}
	if (serverCommand) {serverCommand.value = '';}
	if (serverArgs) {serverArgs.value = '';}
	if (serverEnv) {serverEnv.value = '';}
	if (serverHeaders) {serverHeaders.value = '';}

	updateServerForm();
}

export function updateServerForm(): void {
	const serverType = document.getElementById('serverType') as HTMLSelectElement;
	const urlGroup = document.getElementById('urlGroup');
	const commandGroup = document.getElementById('commandGroup');
	const argsGroup = document.getElementById('argsGroup');
	const envGroup = document.getElementById('envGroup');
	const headersGroup = document.getElementById('headersGroup');

	if (!serverType) {return;}

	const type = serverType.value;

	// Hide all groups first
	if (urlGroup) {urlGroup.style.display = 'none';}
	if (commandGroup) {commandGroup.style.display = 'none';}
	if (argsGroup) {argsGroup.style.display = 'none';}
	if (envGroup) {envGroup.style.display = 'none';}
	if (headersGroup) {headersGroup.style.display = 'none';}

	// Show relevant groups based on type
	switch (type) {
		case 'http':
		case 'sse':
			if (urlGroup) {urlGroup.style.display = 'block';}
			if (headersGroup) {headersGroup.style.display = 'block';}
			break;
		case 'stdio':
			if (commandGroup) {commandGroup.style.display = 'block';}
			if (argsGroup) {argsGroup.style.display = 'block';}
			if (envGroup) {envGroup.style.display = 'block';}
			break;
	}
}

export function saveMCPServer(): void {
	const serverName = document.getElementById('serverName') as HTMLInputElement;
	const serverType = document.getElementById('serverType') as HTMLSelectElement;
	const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
	const serverCommand = document.getElementById('serverCommand') as HTMLInputElement;
	const serverArgs = document.getElementById('serverArgs') as HTMLTextAreaElement;
	const serverEnv = document.getElementById('serverEnv') as HTMLTextAreaElement;
	const serverHeaders = document.getElementById('serverHeaders') as HTMLTextAreaElement;

	if (!serverName || !serverType || !serverName.value.trim()) {
		alert('Please enter a server name');
		return;
	}

	const name = serverName.value.trim();
	const type = serverType.value;

	let config: any = {};

	switch (type) {
		case 'http':
		case 'sse':
			if (!serverUrl || !serverUrl.value.trim()) {
				alert('Please enter a URL for HTTP/SSE servers');
				return;
			}
			config = {
				type: type,
				url: serverUrl.value.trim()
			};

			// Add headers if specified
			if (serverHeaders && serverHeaders.value.trim()) {
				const headers: { [key: string]: string } = {};
				serverHeaders.value.trim().split('\n').forEach(line => {
					const [key, value] = line.split('=', 2);
					if (key && value) {
						headers[key.trim()] = value.trim();
					}
				});
				if (Object.keys(headers).length > 0) {
					config.headers = headers;
				}
			}
			break;

		case 'stdio':
			if (!serverCommand || !serverCommand.value.trim()) {
				alert('Please enter a command for stdio servers');
				return;
			}
			config = {
				command: serverCommand.value.trim()
			};

			// Add args if specified
			if (serverArgs && serverArgs.value.trim()) {
				config.args = serverArgs.value.trim().split('\n').filter(arg => arg.trim());
			}

			// Add env if specified
			if (serverEnv && serverEnv.value.trim()) {
				const env: { [key: string]: string } = {};
				serverEnv.value.trim().split('\n').forEach(line => {
					const [key, value] = line.split('=', 2);
					if (key && value) {
						env[key.trim()] = value.trim();
					}
				});
				if (Object.keys(env).length > 0) {
					config.env = env;
				}
			}
			break;

		default:
			alert('Please select a server type');
			return;
	}

	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'saveMCPServer',
			name: name,
			config: config
		});
	}

	hideAddServerForm();
}

export function deleteMCPServer(serverName: string): void {
	if (confirm(`Are you sure you want to delete the "${serverName}" MCP server?`)) {
		if (vsCodeApi) {
			vsCodeApi.postMessage({
				type: 'deleteMCPServer',
				name: serverName
			});
		}
	}
}

export function addPopularServer(name: string, config: any): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'saveMCPServer',
			serverName: name,
			config: config
		});
	}
}

export function handleMCPServersData(servers: any): void {
	const serversList = document.getElementById('mcpServersList');
	if (!serversList) {return;}

	serversList.innerHTML = '';

	if (!servers || Object.keys(servers).length === 0) {
		serversList.innerHTML = `
			<div class="mcp-servers-empty">
				<div class="mcp-empty-icon">🔌</div>
				<div class="mcp-empty-text">No MCP servers configured</div>
				<div class="mcp-empty-hint">Add servers to extend Claude's capabilities</div>
			</div>
		`;
		return;
	}

	Object.entries(servers).forEach(([serverName, config]: [string, any]) => {
		const serverItem = document.createElement('div');
		serverItem.className = 'mcp-server-item';

		// Determine server type and display info
		let serverType = 'Unknown';
		let serverDetails = '';

		if (config.url) {
			serverType = config.type === 'sse' ? 'SSE' : 'HTTP';
			serverDetails = config.url;
		} else if (config.command) {
			serverType = 'stdio';
			serverDetails = config.command;
			if (config.args && config.args.length > 0) {
				serverDetails += ' ' + config.args.join(' ');
			}
		}

		serverItem.innerHTML = `
			<div class="mcp-server-info">
				<div class="mcp-server-name">${escapeHtml(serverName)}</div>
				<div class="mcp-server-type">${serverType}</div>
				<div class="mcp-server-details">${escapeHtml(serverDetails)}</div>
			</div>
			<button class="mcp-server-delete-btn" onclick="deleteMCPServer('${escapeHtml(serverName)}')" title="Delete server">
				🗑️
			</button>
		`;

		serversList.appendChild(serverItem);
	});
}

function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Functions are defined in global.ts
