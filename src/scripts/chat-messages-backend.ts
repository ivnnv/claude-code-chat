import * as path from 'path';
import * as vscode from 'vscode';
import * as util from 'util';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import { ClaudeChatProvider, ConversationData } from '../claude-provider-backend';

const exec = util.promisify(cp.exec);

export async function getRepositoryIdentifier(): Promise<string> {
	try {
		// Try to get git remote origin URL using VS Code's git API
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (gitExtension) {
			const gitApi = gitExtension.exports.getAPI(1);
			const repositories = gitApi.repositories;

			if (repositories.length > 0) {
				const repo = repositories[0];
				const remotes = await repo.getRemotes();
				const origin = remotes.find((remote: any) => remote.name === 'origin');

				if (origin && origin.fetchUrl) {
					// Clean URL: "https://github.com/user/repo.git" → "github.com/user/repo"
					const cleanUrl = origin.fetchUrl
						.replace(/^https?:\/\//, '')
						.replace(/^git@([^:]+):/, '$1/')
						.replace(/\.git$/, '');

					// Generate hash from clean URL
					return crypto.createHash('md5').update(cleanUrl).digest('hex').substring(0, 8);
				}
			}
		}
	} catch (error) {
		console.warn('Failed to get git remote origin:', error);
	}

	// Fallback to workspace folder path hash
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		const folderPath = workspaceFolder.uri.fsPath;
		return crypto.createHash('md5').update(folderPath).digest('hex').substring(0, 8);
	}

	// Final fallback
	return 'default';
}


export async function initializeBackupRepo(provider: ClaudeChatProvider): Promise<void> {
	try {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) { return; }

		const storagePath = provider._context.storageUri?.fsPath;
		if (!storagePath) {
			console.error('No workspace storage available');
			return;
		}
		provider._backupRepoPath = path.join(storagePath, 'backups', '.git');

		// Create backup git directory if it doesn't exist
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(provider._backupRepoPath));
		} catch {
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(provider._backupRepoPath));

			const workspacePath = workspaceFolder.uri.fsPath;

			// Initialize git repo with workspace as work-tree
			await exec(`git --git-dir="${provider._backupRepoPath}" --work-tree="${workspacePath}" init`);
			await exec(`git --git-dir="${provider._backupRepoPath}" config user.name "Claude Code Sidebar"`);
			await exec(`git --git-dir="${provider._backupRepoPath}" config user.email "claude@anthropic.com"`);

		}
	} catch (error: any) {
		console.error('Failed to initialize backup repository:', error.message);
	}
}

export async function createBackupCommit(provider: ClaudeChatProvider, userMessage: string): Promise<void> {
	try {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder || !provider._backupRepoPath) { return; }

		const workspacePath = workspaceFolder.uri.fsPath;
		const now = new Date();
		const timestamp = now.toISOString().replace(/[:.]/g, '-');
		const displayTimestamp = now.toISOString();
		const commitMessage = `Before: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;

		// Add all files using git-dir and work-tree (excludes .git automatically)
		await exec(`git --git-dir="${provider._backupRepoPath}" --work-tree="${workspacePath}" add -A`);

		// Check if this is the first commit (no HEAD exists yet)
		let isFirstCommit = false;
		try {
			await exec(`git --git-dir="${provider._backupRepoPath}" rev-parse HEAD`);
		} catch {
			isFirstCommit = true;
		}

		// Check if there are changes to commit
		const { stdout: status } = await exec(`git --git-dir="${provider._backupRepoPath}" --work-tree="${workspacePath}" status --porcelain`);

		// Always create a checkpoint, even if no files changed
		let actualMessage;
		if (isFirstCommit) {
			actualMessage = `Initial backup: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;
		} else if (status.trim()) {
			actualMessage = commitMessage;
		} else {
			actualMessage = `Checkpoint (no changes): ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;
		}

		// Create commit with --allow-empty to ensure checkpoint is always created
		await exec(`git --git-dir="${provider._backupRepoPath}" --work-tree="${workspacePath}" commit --allow-empty -m "${actualMessage}"`);
		const { stdout: sha } = await exec(`git --git-dir="${provider._backupRepoPath}" rev-parse HEAD`);

		// Store commit info
		const commitInfo = {
			id: `commit-${timestamp}`,
			sha: sha.trim(),
			message: actualMessage,
			timestamp: displayTimestamp
		};

		provider._commits.push(commitInfo);

		// Show restore option in UI and save to conversation
		provider._sendAndSaveMessage({
			type: 'showRestoreOption',
			data: commitInfo
		});

	} catch (error: any) {
		console.error('Failed to create backup commit:', error.message);
	}
}

export async function restoreToCommit(provider: ClaudeChatProvider, commitSha: string): Promise<void> {
	try {
		const commit = provider._commits.find(c => c.sha === commitSha);
		if (!commit) {
			provider._postMessage({
				type: 'restoreError',
				data: 'Commit not found'
			});
			return;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder || !provider._backupRepoPath) {
			vscode.window.showErrorMessage('No workspace folder or backup repository available.');
			return;
		}

		const workspacePath = workspaceFolder.uri.fsPath;

		provider._postMessage({
			type: 'restoreProgress',
			data: 'Restoring files from backup...'
		});

		// Restore files directly to workspace using git checkout
		await exec(`git --git-dir="${provider._backupRepoPath}" --work-tree="${workspacePath}" checkout ${commitSha} -- .`);

		vscode.window.showInformationMessage(`Restored to commit: ${commit.message}`);

		provider._sendAndSaveMessage({
			type: 'restoreSuccess',
			data: {
				message: `Successfully restored to: ${commit.message}`,
				commitSha: commitSha
			}
		});

	} catch (error: any) {
		console.error('Failed to restore commit:', error.message);
		vscode.window.showErrorMessage(`Failed to restore commit: ${error.message}`);
		provider._postMessage({
			type: 'restoreError',
			data: `Failed to restore: ${error.message}`
		});
	}
}

export async function initializeConversations(provider: ClaudeChatProvider): Promise<void> {
	try {
		// Use global storage for cross-workspace persistence
		const globalStoragePath = provider._context.globalStorageUri?.fsPath;
		if (!globalStoragePath) {
			console.error('No global storage available');
			return;
		}

		// Get repository identifier for this workspace
		const repoId = await getRepositoryIdentifier();
		console.log(`Repository identifier: ${repoId}`);

		// Create repo-specific conversation directory
		provider._conversationsPath = path.join(globalStoragePath, 'conversations', repoId);

		// Create conversations directory if it doesn't exist
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(provider._conversationsPath));
		} catch {
			// Create parent directories first
			const conversationsDir = path.join(globalStoragePath, 'conversations');
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(conversationsDir));
			} catch {
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(conversationsDir));
			}
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(provider._conversationsPath));
		}


		// Load conversation index from global state using repo-specific key
		const repoConversationKey = `claude.conversations.${repoId}`;
		provider._conversationIndex = provider._context.globalState.get(repoConversationKey, []);

		console.log(`Loaded ${provider._conversationIndex.length} conversations for repo ${repoId}`);
	} catch (error: any) {
		console.error('Failed to initialize conversations directory:', error.message);
	}
}

export async function saveCurrentConversation(provider: ClaudeChatProvider): Promise<void> {
	if (!provider._conversationsPath || provider._currentConversation.length === 0) { return; }
	if (!provider._currentSessionId) { return; }

	try {
		// Create filename from first user message and timestamp
		const firstUserMessage = provider._currentConversation.find(m => m.messageType === 'userInput');
		const firstMessage = firstUserMessage ? firstUserMessage.data : 'conversation';
		const startTime = provider._conversationStartTime || new Date().toISOString();
		const sessionId = provider._currentSessionId || 'unknown';

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
			startTime: provider._conversationStartTime,
			endTime: new Date().toISOString(),
			messageCount: provider._currentConversation.length,
			totalCost: provider._totalCost,
			totalTokens: {
				input: provider._totalTokensInput,
				output: provider._totalTokensOutput
			},
			messages: provider._currentConversation,
			filename
		};

		const filePath = path.join(provider._conversationsPath, filename);
		const content = new TextEncoder().encode(JSON.stringify(conversationData, null, 2));
		await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content);

		// Update conversation index
		updateConversationIndex(provider, filename, conversationData);

	} catch (error: any) {
		console.error('Failed to save conversation:', error.message);
	}
}

export async function loadConversation(provider: ClaudeChatProvider, filename: string): Promise<void> {
	// Load the conversation history
	await loadConversationHistory(provider, filename);
}

export function sendConversationList(provider: ClaudeChatProvider): void {
	provider._postMessage({
		type: 'conversationList',
		data: provider._conversationIndex
	});
}

export function updateConversationIndex(provider: ClaudeChatProvider, filename: string, conversationData: ConversationData): void {
	// Extract first and last user messages
	const userMessages = conversationData.messages.filter((m: any) => m.messageType === 'userInput');
	const firstUserMessage = userMessages.length > 0 ? userMessages[0].data : 'No user message';
	const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].data : firstUserMessage;

	// Create or update index entry with cost estimation if needed
	let displayCost = conversationData.totalCost || 0;
	if (displayCost === 0 && conversationData.totalTokens && (conversationData.totalTokens.input > 0 || conversationData.totalTokens.output > 0)) {
		// Estimate cost for historical conversations
		displayCost = provider._calculateCost(conversationData.totalTokens.input, conversationData.totalTokens.output, 0, 0);
	}

	const indexEntry = {
		filename: filename,
		sessionId: conversationData.sessionId,
		startTime: conversationData.startTime || '',
		endTime: conversationData.endTime,
		messageCount: conversationData.messageCount,
		totalCost: displayCost,
		firstUserMessage: firstUserMessage.substring(0, 100), // Truncate for storage
		lastUserMessage: lastUserMessage.substring(0, 100)
	};

	// Remove any existing entry for this session (in case of updates)
	provider._conversationIndex = provider._conversationIndex.filter(entry => entry.filename !== conversationData.filename);

	// Add new entry at the beginning (most recent first)
	provider._conversationIndex.unshift(indexEntry);

	// Keep only last 50 conversations to avoid workspace state bloat
	if (provider._conversationIndex.length > 50) {
		provider._conversationIndex = provider._conversationIndex.slice(0, 50);
	}

	// Save to global state with repo-specific key
	getRepositoryIdentifier().then(repoId => {
		const repoConversationKey = `claude.conversations.${repoId}`;
		provider._context.globalState.update(repoConversationKey, provider._conversationIndex);
	}).catch(error => {
		console.error('Failed to save conversation index:', error);
	});
}

export function getLatestConversation(provider: ClaudeChatProvider): any | undefined {
	return provider._conversationIndex.length > 0 ? provider._conversationIndex[0] : undefined;
}

export async function loadConversationHistory(provider: ClaudeChatProvider, filename: string): Promise<void> {
	if (!provider._conversationsPath) { return; }

	try {
		const filePath = path.join(provider._conversationsPath, filename);

		let conversationData: ConversationData;
		try {
			const fileUri = vscode.Uri.file(filePath);
			const content = await vscode.workspace.fs.readFile(fileUri);
			conversationData = JSON.parse(new TextDecoder().decode(content));
		} catch {
			return;
		}

		// Load conversation into current state
		provider._currentConversation = conversationData.messages || [];
		provider._conversationStartTime = conversationData.startTime;
		provider._totalCost = conversationData.totalCost || 0;
		provider._totalTokensInput = conversationData.totalTokens?.input || 0;
		provider._totalTokensOutput = conversationData.totalTokens?.output || 0;

		// If no cost but we have tokens, estimate the cost for historical conversations
		if (provider._totalCost === 0 && (provider._totalTokensInput > 0 || provider._totalTokensOutput > 0)) {
			const estimatedCost = provider._calculateCost(provider._totalTokensInput, provider._totalTokensOutput, 0, 0);
			provider._totalCost = estimatedCost;
		}

		// Clear UI messages first, then send all messages to recreate the conversation
		setTimeout(() => {
			// Clear existing messages when loading conversation history
			provider._postMessage({
				type: 'sessionLoading'
			});

			let requestStartTime: number;

			// Small delay to ensure messages are cleared before loading new ones
			setTimeout(() => {
				for (const message of provider._currentConversation) {
					provider._postMessage({
						type: message.messageType,
						data: message.data
					});
					if (message.messageType === 'userInput') {
						try {
							requestStartTime = new Date(message.timestamp).getTime();
						} catch (e) {
							console.error('Error parsing user input timestamp:', e);
						}
					}
				}

				// Send updated totals
				provider._postMessage({
					type: 'updateTotals',
					data: {
						totalCost: provider._totalCost,
						totalTokensInput: provider._totalTokensInput,
						totalTokensOutput: provider._totalTokensOutput,
						requestCount: provider._requestCount
					}
				});

				// Restore processing state if the conversation was saved while processing
				if (provider._isProcessing) {
					provider._postMessage({
						type: 'setProcessing',
						data: { isProcessing: provider._isProcessing, requestStartTime }
					});
				}
				// Send ready message after conversation is loaded
				provider._sendReadyMessage();
			}, 50);
		}, 100); // Small delay to ensure webview is ready

	} catch (error: any) {
		console.error('Failed to load conversation history:', error.message);
	}
}

export function sendAndSaveMessage(provider: ClaudeChatProvider, message: { type: string, data: any }): void {

	// Initialize conversation if this is the first message
	if (provider._currentConversation.length === 0) {
		provider._conversationStartTime = new Date().toISOString();
	}

	// Send to UI using the helper method
	provider._postMessage(message);

	// Save to conversation
	provider._currentConversation.push({
		timestamp: new Date().toISOString(),
		messageType: message.type,
		data: message.data
	});

	// Persist conversation
	void saveCurrentConversation(provider);
}

export function newSession(provider: ClaudeChatProvider): void {

	provider._isProcessing = false;

	// Update UI state
	provider._postMessage({
		type: 'setProcessing',
		data: { isProcessing: false }
	});

	// Try graceful termination first
	if (provider._currentClaudeProcess) {
		const processToKill = provider._currentClaudeProcess;
		provider._currentClaudeProcess = undefined;
		processToKill.kill('SIGTERM');
	}

	// Clear current session
	provider._currentSessionId = undefined;

	// Clear commits and conversation
	provider._commits = [];
	provider._currentConversation = [];
	provider._conversationStartTime = undefined;

	// Reset counters
	provider._totalCost = 0;
	provider._totalTokensInput = 0;
	provider._totalTokensOutput = 0;
	provider._requestCount = 0;

	// Notify webview to clear all messages and reset session
	provider._postMessage({
		type: 'sessionCleared'
	});
}
