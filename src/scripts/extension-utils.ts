
import * as vscode from 'vscode';
import { ClaudeChatProvider } from './chat-provider';
import { ClaudeChatWebviewProvider } from './webview-provider';

export interface ConversationData {
	sessionId: string;
	startTime: string | undefined;
	endTime: string;
	messageCount: number;
	totalCost: number;
	totalTokens: {
		input: number;
		output: number;
	};
	messages: Array<{ timestamp: string, messageType: string, data: any }>;
	filename: string;
	title?: string;
	timestamp?: string;
	lastModified?: string;
	summary?: string;
}

export function registerCommands(
	context: vscode.ExtensionContext,
	provider: ClaudeChatProvider,
	webviewProvider: ClaudeChatWebviewProvider
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Main chat command
	const openChatDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.openChat', (column?: vscode.ViewColumn) => {
		console.log('Claude Code Sidebar command executed!');
		provider.show(column);
	});
	disposables.push(openChatDisposable);

	// Load conversation command
	const loadConversationDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.loadConversation', (filename: string) => {
		provider.loadConversation(filename);
	});
	disposables.push(loadConversationDisposable);

	// Title bar button commands
	const settingsDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.settings', () => {
		webviewProvider.postMessage({ type: 'showSettings' });
	});
	disposables.push(settingsDisposable);

	const historyDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.history', () => {
		webviewProvider.postMessage({ type: 'showHistory' });
	});
	disposables.push(historyDisposable);

	const newChatDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.newChat', () => {
		webviewProvider.postMessage({ type: 'newSession' });
	});
	disposables.push(newChatDisposable);

	const statusInfoDisposable = vscode.commands.registerCommand('claude-code-vsc-panel.statusInfo', () => {
		webviewProvider.postMessage({ type: 'toggleStatusInfo' });
	});
	disposables.push(statusInfoDisposable);

	return disposables;
}

export function registerConfigurationListener(provider: ClaudeChatProvider): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('claudeCodeVscPanel.wsl')) {
			console.log('WSL configuration changed, starting new session');
			provider.newSessionOnConfigChange();
		}
	});
}

export function createStatusBarItem(): vscode.StatusBarItem {
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "Claude";
	statusBarItem.tooltip = "Open Claude Code Sidebar (Ctrl+Shift+C)";
	statusBarItem.command = 'claude-code-vsc-panel.openChat';
	statusBarItem.show();
	return statusBarItem;
}
