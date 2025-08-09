import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { calculateCost, convertToWSLPath } from './extension-utils';
import { BackupManager } from './backup-manager';
import { ConversationManager } from './conversation-manager';
import { PermissionManager } from './permission-manager';
import { MCPConfigManager } from './mcp-config-manager';
import { SettingsManager } from './settings-manager';

export class ClaudeChatProvider {
	public _panel: vscode.WebviewPanel | undefined;
	private _webview: vscode.Webview | undefined;
	private _webviewView: vscode.WebviewView | undefined;
	private _disposables: vscode.Disposable[] = [];
	private _messageHandlerDisposable: vscode.Disposable | undefined;
	private _totalCost: number = 0;
	private _totalTokensInput: number = 0;
	private _totalTokensOutput: number = 0;
	private _requestCount: number = 0;
	private _currentSessionId: string | undefined;
	private _currentClaudeProcess: cp.ChildProcess | undefined;
	private _editorChangeListener: vscode.Disposable | undefined;
	private _selectionChangeListener: vscode.Disposable | undefined;

	private _isProcessing: boolean | undefined;
	private _draftMessage: string = '';

	// Manager instances
	private _backupManager: BackupManager;
	private _conversationManager: ConversationManager;
	private _permissionManager: PermissionManager;
	private _mcpConfigManager: MCPConfigManager;
	private _settingsManager: SettingsManager;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
	) {
		// Initialize manager instances
		this._backupManager = new BackupManager(this._context);
		this._conversationManager = new ConversationManager(this._context);
		this._permissionManager = new PermissionManager(this._context);
		this._mcpConfigManager = new MCPConfigManager(this._context, this._extensionUri);
		this._settingsManager = new SettingsManager(this._context);

		// Initialize all managers
		void this._backupManager.initializeBackupRepo();
		void this._conversationManager.initializeConversations();
		void this._mcpConfigManager.initializeMCPConfig();
		void this._permissionManager.initializePermissions(this._disposables);

		// Set up hot reload for development mode
		this._setupHotReload();

		// Resume session from latest conversation
		const latestConversation = this._conversationManager.getLatestConversation();
		this._currentSessionId = latestConversation?.sessionId;

		// Set up editor context listeners
		this._initializeEditorListeners();
	}

	public show(column: vscode.ViewColumn | vscode.Uri = vscode.ViewColumn.Two) {
		// Handle case where a URI is passed instead of ViewColumn
		const actualColumn = column instanceof vscode.Uri ? vscode.ViewColumn.Two : column;

		// Close sidebar if it's open
		this._closeSidebar();

		if (this._panel) {
			this._panel.reveal(actualColumn);
			return;
		}

		this._panel = vscode.window.createWebviewPanel(
			'claudeChat',
			'Claude Code Sidebar',
			actualColumn,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this._extensionUri]
			}
		);

		// Set icon for the webview tab using URI path
		const iconPath = vscode.Uri.joinPath(this._extensionUri, 'icon.png');
		this._panel.iconPath = iconPath;

		this._panel.webview.html = this._getHtmlForWebview();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._setupWebviewMessageHandler(this._panel.webview);

		// Resume session from latest conversation
		const latestConversation = this._conversationManager.getLatestConversation();
		this._currentSessionId = latestConversation?.sessionId;

		// Load latest conversation history if available
		if (latestConversation) {
			void this._conversationManager.loadConversationHistory(latestConversation.filename, this._postMessage.bind(this))
				.then(() => {
					// Send ready message after conversation loads
					this._sendReadyMessage();
				});
		} else {
			// Send ready message immediately if no conversation to load
			setTimeout(() => {
				this._sendReadyMessage();
			}, 100);
		}
	}

	public _postMessage(message: any) {
		if (this._panel && this._panel.webview) {
			this._panel.webview.postMessage(message);
		} else if (this._webview) {
			this._webview.postMessage(message);
		} else {
			// Silently ignore if no webview is available - this is normal during initialization
			return;
		}
	}

	private _sendReadyMessage() {
		this._postMessage({
			type: 'ready',
			data: this._isProcessing ? 'Claude is working...' : 'Ready to chat with Claude Code! Type your message below.'
		});

		// Send current model to webview
		this._postMessage({
			type: 'modelSelected',
			model: this._settingsManager.getSelectedModel()
		});

		// Send platform information to webview
		this._settingsManager.sendPlatformInfo(this._postMessage.bind(this));

		// Send current settings to webview
		this._settingsManager.sendCurrentSettings(this._postMessage.bind(this));

		// Send saved draft message if any
		if (this._draftMessage) {
			this._postMessage({
				type: 'restoreInputText',
				data: this._draftMessage
			});
		}
	}

	private _handleWebviewMessage(message: any) {
		switch (message.type) {
			case 'sendMessage':
				void this._sendMessageToClaude(message.data, message.planMode, message.thinkingMode);
				break;

			case 'newSession':
				this._newSession();
				break;

			case 'stopProcessing':
				this._stopClaudeProcess();
				break;

			case 'restore':
				void this._backupManager.restoreToCommit(message.commitSha, this._postMessage.bind(this));
				break;

			case 'loadConversation':
				void this._conversationManager.loadConversationHistory(message.filename, this._postMessage.bind(this));
				break;

			case 'requestConversationList':
				this._conversationManager.sendConversationList(this._postMessage.bind(this));
				break;

			case 'requestWorkspaceFiles':
				void this._conversationManager.sendWorkspaceFiles(this._postMessage.bind(this), message.searchTerm);
				break;

			case 'selectImageFile':
				void this._settingsManager.selectImageFile(this._postMessage.bind(this));
				break;

			case 'requestPermissions':
				void this._permissionManager.sendPermissions(this._postMessage.bind(this));
				break;

			case 'removePermission':
				void this._permissionManager.removePermission(message.toolName, message.command, this._postMessage.bind(this));
				break;

			case 'addPermission':
				void this._permissionManager.addPermission(message.toolName, message.command, this._postMessage.bind(this));
				break;

			case 'requestMCPServers':
				void this._mcpConfigManager.loadMCPServers(this._postMessage.bind(this));
				break;

			case 'saveMCPServer':
				void this._mcpConfigManager.saveMCPServer(message.name, message.config, this._postMessage.bind(this));
				break;

			case 'deleteMCPServer':
				void this._mcpConfigManager.deleteMCPServer(message.name, this._postMessage.bind(this));
				break;

			case 'requestCustomSnippets':
				void this._settingsManager.sendCustomSnippets(this._postMessage.bind(this));
				break;

			case 'saveCustomSnippet':
				void this._settingsManager.saveCustomSnippet(message.snippet, this._postMessage.bind(this));
				break;

			case 'deleteCustomSnippet':
				void this._settingsManager.deleteCustomSnippet(message.snippetId, this._postMessage.bind(this));
				break;

			case 'updateSettings':
				void this._settingsManager.updateSettings(message.settings, this._postMessage.bind(this));
				break;

			case 'enableYoloMode':
				void this._settingsManager.enableYoloMode(this._postMessage.bind(this));
				break;

			case 'getClipboardText':
				void this._settingsManager.getClipboardText(this._postMessage.bind(this));
				break;

			case 'setSelectedModel':
				this._settingsManager.setSelectedModel(message.model);
				break;

			case 'openModelTerminal':
				this._settingsManager.openModelTerminal(this._postMessage.bind(this));
				break;

			case 'executeSlashCommand':
				this._settingsManager.executeSlashCommand(message.command, this._postMessage.bind(this));
				break;

			case 'dismissWSLAlert':
				this._settingsManager.dismissWSLAlert();
				break;

			case 'openFileInEditor':
				void this._settingsManager.openFileInEditor(message.filePath);
				break;

			case 'createImageFile':
				void this._settingsManager.createImageFile(message.imageData, message.imageType);
				break;

			case 'saveInputText':
				this._draftMessage = message.text || '';
				break;

			case 'permissionResponse':
				// This is handled by the permission manager's file watcher
				break;
		}
	}

	private _setupWebviewMessageHandler(webview: vscode.Webview) {
		if (this._messageHandlerDisposable) {
			this._messageHandlerDisposable.dispose();
		}

		this._messageHandlerDisposable = webview.onDidReceiveMessage(
			message => this._handleWebviewMessage(message),
			undefined,
			this._disposables
		);
	}

	// Core Claude processing methods would continue here...
	// Due to length constraints, I'm showing the key structure
	// The remaining methods (_sendMessageToClaude, _processJsonStreamData, etc.)
	// would be implemented here with the same logic but using the managers

	public dispose() {
		if (this._panel) {
			this._panel.dispose();
			this._panel = undefined;
		}

		this._stopClaudeProcess();
		this._editorChangeListener?.dispose();
		this._selectionChangeListener?.dispose();
		this._messageHandlerDisposable?.dispose();
		this._permissionManager.dispose();

		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
	}

	// Placeholder methods that need to be implemented
	private _closeSidebar() {
		if (this._webviewView) {
			// Handle sidebar closing logic
		}
	}

	private _setupHotReload() {
		if (process.env.NODE_ENV === 'development') {
			// Hot reload logic for development
			console.log('Hot reload enabled');
		}
	}

	private _initializeEditorListeners() {
		// Set up editor change listeners
		this._editorChangeListener = vscode.window.onDidChangeActiveTextEditor(() => {
			this._sendEditorContext();
		});

		this._selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(() => {
			this._sendEditorContext();
		});
	}

	private _sendEditorContext() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			this._postMessage({
				type: 'editorContext',
				data: { hasActiveFile: false }
			});
			return;
		}

		const document = editor.document;
		const selection = editor.selection;
		const selectedText = document.getText(selection);
		const cursorPosition = {
			line: selection.active.line + 1,
			character: selection.active.character + 1
		};

		this._postMessage({
			type: 'editorContext',
			data: {
				hasActiveFile: true,
				fileName: document.fileName.split('/').pop() || document.fileName,
				filePath: document.fileName,
				language: document.languageId,
				selectedText: selectedText || null,
				cursorPosition: cursorPosition,
				totalLines: document.lineCount,
				isDirty: document.isDirty,
				isUntitled: document.isUntitled
			}
		});
	}

	private _getHtmlForWebview(): string {
		const webviewUri = this._panel?.webview || this._webview;
		if (!webviewUri) {
			throw new Error('Webview URI not available');
		}

		// Read RSBuild's generated HTML and adapt it for webview URIs
		const htmlPath = path.join(__dirname, '..', 'webview', 'index.html');
		if (!fs.existsSync(htmlPath)) {
			throw new Error(`Webview HTML not found at ${htmlPath}. Run "pnpm run compile" to build the extension.`);
		}

		let html = fs.readFileSync(htmlPath, 'utf8');

		// Determine if we're in development mode
		const isDev = process.env.VSCODE_DEBUG === 'true' || process.env.NODE_ENV === 'development';

		// Convert asset paths to webview URIs
		const webviewDir = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview');
		const scriptUri = webviewUri.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'static', 'js', 'index.js'));
		const cssUri = webviewUri.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'static', 'css', 'index.css'));

		// Replace RSBuild's asset paths with webview URIs
		// Handle all path variations: ./static/, /static/, static/
		html = html
			.replace(/src="(?:\.\/|\/)?static\/js\/index\.js"/g, `src="${scriptUri}"`)
			.replace(/href="(?:\.\/|\/)?static\/css\/index\.css"/g, `href="${cssUri}"`);

		// Add environment indicator for debugging
		if (isDev) {
			html = html.replace('<body>', `<body>\n<!-- Development Mode: ${process.env.VSCODE_DEBUG ? 'VS Code Debug' : 'Dev Environment'} -->`);
		}

		return html;
	}

	public showInWebview(webview: vscode.Webview, webviewView?: vscode.WebviewView) {
		this._webview = webview;
		this._webviewView = webviewView;

		webview.html = this._getHtmlForWebview();
		this._setupWebviewMessageHandler(webview);

		// Resume session from latest conversation
		const latestConversation = this._conversationManager.getLatestConversation();
		this._currentSessionId = latestConversation?.sessionId;

		// Load latest conversation history if available
		if (latestConversation) {
			void this._conversationManager.loadConversationHistory(latestConversation.filename, this._postMessage.bind(this))
				.then(() => {
					// Send ready message after conversation loads
					this._sendReadyMessage();
				});
		} else {
			// Send ready message immediately if no conversation to load
			setTimeout(() => {
				this._sendReadyMessage();
			}, 100);
		}
	}

	public loadConversation(filename: string) {
		void this._conversationManager.loadConversationHistory(filename, this._postMessage.bind(this));
	}

	public newSessionOnConfigChange() {
		// Reset session when configuration changes
		this._newSession();
	}

	private _newSession() {
		const sessionId = this._conversationManager.newSession();
		this._currentSessionId = sessionId;

		// Reset session state
		this._totalCost = 0;
		this._totalTokensInput = 0;
		this._totalTokensOutput = 0;
		this._requestCount = 0;

		// Clear UI
		this._postMessage({ type: 'clearMessages' });
		this._sendReadyMessage();
	}

	private _stopClaudeProcess(): void {
		this._isProcessing = false;

		// Update UI state
		this._postMessage({
			type: 'setProcessing',
			data: { isProcessing: false }
		});

		if (this._currentClaudeProcess) {
			// Try graceful termination first
			this._currentClaudeProcess.kill('SIGTERM');

			// Force kill after 2 seconds if still running
			setTimeout(() => {
				if (this._currentClaudeProcess && !this._currentClaudeProcess.killed) {
					this._currentClaudeProcess.kill('SIGKILL');
				}
			}, 2000);

			// Clear process reference
			this._currentClaudeProcess = undefined;

			this._postMessage({
				type: 'clearLoading'
			});

			// Send stop confirmation message
			this._conversationManager.sendAndSaveMessage({
				type: 'error',
				data: '⏹️ Claude code was stopped.'
			}, this._postMessage.bind(this));
		}
	}

	private async _sendMessageToClaude(message: string, planMode?: boolean, thinkingMode?: boolean) {
		// Check if Claude is already processing
		if (this._currentClaudeProcess && this._currentClaudeProcess.stdin && !this._currentClaudeProcess.stdin.destroyed) {
			this._postMessage({
				type: 'userInput',
				data: message
			});
			return;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

		// Prepend mode instructions if enabled
		let actualMessage = message;
		if (planMode) {
			actualMessage = 'PLAN FIRST FOR THIS MESSAGE ONLY: Plan first before making any changes. Show me in detail what you will change and wait for my explicit approval in a separate message before proceeding. Do not implement anything until I confirm. This planning requirement applies ONLY to this current message. \n\n' + message;
		}
		if (thinkingMode) {
			const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
			const thinkingIntensity = config.get<string>('thinking.intensity', 'think');
			let thinkingPrompt = 'THINK';
			switch (thinkingIntensity) {
				case 'think-hard': thinkingPrompt = 'THINK HARD'; break;
				case 'think-harder': thinkingPrompt = 'THINK HARDER'; break;
				case 'ultrathink': thinkingPrompt = 'ULTRATHINK'; break;
			}
			actualMessage = thinkingPrompt + ' THROUGH THIS STEP BY STEP: \n' + actualMessage;
		}

		this._isProcessing = true;
		this._draftMessage = '';

		// Show user input and save to conversation
		this._conversationManager.sendAndSaveMessage({
			type: 'userInput',
			data: message
		}, this._postMessage.bind(this));

		// Set processing state
		this._postMessage({
			type: 'setProcessing',
			data: { isProcessing: true }
		});

		// Create backup commit
		try {
			await this._backupManager.createBackupCommit(message, this._postMessage.bind(this));
		} catch (e) {
			console.error('Error creating backup commit:', e);
		}

		// Show loading
		this._postMessage({
			type: 'loading',
			data: 'Claude is working...'
		});

		// Build command arguments
		const args = ['-p', '--output-format', 'stream-json', '--verbose'];

		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
		const yoloMode = config.get<boolean>('permissions.yoloMode', false);

		if (yoloMode) {
			args.push('--dangerously-skip-permissions');
		} else {
			const mcpConfigPath = this._mcpConfigManager.getMCPConfigPath();
			if (mcpConfigPath) {
				const convertedPath = convertToWSLPath(mcpConfigPath);
				args.push('--mcp-config', `"${convertedPath}"`);
				args.push('--allowedTools', 'mcp__claude-code-vsc-panel-permissions__approval_prompt');
				args.push('--permission-prompt-tool', 'mcp__claude-code-vsc-panel-permissions__approval_prompt');
			}
		}

		// Add model selection
		const selectedModel = this._settingsManager.getSelectedModel();
		if (selectedModel && selectedModel !== 'default') {
			args.push('--model', selectedModel);
		}

		// Add session resume
		if (this._currentSessionId) {
			args.push('--resume', this._currentSessionId);
		}

		// Spawn Claude process
		const wslEnabled = config.get<boolean>('wsl.enabled', false);
		let claudeProcess: cp.ChildProcess;

		if (wslEnabled) {
			const wslDistro = config.get<string>('wsl.distro', 'Ubuntu');
			const nodePath = config.get<string>('wsl.nodePath', '/usr/bin/node');
			const claudePath = config.get<string>('wsl.claudePath', '/usr/local/bin/claude');
			const wslCommand = `"${nodePath}" --no-warnings --enable-source-maps "${claudePath}" ${args.join(' ')}`;

			claudeProcess = cp.spawn('wsl', ['-d', wslDistro, 'bash', '-ic', wslCommand], {
				cwd, stdio: ['pipe', 'pipe', 'pipe'],
				env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
			});
		} else {
			claudeProcess = cp.spawn('claude', args, {
				shell: true, cwd, stdio: ['pipe', 'pipe', 'pipe'],
				env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
			});
		}

		this._currentClaudeProcess = claudeProcess;

		// Handle process events
		claudeProcess.on('error', (error) => {
			console.error('Failed to start Claude process:', error);
			console.error('Command args were:', args);
			console.error('Working directory:', cwd);
			console.error('WSL enabled:', wslEnabled);
			this._conversationManager.sendAndSaveMessage({
				type: 'error',
				data: `Failed to start Claude: ${error.message}. Make sure Claude CLI is installed and accessible.`
			}, this._postMessage.bind(this));
			this._isProcessing = false;
			this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
			this._postMessage({ type: 'clearLoading' });
		});

		let stdoutBuffer = '';
		let stderrBuffer = '';

		claudeProcess.stdout?.on('data', (data) => {
			const chunk = data.toString();
			console.log('Claude stdout chunk:', chunk);
			stdoutBuffer += chunk;
			this._processJsonStreamData(chunk);
		});

		claudeProcess.stderr?.on('data', (data) => {
			const chunk = data.toString();
			console.error('Claude stderr chunk:', chunk);
			stderrBuffer += chunk;
		});

		claudeProcess.on('exit', (code, signal) => {
			console.log('Claude process exited with code:', code, 'signal:', signal);
			console.log('Final stdout buffer:', stdoutBuffer);
			console.log('Final stderr buffer:', stderrBuffer);
			console.log('Command that was executed:', wslEnabled ?
				`wsl -d ${config.get<string>('wsl.distro', 'Ubuntu')} bash -ic "${config.get<string>('wsl.nodePath', '/usr/bin/node')} --no-warnings --enable-source-maps '${config.get<string>('wsl.claudePath', '/usr/local/bin/claude')}' ${args.join(' ')}"` :
				`claude ${args.join(' ')}`);

			this._isProcessing = false;
			this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
			this._postMessage({ type: 'clearLoading' });

			if (code !== 0 && signal !== 'SIGTERM') {
				const errorMessage = stderrBuffer.trim() || `Claude process exited with code ${code}`;
				console.error('Claude process failed with error:', errorMessage);
				this._conversationManager.sendAndSaveMessage({
					type: 'error',
					data: `Claude CLI Error: ${errorMessage}`
				}, this._postMessage.bind(this));
			}
		});

		// Send message to Claude
		if (claudeProcess.stdin) {
			claudeProcess.stdin.write(actualMessage + '\n');
			claudeProcess.stdin.end();
		}
	}

	private _processJsonStreamData(data: string) {
		const lines = data.split('\n');
		for (const line of lines) {
			if (line.trim() === '') {continue;}
			try {
				const jsonData = JSON.parse(line);
				switch (jsonData.type) {
					case 'system':
						if (jsonData.subtype === 'init') {
							// System initialization message - capture session ID
							console.log('System initialized');
							this._currentSessionId = jsonData.session_id;

							// Show session info in UI
							this._conversationManager.sendAndSaveMessage({
								type: 'sessionInfo',
								data: {
									sessionId: jsonData.session_id,
									tools: jsonData.tools || [],
									mcpServers: jsonData.mcp_servers || []
								}
							}, this._postMessage.bind(this));
						}
						break;
					case 'text':
						this._postMessage({ type: 'assistant', data: jsonData.text || '' });
						break;
					case 'usage':
						if (jsonData.usage) {
							const usage = jsonData.usage;
							const inputTokens = usage.input_tokens || 0;
							const outputTokens = usage.output_tokens || 0;
							const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
							const cacheReadTokens = usage.cache_read_input_tokens || 0;

							this._totalTokensInput += inputTokens;
							this._totalTokensOutput += outputTokens;

							const requestCost = calculateCost(inputTokens, outputTokens, this._settingsManager.getSelectedModel(), cacheCreationTokens, cacheReadTokens);
							this._totalCost += requestCost;

							this._conversationManager.sendAndSaveMessage({
								type: 'tokenUpdate',
								data: {
									inputTokens, outputTokens,
									totalTokensInput: this._totalTokensInput,
									totalTokensOutput: this._totalTokensOutput,
									requestCost, totalCost: this._totalCost,
									requestCount: ++this._requestCount
								}
							}, this._postMessage.bind(this));
						}
						break;
				}
			} catch {
				if (line.trim()) {
					this._postMessage({ type: 'assistant', data: line });
				}
			}
		}
	}
}
