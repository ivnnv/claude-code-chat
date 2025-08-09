import * as vscode from 'vscode';
import { ClaudeChatProvider } from './scripts/chat-provider';
import { ClaudeChatWebviewProvider } from './scripts/webview-provider';
import { registerCommands, registerConfigurationListener, createStatusBarItem } from './scripts/extension-utils';

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

	// Add all disposables to subscriptions
	context.subscriptions.push(...commandDisposables, configChangeDisposable, statusBarItem);
	console.log('Claude Code Sidebar extension activation completed successfully!');
}

export function deactivate() { }
