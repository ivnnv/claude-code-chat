import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationData } from './extension-utils';

export interface ConversationIndexEntry {
	filename: string;
	sessionId: string;
	startTime: string;
	endTime: string;
	messageCount: number;
	totalCost: number;
	firstUserMessage: string;
	lastUserMessage: string;
}

export class ConversationManager {
	private _conversationsPath: string | undefined;
	private _currentConversation: Array<{ timestamp: string, messageType: string, data: any }> = [];
	private _conversationStartTime: string | undefined;
	private _conversationIndex: ConversationIndexEntry[] = [];

	constructor(private _context: vscode.ExtensionContext) {}

	public async initializeConversations(): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) {
				console.error('No workspace storage available for conversations');
				return;
			}

			this._conversationsPath = path.join(storagePath, 'conversations');
			console.log('Initializing conversations at:', this._conversationsPath);

			// Create conversations directory if it doesn't exist
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(this._conversationsPath));
				console.log('Conversations directory exists');
			} catch {
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(this._conversationsPath));
				console.log('Created conversations directory');
			}

			// Load conversation index from workspace state
			this._conversationIndex = this._context.workspaceState.get('claude.conversationIndex', []);
			console.log('Loaded conversation index:', this._conversationIndex.length, 'conversations');

			// If no index exists, scan for existing conversation files
			if (this._conversationIndex.length === 0) {
				console.log('No conversation index found, scanning existing files');
				await this.scanExistingConversations();
			}
		} catch (error) {
			console.error('Error initializing conversations:', error);
		}
	}

	private async scanExistingConversations(): Promise<void> {
		try {
			if (!this._conversationsPath) { return; }

			const conversationDir = vscode.Uri.file(this._conversationsPath);
			const files = await vscode.workspace.fs.readDirectory(conversationDir);

			const conversationFiles = files
				.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
				.map(([name]) => name);

			// Load each conversation file and build the index
			for (const filename of conversationFiles) {
				try {
					const filePath = path.join(this._conversationsPath, filename);
					const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
					const conversationData: ConversationData = JSON.parse(new TextDecoder().decode(content));
					this.updateConversationIndex(filename, conversationData);
				} catch (error) {
					console.error(`Error loading conversation file ${filename}:`, error);
				}
			}

			// Sort by start time, newest first
			this._conversationIndex.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

			// Save the rebuilt index
			await this._context.workspaceState.update('claude.conversationIndex', this._conversationIndex);

		} catch (error) {
			console.error('Error scanning existing conversations:', error);
		}
	}

	public sendAndSaveMessage(message: { type: string, data: any }, postMessage: (msg: any) => void): void {
		// Initialize conversation if this is the first message
		if (this._currentConversation.length === 0) {
			this._conversationStartTime = new Date().toISOString();
		}

		// Send to UI using the helper method
		postMessage(message);

		// Save to conversation
		this._currentConversation.push({
			timestamp: new Date().toISOString(),
			messageType: message.type,
			data: message.data
		});

		// Persist conversation
		void this.saveCurrentConversation();
	}

	public async saveCurrentConversation(currentSessionId?: string, totalCost?: number, totalTokensInput?: number, totalTokensOutput?: number): Promise<void> {
		if (!this._conversationsPath || this._currentConversation.length === 0) { return; }
		if (!currentSessionId) { return; }

		try {
			// Create filename from first user message and timestamp
			const firstUserMessage = this._currentConversation.find(m => m.messageType === 'userInput');
			const firstMessage = firstUserMessage ? firstUserMessage.data : 'conversation';
			const startTime = this._conversationStartTime || new Date().toISOString();
			const sessionId = currentSessionId || 'unknown';

			// Clean and truncate first message for filename
			const cleanMessage = firstMessage
				.replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
				.replace(/\s+/g, '-') // Replace spaces with dashes
				.substring(0, 50) // Limit length
				.toLowerCase();

			const datePrefix = startTime.substring(0, 16).replace('T', '_').replace(/:/g, '-');
			const filename = `${datePrefix}_${cleanMessage}.json`;

			const conversationData: ConversationData = {
				sessionId: sessionId,
				startTime: this._conversationStartTime,
				endTime: new Date().toISOString(),
				messageCount: this._currentConversation.length,
				totalCost: totalCost || 0,
				totalTokens: {
					input: totalTokensInput || 0,
					output: totalTokensOutput || 0
				},
				messages: this._currentConversation,
				filename
			};

			const filePath = path.join(this._conversationsPath, filename);
			const content = new TextEncoder().encode(JSON.stringify(conversationData, null, 2));
			await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content);

			// Update conversation index
			this.updateConversationIndex(filename, conversationData);

			console.log(`Saved conversation: ${filename}`, this._conversationsPath);
		} catch (error: any) {
			console.error('Failed to save conversation:', error.message);
		}
	}

	private updateConversationIndex(filename: string, conversationData: ConversationData): void {
		// Extract first and last user messages
		const userMessages = conversationData.messages.filter((m: any) => m.messageType === 'userInput');
		const firstUserMessage = userMessages.length > 0 ? userMessages[0].data : 'No user message';
		const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].data : firstUserMessage;

		// Create or update index entry
		const indexEntry = {
			filename: filename,
			sessionId: conversationData.sessionId,
			startTime: conversationData.startTime || '',
			endTime: conversationData.endTime,
			messageCount: conversationData.messageCount,
			totalCost: conversationData.totalCost,
			firstUserMessage: firstUserMessage.substring(0, 100), // Truncate for storage
			lastUserMessage: lastUserMessage.substring(0, 100)
		};

		// Remove any existing entry for this session (in case of updates)
		this._conversationIndex = this._conversationIndex.filter(entry => entry.filename !== conversationData.filename);

		// Add new entry at the beginning (most recent first)
		this._conversationIndex.unshift(indexEntry);

		// Keep only last 50 conversations to avoid workspace state bloat
		if (this._conversationIndex.length > 50) {
			this._conversationIndex = this._conversationIndex.slice(0, 50);
		}

		// Save to workspace state
		this._context.workspaceState.update('claude.conversationIndex', this._conversationIndex);
	}

	public getLatestConversation(): ConversationIndexEntry | undefined {
		return this._conversationIndex.length > 0 ? this._conversationIndex[0] : undefined;
	}

	public async loadConversationHistory(filename: string, postMessage: (msg: any) => void): Promise<void> {
		console.log("loadConversationHistory");
		if (!this._conversationsPath) { return; }

		try {
			const filePath = path.join(this._conversationsPath, filename);
			console.log("filePath", filePath);

			let conversationData: ConversationData;
			try {
				const fileUri = vscode.Uri.file(filePath);
				const content = await vscode.workspace.fs.readFile(fileUri);
				conversationData = JSON.parse(new TextDecoder().decode(content));
			} catch {
				return;
			}

			// Load conversation into current state
			this._currentConversation = conversationData.messages || [];
			this._conversationStartTime = conversationData.startTime;

			// Clear UI messages first, then send all messages to recreate the conversation
			setTimeout(() => {
				// Clear existing messages when loading conversation history
				postMessage({
					type: 'sessionLoading'
				});

				// Small delay to ensure messages are cleared before loading new ones
				setTimeout(() => {
					for (const message of this._currentConversation) {
						postMessage({
							type: message.messageType,
							data: message.data
						});
					}

					// Send ready message after loading
					setTimeout(() => {
						postMessage({
							type: 'ready',
							data: 'Ready to chat with Claude Code! Type your message below.'
						});
					}, 100);
				}, 100);
			}, 50);
		} catch (error) {
			console.error('Error loading conversation history:', error);
		}
	}

	public sendConversationList(postMessage: (msg: any) => void): void {
		postMessage({
			type: 'conversationList',
			data: this._conversationIndex
		});
	}

	public async sendWorkspaceFiles(postMessage: (msg: any) => void, searchTerm?: string): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				postMessage({
					type: 'workspaceFiles',
					data: []
				});
				return;
			}

			// Get all files in workspace (excluding common ignored patterns)
			const files = await vscode.workspace.findFiles(
				searchTerm ? `**/*${searchTerm}*` : '**/*',
				'{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/.vscode/**,**/target/**,**/build/**}'
			);

			// Convert to relative paths and sort
			const fileList = files
				.map(file => vscode.workspace.asRelativePath(file))
				.sort()
				.slice(0, 100); // Limit to 100 files for performance

			postMessage({
				type: 'workspaceFiles',
				data: fileList
			});
		} catch (error) {
			console.error('Error getting workspace files:', error);
			postMessage({
				type: 'workspaceFiles',
				data: []
			});
		}
	}

	public newSession(): string {
		this._currentConversation = [];
		this._conversationStartTime = undefined;

		const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		this._context.workspaceState.update('claude.currentSessionId', sessionId);

		return sessionId;
	}

	public getCurrentConversation(): Array<{ timestamp: string, messageType: string, data: any }> {
		return this._currentConversation;
	}

	public getConversationIndex(): ConversationIndexEntry[] {
		return this._conversationIndex;
	}

	public getConversationsPath(): string | undefined {
		return this._conversationsPath;
	}
}
