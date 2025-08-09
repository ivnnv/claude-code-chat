import * as vscode from 'vscode';
import { ClaudeChatProvider } from './scripts/chat-provider';
import { ClaudeChatWebviewProvider } from './scripts/ui-management';
import { registerCommands, registerConfigurationListener, createStatusBarItem } from './scripts/data-utilities';
import { startMCPPermissionsServer } from './scripts/mcp-integration';

export function activate(context: vscode.ExtensionContext) {
	console.log('Claude Code Sidebar extension is being activated!');

	// Create providers
	const provider = new ClaudeChatProvider(context.extensionUri, context);
	const webviewProvider = new ClaudeChatWebviewProvider(context.extensionUri, context, provider);

	// Register webview view provider for sidebar chat
	vscode.window.registerWebviewViewProvider('claude-code-vsc-panel.chat', webviewProvider);

	// Register all commands
	const commandDisposables = registerCommands(context, provider, webviewProvider);

	// Register configuration listener
	const configChangeDisposable = registerConfigurationListener(provider);

	// Create status bar item
	const statusBarItem = createStatusBarItem();

	// Start MCP permissions server
	startMCPPermissionsServer(context.extensionUri.fsPath).then((mcpServer) => {
		if (mcpServer) {
			console.log('MCP permissions server started successfully');
			context.subscriptions.push({
				dispose: () => {
					if (mcpServer && !mcpServer.killed) {
						mcpServer.kill();
						console.log('MCP permissions server stopped');
					}
				}
			});
		} else {
			console.warn('Failed to start MCP permissions server');
		}
	}).catch(error => {
		console.error('Error starting MCP permissions server:', error);
	});

	// Add all disposables to subscriptions
	context.subscriptions.push(...commandDisposables, configChangeDisposable, statusBarItem);
	console.log('Claude Code Sidebar extension activation completed successfully!');
}

export function deactivate() { }
