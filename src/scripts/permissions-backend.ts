import * as path from 'path';
import * as vscode from 'vscode';
import { ClaudeChatProvider } from '../claude-provider-backend';

export async function initializeMCPConfig(provider: ClaudeChatProvider): Promise<void> {
	try {
		const storagePath = provider._context.storageUri?.fsPath;
		if (!storagePath) { return; }

		// Create MCP config directory
		const mcpConfigDir = path.join(storagePath, 'mcp');
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(mcpConfigDir));
		} catch {
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(mcpConfigDir));
		}

		// Create or update mcp-servers.json with permissions server, preserving existing servers
		const mcpConfigPath = path.join(mcpConfigDir, 'mcp-servers.json');
		const mcpPermissionsPath = provider.convertToWSLPath(path.join(provider._extensionUri.fsPath, 'out', 'scripts', 'mcp-permissions-bundled.js'));
		const permissionRequestsPath = provider.convertToWSLPath(path.join(storagePath, 'permission-requests'));

		// Load existing config or create new one
		let mcpConfig: any = { mcpServers: {} };
		const mcpConfigUri = vscode.Uri.file(mcpConfigPath);

		try {
			const existingContent = await vscode.workspace.fs.readFile(mcpConfigUri);
			mcpConfig = JSON.parse(new TextDecoder().decode(existingContent));
		} catch {
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

	} catch (error: any) {
		console.error('Failed to initialize MCP config:', error.message);
	}
}

export function getMCPConfigPath(provider: ClaudeChatProvider): string | undefined {
	const storagePath = provider._context.storageUri?.fsPath;
	if (!storagePath) { return undefined; }

	const configPath = path.join(storagePath, 'mcp', 'mcp-servers.json');
	return configPath;
}

export async function initializePermissions(provider: ClaudeChatProvider): Promise<void> {
	try {

		if (provider._permissionWatcher) {
			provider._permissionWatcher.dispose();
			provider._permissionWatcher = undefined;
		}

		const storagePath = provider._context.storageUri?.fsPath;
		if (!storagePath) { return; }

		// Create permission requests directory
		provider._permissionRequestsPath = path.join(path.join(storagePath, 'permission-requests'));
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(provider._permissionRequestsPath));
		} catch {
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(provider._permissionRequestsPath));
		}


		// Set up file watcher for *.request files
		provider._permissionWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(provider._permissionRequestsPath, '*.request')
		);

		provider._permissionWatcher.onDidCreate(async (uri) => {
			// Only handle file scheme URIs, ignore vscode-userdata scheme
			if (uri.scheme === 'file') {
				await handlePermissionRequest(provider, uri);
			}
		});

		provider._disposables.push(provider._permissionWatcher);

	} catch (error: any) {
		console.error('Failed to initialize permissions:', error.message);
	}
}

export async function handlePermissionRequest(provider: ClaudeChatProvider, requestUri: vscode.Uri): Promise<void> {
	try {
		// Read the request file
		const content = await vscode.workspace.fs.readFile(requestUri);
		const request = JSON.parse(new TextDecoder().decode(content));

		// Show permission dialog
		const approved = await showPermissionDialog(provider, request);

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

export async function showPermissionDialog(provider: ClaudeChatProvider, request: any): Promise<boolean> {
	const toolName = request.tool || 'Unknown Tool';

	// Generate pattern for Bash commands
	let pattern = undefined;
	if (toolName === 'Bash' && request.input?.command) {
		pattern = getCommandPattern(request.input.command);
	}

	// Send permission request to the UI
	provider._postMessage({
		type: 'permissionRequest',
		data: {
			id: request.id,
			tool: toolName,
			input: request.input,
			pattern: pattern
		}
	});

	// Wait for response from UI
	return new Promise((resolve) => {
		// Store the resolver so we can call it when we get the response
		provider._pendingPermissionResolvers = provider._pendingPermissionResolvers || new Map();
		provider._pendingPermissionResolvers.set(request.id, resolve);
	});
}

export function handlePermissionResponse(provider: ClaudeChatProvider, id: string, approved: boolean, alwaysAllow?: boolean): void {
	if (provider._pendingPermissionResolvers && provider._pendingPermissionResolvers.has(id)) {
		const resolver = provider._pendingPermissionResolvers.get(id);
		if (resolver) {
			resolver(approved);
			provider._pendingPermissionResolvers.delete(id);

			// Handle always allow setting
			if (alwaysAllow && approved) {
				void saveAlwaysAllowPermission(provider, id);
			}
		}
	}
}

export async function saveAlwaysAllowPermission(provider: ClaudeChatProvider, requestId: string): Promise<void> {
	try {
		// Read the original request to get tool name and input
		const storagePath = provider._context.storageUri?.fsPath;
		if (!storagePath) {return;}

		const requestFileUri = vscode.Uri.file(path.join(storagePath, 'permission-requests', `${requestId}.request`));

		let requestContent: Uint8Array;
		try {
			requestContent = await vscode.workspace.fs.readFile(requestFileUri);
		} catch {
			return; // Request file doesn't exist
		}

		const request = JSON.parse(new TextDecoder().decode(requestContent));

		// Load existing workspace permissions
		const permissionsUri = vscode.Uri.file(path.join(storagePath, 'permission-requests', 'permissions.json'));
		let permissions: any = { alwaysAllow: {} };

		try {
			const content = await vscode.workspace.fs.readFile(permissionsUri);
			permissions = JSON.parse(new TextDecoder().decode(content));
		} catch {
			// File doesn't exist yet, use default permissions
		}

		// Add the new permission
		const toolName = request.tool;
		if (toolName === 'Bash' && request.input?.command) {
			// For Bash, store the command pattern
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
		} else {
			// For other tools, allow all instances
			permissions.alwaysAllow[toolName] = true;
		}

		// Ensure permissions directory exists
		const permissionsDir = vscode.Uri.file(path.dirname(permissionsUri.fsPath));
		try {
			await vscode.workspace.fs.stat(permissionsDir);
		} catch {
			await vscode.workspace.fs.createDirectory(permissionsDir);
		}

		// Save the permissions
		const permissionsContent = new TextEncoder().encode(JSON.stringify(permissions, null, 2));
		await vscode.workspace.fs.writeFile(permissionsUri, permissionsContent);

	} catch (error) {
		console.error('Error saving always-allow permission:', error);
	}
}

export function getCommandPattern(command: string): string {
	const parts = command.trim().split(/\s+/);
	if (parts.length === 0) {return command;}

	const baseCmd = parts[0];
	const subCmd = parts.length > 1 ? parts[1] : '';

	// Common patterns that should use wildcards
	const patterns = [
		// Package managers
		['npm', 'install', 'npm install *'],
		['npm', 'i', 'npm i *'],
		['npm', 'add', 'npm add *'],
		['npm', 'remove', 'npm remove *'],
		['npm', 'uninstall', 'npm uninstall *'],
		['npm', 'update', 'npm update *'],
		['npm', 'run', 'npm run *'],
		['yarn', 'add', 'yarn add *'],
		['yarn', 'remove', 'yarn remove *'],
		['yarn', 'install', 'yarn install *'],
		['pnpm', 'install', 'pnpm install *'],
		['pnpm', 'add', 'pnpm add *'],
		['pnpm', 'remove', 'pnpm remove *'],

		// Git commands
		['git', 'add', 'git add *'],
		['git', 'commit', 'git commit *'],
		['git', 'push', 'git push *'],
		['git', 'pull', 'git pull *'],
		['git', 'checkout', 'git checkout *'],
		['git', 'branch', 'git branch *'],
		['git', 'merge', 'git merge *'],
		['git', 'clone', 'git clone *'],
		['git', 'reset', 'git reset *'],
		['git', 'rebase', 'git rebase *'],
		['git', 'tag', 'git tag *'],

		// Docker commands
		['docker', 'run', 'docker run *'],
		['docker', 'build', 'docker build *'],
		['docker', 'exec', 'docker exec *'],
		['docker', 'logs', 'docker logs *'],
		['docker', 'stop', 'docker stop *'],
		['docker', 'start', 'docker start *'],
		['docker', 'rm', 'docker rm *'],
		['docker', 'rmi', 'docker rmi *'],
		['docker', 'pull', 'docker pull *'],
		['docker', 'push', 'docker push *'],

		// Build tools
		['make', '', 'make *'],
		['cargo', 'build', 'cargo build *'],
		['cargo', 'run', 'cargo run *'],
		['cargo', 'test', 'cargo test *'],
		['cargo', 'install', 'cargo install *'],
		['mvn', 'compile', 'mvn compile *'],
		['mvn', 'test', 'mvn test *'],
		['mvn', 'package', 'mvn package *'],
		['gradle', 'build', 'gradle build *'],
		['gradle', 'test', 'gradle test *'],

		// System commands
		['curl', '', 'curl *'],
		['wget', '', 'wget *'],
		['ssh', '', 'ssh *'],
		['scp', '', 'scp *'],
		['rsync', '', 'rsync *'],
		['tar', '', 'tar *'],
		['zip', '', 'zip *'],
		['unzip', '', 'unzip *'],

		// Development tools
		['node', '', 'node *'],
		['python', '', 'python *'],
		['python3', '', 'python3 *'],
		['pip', 'install', 'pip install *'],
		['pip3', 'install', 'pip3 install *'],
		['composer', 'install', 'composer install *'],
		['composer', 'require', 'composer require *'],
		['bundle', 'install', 'bundle install *'],
		['gem', 'install', 'gem install *'],
	];

	// Find matching pattern
	for (const [cmd, sub, pattern] of patterns) {
		if (baseCmd === cmd && (sub === '' || subCmd === sub)) {
			return pattern;
		}
	}

	// Default: return exact command
	return command;
}

export async function sendPermissions(provider: ClaudeChatProvider): Promise<void> {
	try {
		const storagePath = provider._context.storageUri?.fsPath;
		if (!storagePath) {
			provider._postMessage({
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

		provider._postMessage({
			type: 'permissionsData',
			data: permissions
		});
	} catch (error) {
		console.error('Error sending permissions:', error);
		provider._postMessage({
			type: 'permissionsData',
			data: { alwaysAllow: {} }
		});
	}
}

export async function removePermission(provider: ClaudeChatProvider, toolName: string, command: string | null): Promise<void> {
	try {
		const storagePath = provider._context.storageUri?.fsPath;
		if (!storagePath) {return;}

		const permissionsUri = vscode.Uri.file(path.join(storagePath, 'permission-requests', 'permissions.json'));
		let permissions: any = { alwaysAllow: {} };

		try {
			const content = await vscode.workspace.fs.readFile(permissionsUri);
			permissions = JSON.parse(new TextDecoder().decode(content));
		} catch {
			// File doesn't exist or can't be read, nothing to remove
			return;
		}

		// Remove the permission
		if (command === null) {
			// Remove entire tool permission
			delete permissions.alwaysAllow[toolName];
		} else {
			// Remove specific command from tool permissions
			if (Array.isArray(permissions.alwaysAllow[toolName])) {
				permissions.alwaysAllow[toolName] = permissions.alwaysAllow[toolName].filter(
					(cmd: string) => cmd !== command
				);
				// If no commands left, remove the tool entirely
				if (permissions.alwaysAllow[toolName].length === 0) {
					delete permissions.alwaysAllow[toolName];
				}
			}
		}

		// Save updated permissions
		const permissionsContent = new TextEncoder().encode(JSON.stringify(permissions, null, 2));
		await vscode.workspace.fs.writeFile(permissionsUri, permissionsContent);

		// Send updated permissions to UI
		sendPermissions(provider);

	} catch (error) {
		console.error('Error removing permission:', error);
	}
}

export async function addPermission(provider: ClaudeChatProvider, toolName: string, command: string | null): Promise<void> {
	try {
		const storagePath = provider._context.storageUri?.fsPath;
		if (!storagePath) {return;}

		const permissionsUri = vscode.Uri.file(path.join(storagePath, 'permission-requests', 'permissions.json'));
		let permissions: any = { alwaysAllow: {} };

		try {
			const content = await vscode.workspace.fs.readFile(permissionsUri);
			permissions = JSON.parse(new TextDecoder().decode(content));
		} catch {
			// File doesn't exist, use default permissions
		}

		// Add the new permission
		if (command === null || command === '') {
			// Allow all commands for this tool
			permissions.alwaysAllow[toolName] = true;
		} else {
			// Add specific command pattern
			if (!permissions.alwaysAllow[toolName]) {
				permissions.alwaysAllow[toolName] = [];
			}

			// Convert to array if it's currently set to true
			if (permissions.alwaysAllow[toolName] === true) {
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

		// Ensure permissions directory exists
		const permissionsDir = vscode.Uri.file(path.dirname(permissionsUri.fsPath));
		try {
			await vscode.workspace.fs.stat(permissionsDir);
		} catch {
			await vscode.workspace.fs.createDirectory(permissionsDir);
		}

		// Save updated permissions
		const permissionsContent = new TextEncoder().encode(JSON.stringify(permissions, null, 2));
		await vscode.workspace.fs.writeFile(permissionsUri, permissionsContent);

		// Send updated permissions to UI
		sendPermissions(provider);

	} catch (error) {
		console.error('Error adding permission:', error);
	}
}
