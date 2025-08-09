// Data Utilities - Consolidated data management, file operations, and utility functions
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

// =====================================
// CONVERSATION MANAGER FUNCTIONALITY
// =====================================

export interface ConversationData {
	filename: string;
	sessionId: string;
	startTime: string;
	endTime: string;
	messageCount: number;
	totalCost: number;
	totalTokens: {
		input: number;
		output: number;
	};
	messages: Array<{ timestamp: string, messageType: string, data: any }>;
	firstUserMessage: string;
	lastUserMessage: string;
}

export class ConversationManager {
	private _conversationsPath: string | undefined;
	private _conversationIndex: ConversationData[] = [];
	private _currentConversation: Array<{ timestamp: string, messageType: string, data: any }> = [];

	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {
		this._initializeConversations();
		this._conversationIndex = this._context.workspaceState.get('claude.conversationIndex', []);
	}

	private async _initializeConversations(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {return;}

		this._conversationsPath = path.join(workspaceFolder.uri.fsPath, '.claude', 'conversations');

		// Create conversations directory if it doesn't exist
		if (!fs.existsSync(this._conversationsPath)) {
			fs.mkdirSync(this._conversationsPath, { recursive: true });
		}
	}

	public addMessage(message: { type: string, data: any }): void {
		// Save to conversation
		this._currentConversation.push({
			timestamp: new Date().toISOString(),
			messageType: message.type,
			data: message.data
		});
	}

	public async saveConversation(sessionId: string, sessionStats: any): Promise<string> {
		if (!this._conversationsPath || this._currentConversation.length === 0) {
			return '';
		}

		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const filename = `conversation-${timestamp}.json`;
			const filepath = path.join(this._conversationsPath, filename);

			// Find first and last user messages
			const userMessages = this._currentConversation.filter(msg => msg.messageType === 'userInput');
			const firstUserMessage = userMessages[0]?.data || 'New conversation';
			const lastUserMessage = userMessages[userMessages.length - 1]?.data || firstUserMessage;

			const conversationData: ConversationData = {
				filename,
				sessionId,
				startTime: this._currentConversation[0]?.timestamp || new Date().toISOString(),
				endTime: new Date().toISOString(),
				messageCount: this._currentConversation.length,
				totalCost: sessionStats.totalCost || 0,
				totalTokens: {
					input: sessionStats.totalTokensInput || 0,
					output: sessionStats.totalTokensOutput || 0
				},
				messages: this._currentConversation,
				firstUserMessage,
				lastUserMessage
			};

			await fs.promises.writeFile(filepath, JSON.stringify(conversationData, null, 2));

			// Update conversation index
			this._conversationIndex.unshift(conversationData);

			// Keep only last 100 conversations in index
			if (this._conversationIndex.length > 100) {
				this._conversationIndex = this._conversationIndex.slice(0, 100);
			}

			await this._context.workspaceState.update('claude.conversationIndex', this._conversationIndex);

			return filename;

		} catch (error) {
			console.error('Failed to save conversation:', error);
			return '';
		}
	}

	public async loadConversation(filename: string): Promise<ConversationData | null> {
		if (!this._conversationsPath) {
			return null;
		}

		try {
			const filepath = path.join(this._conversationsPath, filename);
			const data = await fs.promises.readFile(filepath, 'utf8');
			const conversation: ConversationData = JSON.parse(data);

			// Send conversation history to webview
			this._postMessage({
				type: 'conversationHistory',
				messages: conversation.messages
			});

			return conversation;

		} catch (error) {
			console.error('Failed to load conversation:', error);
			return null;
		}
	}

	public getConversationList(): ConversationData[] {
		return this._conversationIndex.slice(0, 50); // Return last 50 conversations
	}

	public clearCurrentConversation(): void {
		this._currentConversation = [];
	}

	public getLatestConversation(): ConversationData | undefined {
		return this._conversationIndex[0];
	}
}

// =====================================
// BACKUP GIT MANAGER FUNCTIONALITY
// =====================================

export class BackupGitManager {
	private _backupRepoPath: string | undefined;

	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {
		this._initializeBackupRepo();
	}

	private async _initializeBackupRepo(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {return;}

			const workspacePath = workspaceFolder.uri.fsPath;
			this._backupRepoPath = path.join(workspacePath, '.claude', 'backup.git');

			// Create backup directory if it doesn't exist
			const backupDir = path.dirname(this._backupRepoPath);
			if (!fs.existsSync(backupDir)) {
				fs.mkdirSync(backupDir, { recursive: true });
			}

			// Initialize bare git repository if it doesn't exist
			if (!fs.existsSync(this._backupRepoPath)) {
				await exec(`git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" init`);
				await exec(`git --git-dir="${this._backupRepoPath}" config user.name "Claude Code Panel"`);
				await exec(`git --git-dir="${this._backupRepoPath}" config user.email "claude@vsc-panel.local"`);
			}

		} catch (error) {
			console.error('Failed to initialize backup repository:', error);
		}
	}

	public async createBackupCommit(message: string): Promise<string | null> {
		if (!this._backupRepoPath) {
			return null;
		}

		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {return null;}

			const workspacePath = workspaceFolder.uri.fsPath;
			const now = new Date();
			const displayTimestamp = now.toISOString();
			const commitMessage = `Before: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`;

			// Add all files using git-dir and work-tree (excludes .git automatically)
			await exec(`git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" add -A`);

			// Check if this is the first commit (no HEAD exists yet)
			let isFirstCommit = false;
			try {
				await exec(`git --git-dir="${this._backupRepoPath}" rev-parse HEAD`);
			} catch {
				isFirstCommit = true;
			}

			// Check if there are changes to commit
			const { stdout: status } = await exec(`git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" status --porcelain`);

			// Always create a checkpoint, even if no files changed
			let actualMessage;
			if (isFirstCommit) {
				actualMessage = `Initial backup: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`;
			} else if (status.trim()) {
				actualMessage = commitMessage;
			} else {
				actualMessage = `Checkpoint: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`;
			}

			// Create the commit
			await exec(`git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" commit --allow-empty -m "${actualMessage}"`);

			// Get the commit SHA
			const { stdout: sha } = await exec(`git --git-dir="${this._backupRepoPath}" rev-parse HEAD`);
			const commitSha = sha.trim().substring(0, 7);

			console.log('✅ Backup commit created:', commitSha, actualMessage);

			// Send restore option to UI
			this._postMessage({
				type: 'showRestoreOption',
				sha: commitSha,
				timestamp: displayTimestamp,
				message: actualMessage
			});

			return commitSha;

		} catch (error) {
			console.error('Failed to create backup commit:', error);
			return null;
		}
	}

	public async restoreToCommit(commitSha: string): Promise<void> {
		if (!this._backupRepoPath) {
			return;
		}

		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {return;}

			const workspacePath = workspaceFolder.uri.fsPath;

			// Reset to the specified commit
			await exec(`git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" reset --hard ${commitSha}`);

			this._postMessage({
				type: 'addMessage',
				content: `✅ Successfully restored to checkpoint ${commitSha}`,
				messageType: 'system'
			});

		} catch (error) {
			console.error('Failed to restore to commit:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to restore to checkpoint: ${error}`
			});
		}
	}

	public getBackupRepoPath(): string | undefined {
		return this._backupRepoPath;
	}
}

// =====================================
// EDITOR FILE MANAGER FUNCTIONALITY
// =====================================

export class EditorFileManager {
	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public async getWorkspaceFiles(searchTerm?: string): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				this._postMessage({ type: 'workspaceFiles', data: [] });
				return;
			}

			// Use VS Code's file search API
			let files = await vscode.workspace.findFiles(
				'**/*',
				'**/node_modules/**',
				1000 // Limit to 1000 files
			);

			// Filter by search term if provided
			if (searchTerm && searchTerm.trim()) {
				const term = searchTerm.toLowerCase();
				files = files.filter(file =>
					path.basename(file.fsPath).toLowerCase().includes(term) ||
					file.fsPath.toLowerCase().includes(term)
				);
			}

			// Convert to relative paths and sort
			const relativePaths = files
				.map(file => vscode.workspace.asRelativePath(file))
				.sort()
				.slice(0, 100); // Limit to 100 results

			this._postMessage({
				type: 'workspaceFiles',
				data: relativePaths
			});

		} catch (error) {
			console.error('Failed to get workspace files:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to get workspace files: ${error}`
			});
		}
	}

	public async openFileInEditor(filePath: string): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {return;}

			const absolutePath = path.isAbsolute(filePath)
				? filePath
				: path.join(workspaceFolder.uri.fsPath, filePath);

			const uri = vscode.Uri.file(absolutePath);
			await vscode.window.showTextDocument(uri);

		} catch (error) {
			console.error('Failed to open file:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to open file: ${error}`
			});
		}
	}

	public async selectImageFile(): Promise<void> {
		try {
			const result = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: {
					'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp']
				}
			});

			if (result && result[0]) {
				const filePath = result[0].fsPath;
				const fileName = path.basename(filePath);

				// Read file and convert to base64
				const fileData = await fs.promises.readFile(filePath);
				const base64Data = fileData.toString('base64');
				const mimeType = this.getMimeType(path.extname(filePath));

				this._postMessage({
					type: 'imageSelected',
					data: {
						fileName,
						mimeType,
						base64Data
					}
				});
			}

		} catch (error) {
			console.error('Failed to select image file:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to select image file: ${error}`
			});
		}
	}

	private getMimeType(extension: string): string {
		const mimeTypes: { [key: string]: string } = {
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.bmp': 'image/bmp',
			'.svg': 'image/svg+xml',
			'.webp': 'image/webp'
		};

		return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
	}

	public sendEditorContext(): void {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			this._postMessage({
				type: 'editorContext',
				data: { hasActiveFile: false }
			});
			return;
		}

		const document = activeEditor.document;
		const selection = activeEditor.selection;

		const contextData: any = {
			hasActiveFile: true,
			fileName: path.basename(document.fileName),
			filePath: vscode.workspace.asRelativePath(document.fileName),
			language: document.languageId,
			cursorPosition: {
				line: selection.start.line + 1, // Convert to 1-based
				character: selection.start.character + 1
			}
		};

		// Add selection info if text is selected
		if (!selection.isEmpty) {
			contextData.selection = {
				start: {
					line: selection.start.line + 1,
					character: selection.start.character + 1
				},
				end: {
					line: selection.end.line + 1,
					character: selection.end.character + 1
				}
			};
			contextData.selectedText = document.getText(selection);
		}

		this._postMessage({
			type: 'editorContext',
			data: contextData
		});
	}

	public async executeSlashCommand(command: string): Promise<void> {
		try {
			// Create a new terminal and execute the Claude command
			const terminal = vscode.window.createTerminal('Claude Command');
			terminal.sendText(`claude /${command}`);
			terminal.show();

		} catch (error) {
			console.error('Failed to execute slash command:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to execute command: ${error}`
			});
		}
	}
}

// =====================================
// EXTENSION UTILS FUNCTIONALITY
// =====================================

// Note: ConversationData interface is already defined above

export function calculateCost(
	inputTokens: number,
	outputTokens: number,
	cacheCreationTokens: number = 0,
	cacheReadTokens: number = 0
): number {
	// Claude 3.5 Sonnet pricing (as of the knowledge cutoff)
	const inputCostPer1K = 0.003;   // $3.00 per 1M tokens
	const outputCostPer1K = 0.015;  // $15.00 per 1M tokens
	const cacheWriteCostPer1K = 0.00375;  // $3.75 per 1M tokens
	const cacheReadCostPer1K = 0.0003;    // $0.30 per 1M tokens

	const inputCost = (inputTokens / 1000) * inputCostPer1K;
	const outputCost = (outputTokens / 1000) * outputCostPer1K;
	const cacheWriteCost = (cacheCreationTokens / 1000) * cacheWriteCostPer1K;
	const cacheReadCost = (cacheReadTokens / 1000) * cacheReadCostPer1K;

	return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}


export function getTimeAgo(timestamp: string): string {
	const now = new Date();
	const past = new Date(timestamp);
	const diffMs = now.getTime() - past.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 1) {
		return 'just now';
	} else if (diffMins < 60) {
		return `${diffMins}m ago`;
	} else if (diffHours < 24) {
		return `${diffHours}h ago`;
	} else if (diffDays < 7) {
		return `${diffDays}d ago`;
	} else {
		return past.toLocaleDateString();
	}
}

export function sanitizeFilename(filename: string): string {
	return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}

export function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function isValidSessionId(sessionId: string): boolean {
	// Basic session ID validation
	return /^[a-zA-Z0-9-_]{8,}$/.test(sessionId);
}

export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return text.substring(0, maxLength - 3) + '...';
}

export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout;
	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), wait);
	};
}

// =====================================
// EXTENSION REGISTRATION UTILITIES
// =====================================

export function registerCommands(
	_context: vscode.ExtensionContext,
	provider: any,
	_webviewProvider: any
): vscode.Disposable[] {
	const commandDisposables: vscode.Disposable[] = [];

	// Register panel commands
	commandDisposables.push(
		vscode.commands.registerCommand('claude-code-vsc-panel.openPanel', () => {
			provider.show();
		})
	);

	commandDisposables.push(
		vscode.commands.registerCommand('claude-code-vsc-panel.openSidebar', () => {
			vscode.commands.executeCommand('workbench.view.extension.claude-code-vsc-panel');
		})
	);

	// Register chat commands
	commandDisposables.push(
		vscode.commands.registerCommand('claude-code-vsc-panel.openChat', () => {
			vscode.commands.executeCommand('workbench.view.extension.claude-code-vsc-panel');
		})
	);

	commandDisposables.push(
		vscode.commands.registerCommand('claude-code-vsc-panel.newChat', () => {
			provider.newConversation();
		})
	);

	commandDisposables.push(
		vscode.commands.registerCommand('claude-code-vsc-panel.history', () => {
			provider.showHistory();
		})
	);

	commandDisposables.push(
		vscode.commands.registerCommand('claude-code-vsc-panel.settings', () => {
			provider.showSettings();
		})
	);

	return commandDisposables;
}

export function registerConfigurationListener(_provider: any): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('claudeCodeVscPanel')) {
			console.log('Configuration changed, provider could be notified');
		}
	});
}

export function createStatusBarItem(): vscode.StatusBarItem {
	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBarItem.text = '$(comment-discussion) Claude';
	statusBarItem.tooltip = 'Open Claude Code Panel';
	statusBarItem.command = 'claude-code-vsc-panel.openPanel';
	statusBarItem.show();
	return statusBarItem;
}
