import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConversationData } from './extension-utils';

export class ConversationManager {
	private _conversationsPath: string | undefined;
	private _currentConversation: Array<{ timestamp: string, messageType: string, data: any }> = [];
	private _conversationStartTime: string | undefined;
	private _conversationIndex: Array<{
		filename: string;
		title: string;
		timestamp: string;
		lastModified: string;
		messageCount: number;
		summary: string;
	}> = [];

	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public async initializeConversations(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		// Create conversations directory in workspace storage
		const storageUri = this._context.storageUri;
		if (storageUri) {
			this._conversationsPath = path.join(storageUri.fsPath, 'conversations');
			if (!fs.existsSync(this._conversationsPath)) {
				fs.mkdirSync(this._conversationsPath, { recursive: true });
			}
		}

		// Load conversation index
		await this.loadConversationIndex();
	}

	public sendAndSaveMessage(message: { type: string, data: any }): void {
		// Send message to webview
		this._postMessage(message);

		// Save to current conversation
		const timestamp = new Date().toISOString();
		this._currentConversation.push({
			timestamp,
			messageType: message.type,
			data: message.data
		});

		// Auto-save conversation periodically
		if (this._currentConversation.length % 10 === 0) {
			this.saveCurrentConversation();
		}
	}

	public async saveCurrentConversation(): Promise<void> {
		if (!this._conversationsPath || this._currentConversation.length === 0) {
			return;
		}

		try {
			// Generate filename if this is a new conversation
			let filename: string;
			if (!this._conversationStartTime) {
				this._conversationStartTime = new Date().toISOString();
				filename = `conversation_${this._conversationStartTime.replace(/[:.]/g, '-')}.json`;
			} else {
				filename = `conversation_${this._conversationStartTime.replace(/[:.]/g, '-')}.json`;
			}

			const filePath = path.join(this._conversationsPath, filename);

			// Extract title from first user message or use default
			let title = 'New Conversation';
			const firstUserMessage = this._currentConversation.find(msg => msg.messageType === 'user');
			if (firstUserMessage && typeof firstUserMessage.data === 'string') {
				title = firstUserMessage.data.substring(0, 50).trim();
				if (title.length === 50) {title += '...';}
			}

			const conversationData: Partial<ConversationData> & { messages: any[], messageCount: number, filename?: string } = {
				title,
				timestamp: this._conversationStartTime,
				lastModified: new Date().toISOString(),
				messages: this._currentConversation,
				messageCount: this._currentConversation.length,
				summary: this.generateConversationSummary(),
				sessionId: 'temp-session',
				startTime: this._conversationStartTime,
				endTime: new Date().toISOString(),
				totalCost: 0,
				totalTokens: { input: 0, output: 0 },
				filename: filename
			};

			await fs.promises.writeFile(filePath, JSON.stringify(conversationData, null, 2));

			// Update index
			this.updateConversationIndex(filename, conversationData as ConversationData);

		} catch (error) {
			console.error('Failed to save conversation:', error);
		}
	}

	public async loadConversation(filename: string): Promise<void> {
		if (!this._conversationsPath) {
			this._postMessage({ type: 'error', data: 'Conversations not initialized' });
			return;
		}

		try {
			const filePath = path.join(this._conversationsPath, filename);
			const data = await fs.promises.readFile(filePath, 'utf8');
			const conversationData: ConversationData = JSON.parse(data);

			// Clear current conversation
			this.newSession();

			// Restore conversation
			this._currentConversation = conversationData.messages || [];
			this._conversationStartTime = conversationData.timestamp;

			// Send all messages to webview
			for (const message of this._currentConversation) {
				this._postMessage({
					type: message.messageType,
					data: message.data
				});
			}

			this._postMessage({
				type: 'conversationLoaded',
				data: { filename, title: conversationData.title }
			});

		} catch (error) {
			console.error('Failed to load conversation:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to load conversation: ${error}`
			});
		}
	}

	public sendConversationList(): void {
		this._postMessage({ type: 'conversationList', data: this._conversationIndex });
	}

	public newSession(): void {
		// Save current conversation if it exists
		if (this._currentConversation.length > 0) {
			this.saveCurrentConversation();
		}

		// Clear current conversation
		this._currentConversation = [];
		this._conversationStartTime = undefined;

		// Send clear message to webview
		this._postMessage({ type: 'clear' });
	}

	private updateConversationIndex(filename: string, conversationData: Partial<ConversationData> & { messageCount: number }): void {
		const existingIndex = this._conversationIndex.findIndex(item => item.filename === filename);

		const indexItem = {
			filename,
			title: conversationData.title || 'New Conversation',
			timestamp: conversationData.timestamp || new Date().toISOString(),
			lastModified: conversationData.lastModified || new Date().toISOString(),
			messageCount: conversationData.messageCount,
			summary: conversationData.summary || 'No summary'
		};

		if (existingIndex >= 0) {
			this._conversationIndex[existingIndex] = indexItem;
		} else {
			this._conversationIndex.unshift(indexItem);
		}

		// Keep only latest 50 conversations in index
		this._conversationIndex = this._conversationIndex.slice(0, 50);

		// Save index
		this.saveConversationIndex();
	}

	private async loadConversationIndex(): Promise<void> {
		if (!this._conversationsPath) {return;}

		try {
			const indexPath = path.join(this._conversationsPath, 'index.json');
			if (fs.existsSync(indexPath)) {
				const data = await fs.promises.readFile(indexPath, 'utf8');
				this._conversationIndex = JSON.parse(data) || [];
			}
		} catch (error) {
			console.error('Failed to load conversation index:', error);
			this._conversationIndex = [];
		}
	}

	private async saveConversationIndex(): Promise<void> {
		if (!this._conversationsPath) {return;}

		try {
			const indexPath = path.join(this._conversationsPath, 'index.json');
			await fs.promises.writeFile(indexPath, JSON.stringify(this._conversationIndex, null, 2));
		} catch (error) {
			console.error('Failed to save conversation index:', error);
		}
	}

	private generateConversationSummary(): string {
		const userMessages = this._currentConversation.filter(msg => msg.messageType === 'user');
		if (userMessages.length === 0) {return 'No messages';}

		if (userMessages.length === 1) {
			const message = userMessages[0].data;
			return typeof message === 'string' ? message.substring(0, 100) : 'Single message';
		}

		return `${userMessages.length} messages about various topics`;
	}

	public getLatestConversation(): any | undefined {
		return this._conversationIndex.length > 0 ? this._conversationIndex[0] : undefined;
	}

	public async loadConversationHistory(filename: string): Promise<void> {
		await this.loadConversation(filename);
	}
}
