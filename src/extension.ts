import * as vscode from 'vscode';
import { ClaudeChatProvider, ClaudeChatWebviewProvider } from './claude-provider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Claude Code Sidebar extension is being activated!');
	const provider = new ClaudeChatProvider(context.extensionUri, context);

	const disposable = vscode.commands.registerCommand('claude-code-vsc-panel.openChat', (column?: vscode.ViewColumn) => {
		console.log('Claude Code Sidebar command executed!');
		provider.show(column);
	});

	const loadConversationDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.loadConversation', (filename: string) => {
		provider.loadConversation(filename);
	});

	// Register webview view provider for sidebar chat (using shared provider instance)
	const webviewProvider = new ClaudeChatWebviewProvider(context.extensionUri, context, provider);
	vscode.window.registerWebviewViewProvider('claude-code-vsc-panel.chat', webviewProvider);

	// Register new command handlers for the native title bar buttons
	const settingsDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.settings', () => {
		webviewProvider.postMessage({ type: 'showSettings' });
	});

	const historyDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.history', () => {
		webviewProvider.postMessage({ type: 'showHistory' });
	});

	const newChatDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.newChat', () => {
		webviewProvider.postMessage({ type: 'newSession' });
	});

	const statusInfoDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.statusInfo', () => {
		webviewProvider.postMessage({ type: 'toggleStatusInfo' });
	});

	// Listen for configuration changes
	const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('claudeCodeVscPanel.wsl')) {
			console.log('WSL configuration changed, starting new session');
			provider.newSessionOnConfigChange();
		}
	});

	// Create status bar item
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "Claude";
	statusBarItem.tooltip = "Open Claude Code Sidebar (Ctrl+Shift+C)";
	statusBarItem.command = 'claude-code-vsc-panel.openChat';
	statusBarItem.show();

	context.subscriptions.push(disposable, loadConversationDisposable, settingsDisposable, historyDisposable, newChatDisposable, statusInfoDisposable, configChangeDisposable, statusBarItem);
	console.log('Claude Code Sidebar extension activation completed successfully!');
}

export function deactivate() { }







