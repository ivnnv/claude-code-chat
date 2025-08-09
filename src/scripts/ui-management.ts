// UI Management - Consolidated UI components, messages, webview management
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import '../types/global';
import { formatFilePath, formatEditToolDiff, formatMultiEditToolDiff, formatWriteToolDiff, formatToolInputUI, escapeHtml } from './formatters';

// =====================================
// CHAT MESSAGES FUNCTIONALITY
// =====================================

// Module references that will be set at runtime
let uiCoreRef: any;
let _settingsModalsRef: any;

// VS Code API will be provided by ui-scripts.ts
let vsCodeApi: any;

// Note: These functions will be available at runtime through the main ui-scripts module
declare function isPermissionError(content: string): boolean;
declare function _enableYoloMode(): void;

// Global variables needed for these functions
let messageInput: HTMLTextAreaElement;
let _planModeEnabled = false;
let _thinkingModeEnabled = false;
let currentEditorContext: any = null;
let messageCounter = 0;

export function setVsCodeApi(api: any): void {
	vsCodeApi = api;
}

export function setModuleReferences(uiCore: any, settingsModals: any): void {
	uiCoreRef = uiCore;
	_settingsModalsRef = settingsModals;
}

export function setMessageInput(input: HTMLTextAreaElement): void {
	messageInput = input;
}

export function setCurrentEditorContext(context: any): void {
	currentEditorContext = context;
}

export function shouldAutoScroll(messagesDiv: HTMLElement): boolean {
	const threshold = 100; // pixels from bottom
	const scrollTop = messagesDiv.scrollTop;
	const scrollHeight = messagesDiv.scrollHeight;
	const clientHeight = messagesDiv.clientHeight;

	return (scrollTop + clientHeight >= scrollHeight - threshold);
}

export function scrollToBottomIfNeeded(messagesDiv: HTMLElement, shouldScroll: boolean | null = null): void {
	// If shouldScroll is not provided, check current scroll position
	if (shouldScroll === null) {
		shouldScroll = shouldAutoScroll(messagesDiv);
	}

	if (shouldScroll) {
		messagesDiv.scrollTop = messagesDiv.scrollHeight;
	}
}

export function addMessage(content: string, type = 'claude'): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {
		console.error('chatMessages div not found!');
		return;
	}

	const shouldScroll = shouldAutoScroll(messagesDiv);

	// Generate unique ID for this message
	messageCounter++;
	const messageId = `msg-${type}-${messageCounter}`;

	// Handle new userMessage structure
	if (type === 'user') {
		const messageDiv = document.createElement('div');
		messageDiv.className = 'userMessage';
		messageDiv.id = messageId;

		// Create header (for reference file info if available)
		const headerDiv = document.createElement('div');
		headerDiv.className = 'userMessage-header';

		// Extract file reference and user text from content (works with existing backend)
		let fileReference = '';
		let userText = content;

		// Handle both HTML <br><br> and plain \n\n formats
		const separator = content.includes('<br><br>') ? '<br><br>' : '\n\n';
		if (content.includes(separator)) {
			const parts = content.split(separator);
			if (parts.length > 1 && parts[0].startsWith('in ')) {
				fileReference = parts[0].replace(/^in\s+/, ''); // Remove "in " prefix
				userText = parts.slice(1).join(separator);
			}
		}

		// Set header text
		if (fileReference) {
			headerDiv.textContent = fileReference;
		}
		// Keep consistent visual structure even without reference
		messageDiv.appendChild(headerDiv);

		// Create content with clean user text (extracted above)
		const contentDiv = document.createElement('div');
		contentDiv.className = 'userMessage-content';
		contentDiv.innerHTML = `<span>${userText}</span>`;

		messageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle system messages with new structure
	if (type === 'system') {
		const messageDiv = document.createElement('div');
		messageDiv.className = 'systemMessage';
		messageDiv.id = messageId;

		// Create content
		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';
		contentDiv.innerHTML = content;
		messageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle Claude messages with special styling
	if (type === 'claude') {
		const messageDiv = document.createElement('div');

		// Detect structured file/path content for special styling
		const hasPathInfo = content.includes('path: /') || content.includes('pattern: ') || content.includes('No files found');
		const hasSecurityWarning = content.includes('seem malicious') || content.includes('NOTE: do any');

		let className = 'claudeMessage';
		if (hasPathInfo || hasSecurityWarning) {
			className += ' pathListing';
		}

		messageDiv.className = className;
		messageDiv.id = messageId;

		const contentDiv = document.createElement('div');
		contentDiv.className = 'claudeMessage-content';
		contentDiv.innerHTML = parseSimpleMarkdown(content);
		messageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle other message types (keep existing structure but add IDs with proper order)
	const messageDiv = document.createElement('div');
	messageDiv.className = `message ${type}`;
	messageDiv.id = messageId;

	// Only add copy button for error messages (claude handled separately above)
	if (type === 'error') {
		// Add error handling here if needed
	}

	// Add content
	const contentDiv = document.createElement('div');
	contentDiv.className = 'message-content';

	if(type === 'claude' || type === 'thinking'){
		contentDiv.innerHTML = content;
	} else {
		const preElement = document.createElement('pre');
		preElement.textContent = content;
		contentDiv.appendChild(preElement);
	}

	messageDiv.appendChild(contentDiv);

	// Check if this is a permission-related error and add yolo mode button
	if (type === 'error' && isPermissionError(content)) {
		const yoloSuggestion = document.createElement('div');
		yoloSuggestion.className = 'yolo-suggestion';
		yoloSuggestion.innerHTML = `
			<div class="yolo-suggestion-text">
				<span>💡 This looks like a permission issue. You can enable Yolo Mode to skip all permission checks.</span>
			</div>
			<button class="yolo-suggestion-btn" onclick="enableYoloMode()">Enable Yolo Mode</button>
		`;
		messageDiv.appendChild(yoloSuggestion);
	}

	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

export function parseSimpleMarkdown(markdown: string): string {
	if (!markdown) {
		return '';
	}

	// Convert basic markdown to HTML
	let result = markdown;

	// Handle code blocks first (before inline code)
	result = result.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
		return `<pre>${escapeHtml(code.trim())}</pre>`;
	});

	// Handle other markdown elements
	result = result
		.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.*?)\*/g, '<em>$1</em>')
		.replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
		.replace(/\n\n/g, '<br><br>') // Double line breaks become paragraph breaks
		.replace(/\n/g, '<br>'); // Single line breaks become line breaks

	return result;
}

export function clearMessages(): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (messagesDiv) {
		messagesDiv.innerHTML = '';
		messageCounter = 0;
	}
}

export function copyMessageContent(messageId: string): void {
	const messageElement = document.getElementById(`message-${messageId}`)?.querySelector('.message');
	if (messageElement) {
		const text = messageElement.textContent || '';
		navigator.clipboard.writeText(text).then(() => {
			// Show brief copy confirmation
			const original = messageElement.innerHTML;
			messageElement.innerHTML = '📋 Copied!';
			setTimeout(() => {
				messageElement.innerHTML = original;
			}, 1000);
		});
	}
}

export function copyCodeBlock(element: HTMLElement): void {
	const codeText = element.textContent || '';
	navigator.clipboard.writeText(codeText).then(() => {
		// Show brief copy confirmation
		const original = element.innerHTML;
		element.innerHTML = '📋 Copied!';
		setTimeout(() => {
			element.innerHTML = original;
		}, 1000);
	});
}

export function sendMessage(): void {
	if (!messageInput) {return;}

	const text = messageInput.value.trim();
	if (!text) {return;}

	// Only add editor context if there's an actual selection
	let enhancedText = text;
	const contextInfo = getEditorContextInfo();
	if (contextInfo) {
		enhancedText = contextInfo + '\n\n' + text;
	}

	// Don't add user message here - let extension handle it via userInput message

	// Clear input
	messageInput.value = '';
	messageInput.style.height = 'auto';

	// Set processing state only if not already processing (first message in session)
	if (!(window as any).isProcessing) {
		console.log('📤 Starting new processing session');
		(window as any).isProcessing = true;
		if (uiCoreRef) {
			uiCoreRef.disableButtons();
			uiCoreRef.showStopButton();
		}
	} else {
		console.log('📤 Sending additional message while processing');
	}

	sendStats('Send message');

	// Send to VS Code
	vsCodeApi.postMessage({
		type: 'sendMessage',
		text: enhancedText,
		planMode: _settingsModalsRef?.getPlanModeEnabled() || _planModeEnabled,
		thinkingMode: _settingsModalsRef?.getThinkingModeEnabled() || _thinkingModeEnabled,
		editorContext: (window as any).currentEditorContext || currentEditorContext
	});
}

export function stopRequest(): void {
	vsCodeApi.postMessage({ type: 'stopRequest' });
	(window as any).isProcessing = false;
	if (uiCoreRef) {
		uiCoreRef.enableButtons();
		uiCoreRef.hideStopButton();
	}
}

export function addToolUseMessage(data: any): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {return;}
	const shouldScroll = shouldAutoScroll(messagesDiv);

	if (data.rawInput) {
		// Check if rawInput contains necessary data
	}

	// Handle Read tools with special dimmed styling (toolUse has offset/limit, so we check for file_path)
	if (data.toolName === 'Read' && data.rawInput && data.rawInput.file_path) {
		const readMessageDiv = document.createElement('div');
		readMessageDiv.className = 'systemMessage claudeContext';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';
		contentDiv.innerHTML = `<span class="systemMessage-command">R: ${formatFilePath(data.rawInput.file_path)}</span>`;
		readMessageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(readMessageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle Bash commands with system message styling
	if (data.toolName === 'Bash' && data.rawInput && data.rawInput.command) {
		const bashMessageDiv = document.createElement('div');
		bashMessageDiv.className = 'systemMessage claudeContext';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';
		contentDiv.innerHTML = `<span class="systemMessage-command">$ ${data.rawInput.command}</span>`;
		bashMessageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(bashMessageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	if (data.toolName === 'TodoWrite' && data.rawInput && data.rawInput.todos) {
		// Handle TodoWrite as systemMessage instead of tool message
		const todoMessageDiv = document.createElement('div');
		todoMessageDiv.className = 'systemMessage claudeContext todoList';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';

		let todoHtml = '<strong>Todo List Update:</strong><br>';
		for (const todo of data.rawInput.todos) {
			const status = todo.status === 'completed' ? '✅' :
				todo.status === 'in_progress' ? '🔄' : '⏳';
			todoHtml += status + ' ' + todo.content + '<br>';
		}
		contentDiv.innerHTML = todoHtml;
		todoMessageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(todoMessageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle path-related tools as systemMessage
	const pathTools = ['LS', 'Glob', 'Grep', 'Read'];
	if (pathTools.includes(data.toolName) && data.rawInput) {
		const pathMessageDiv = document.createElement('div');
		pathMessageDiv.className = 'systemMessage claudeContext pathTool';

		const commandDiv = document.createElement('div');
		commandDiv.className = 'systemMessage-command';

		let pathHtml = `<span class="command">${data.toolName}:</span>`;
		if (data.rawInput.file_path) {
			pathHtml += ` <span class="result">path: ${data.rawInput.file_path}</span>`;
		} else if (data.rawInput.path) {
			pathHtml += ` <span class="result">path: ${data.rawInput.path}</span>`;
		} else if (data.rawInput.pattern) {
			pathHtml += ` <span class="result">pattern: ${data.rawInput.pattern}</span>`;
		} else {
			// Fallback - show raw input
			pathHtml += ` <span class="result">${JSON.stringify(data.rawInput, null, 2)}</span>`;
		}

		commandDiv.innerHTML = pathHtml;
		pathMessageDiv.appendChild(commandDiv);

		// Store reference for result attachment
		(window as any).lastPathToolMessage = pathMessageDiv;

		messagesDiv.appendChild(pathMessageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	const messageDiv = document.createElement('div');
	messageDiv.className = 'message tool';

	// Create modern header with icon
	const headerDiv = document.createElement('div');
	headerDiv.className = 'tool-header';

	const iconDiv = document.createElement('div');
	iconDiv.className = 'tool-icon';
	iconDiv.textContent = '🔧';

	const toolInfoElement = document.createElement('div');
	toolInfoElement.className = 'tool-info';
	let toolName = (data.toolInfo || '').replace('🔧 Executing: ', '');
	// Replace TodoWrite with more user-friendly name
	if (toolName === 'TodoWrite') {
		toolName = 'Update Todos';
	}
	toolInfoElement.textContent = toolName;

	headerDiv.appendChild(iconDiv);
	headerDiv.appendChild(toolInfoElement);
	messageDiv.appendChild(headerDiv);

	if (data.rawInput) {
		const inputElement = document.createElement('div');
		inputElement.className = 'tool-input';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'tool-input-content';

		// Handle different tool types
		if (data.toolName === 'Edit') {
			// For Edit tools, show the diff format directly without wrapping in tool-input
			contentDiv.innerHTML = formatEditToolDiff(data.rawInput);
			messageDiv.appendChild(contentDiv);
		} else if (data.toolName === 'MultiEdit') {
			// For MultiEdit tools, show the diff format directly without wrapping in tool-input
			contentDiv.innerHTML = formatMultiEditToolDiff(data.rawInput);
			messageDiv.appendChild(contentDiv);
		} else if (data.toolName === 'Write') {
			// For Write tools, show the diff format directly without wrapping in tool-input
			contentDiv.innerHTML = formatWriteToolDiff(data.rawInput);
			messageDiv.appendChild(contentDiv);
		} else {
			// For other tools, show the formatted input in the tool-input wrapper
			contentDiv.innerHTML = formatToolInputUI(data.rawInput);
			inputElement.appendChild(contentDiv);
			messageDiv.appendChild(inputElement);
		}
	} else if (data.toolInput) {
		// Fallback for pre-formatted input
		const inputElement = document.createElement('div');
		inputElement.className = 'tool-input';

		const labelDiv = document.createElement('div');
		labelDiv.className = 'tool-input-label';
		labelDiv.textContent = 'INPUT';
		inputElement.appendChild(labelDiv);

		const contentDiv = document.createElement('div');
		contentDiv.className = 'tool-input-content';
		contentDiv.textContent = data.toolInput;
		inputElement.appendChild(contentDiv);
		messageDiv.appendChild(inputElement);
	}

	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

export function sendStats(action: string): void {
	// Simple stats tracking - could be expanded
	console.log('Stats:', action);
}

export function getEditorContextInfo(): string | null {
	if (!currentEditorContext) {
		return null;
	}

	// Only provide context if there's an actual text selection
	if (currentEditorContext.selection && currentEditorContext.selectedText) {
		let contextInfo = 'in ' + currentEditorContext.fileName;
		const startLine = currentEditorContext.selection.start.line;
		const endLine = currentEditorContext.selection.end.line;
		contextInfo += ':' + startLine + '-' + endLine;
		return contextInfo;
	}

	// No selection = no context
	return null;
}


// =====================================
// WEBVIEW PROVIDER FUNCTIONALITY
// =====================================

export class ClaudeChatWebviewProvider implements vscode.WebviewViewProvider {
	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext,
		private readonly _chatProvider: any
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		// Use the shared chat provider instance for the sidebar
		this._chatProvider.showInWebview(webviewView.webview, webviewView);

		// Handle visibility changes to reinitialize when sidebar reopens
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				// Close main panel when sidebar becomes visible
				if (this._chatProvider._panel) {
					console.log('Closing main panel because sidebar became visible');
					this._chatProvider._panel.dispose();
					this._chatProvider._panel = undefined;
				}
				this._chatProvider.reinitializeWebview();
			}
		});
	}

	public postMessage(message: any): void {
		// Delegate to chat provider
		this._chatProvider._postMessage(message);
	}
}

// =====================================
// WEBVIEW RENDERER FUNCTIONALITY
// =====================================

export class WebviewRenderer {
	constructor(private _extensionUri: vscode.Uri) {}

	public getHtmlForWebview(webview: vscode.Webview): string {
		// Read RSBuild's generated HTML and adapt it for webview URIs
		const htmlPath = path.join(__dirname, '..', 'webview', 'index.html');
		if (!fs.existsSync(htmlPath)) {
			throw new Error(`Webview HTML not found at ${htmlPath}. Run "pnpm run compile" to build the extension.`);
		}

		let html = fs.readFileSync(htmlPath, 'utf8');

		// Determine if we're in development mode with hot reload server available
		// Only use development mode if NODE_ENV is development AND we have a dev server
		const isDev = false; // Temporarily force production mode until dev server is properly set up

		if (isDev) {
			// Development mode: use hot reload server
			html = html.replace(
				/<script defer src="\/static\/js\/index\.js"><\/script>/g,
				'<script defer src="http://localhost:3001/static/js/index.js"></script>'
			);
			html = html.replace(
				/<link href="\/static\/css\/index\.css" rel="stylesheet">/g,
				'<link href="http://localhost:3001/static/css/index.css" rel="stylesheet">'
			);
		} else {
			// Production mode: use webview URIs
			const jsUri = webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'static', 'js', 'index.js')
			);
			const cssUri = webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'static', 'css', 'index.css')
			);

			html = html.replace(
				/<script defer src="\/static\/js\/index\.js"><\/script>/g,
				`<script defer src="${jsUri}"></script>`
			);
			html = html.replace(
				/<link href="\/static\/css\/index\.css" rel="stylesheet">/g,
				`<link href="${cssUri}" rel="stylesheet">`
			);
		}

		// Add CSP
		const nonce = this.getNonce();
		const csp = isDev
			? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' http://localhost:3001; script-src 'nonce-${nonce}' http://localhost:3001; connect-src ws://localhost:3001; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">`
			: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">`;

		html = html.replace('<head>', `<head>\n${csp}`);
		html = html.replace('<script', `<script nonce="${nonce}"`);

		return html;
	}

	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	public setupHotReload(postMessage: (msg: any) => void): void {
		if (process.env.NODE_ENV !== 'development') {return;}

		// Watch for file changes in development
		const watcher = fs.watch(path.join(__dirname, '..', '..', 'src'), { recursive: true }, (eventType, filename) => {
			if (filename && (filename.endsWith('.ts') || filename.endsWith('.scss') || filename.endsWith('.html'))) {
				console.log('🔄 Hot reload triggered by:', filename);
				setTimeout(() => {
					this.recreateWebviewForHotReload(postMessage);
				}, 500);
			}
		});

		// Clean up watcher when extension deactivates
		process.on('exit', () => {
			watcher.close();
		});
	}

	private recreateWebviewForHotReload(postMessage: (msg: any) => void): void {
		try {
			const isCSSChange = true; // We could detect this more precisely

			postMessage({
				type: 'hotReload',
				data: {
					timestamp: Date.now(),
					reloadType: isCSSChange ? 'css' : 'full'
				}
			});
		} catch (error) {
			console.error('❌ Failed to recreate webview for hot reload:', error);
		}
	}
}

// =====================================
// WEBVIEW MESSAGE HANDLER
// =====================================

export class WebviewMessageHandler {
	private _panel: vscode.WebviewPanel | undefined;
	private _webview: vscode.Webview | undefined;
	private _webviewView: vscode.WebviewView | undefined;
	private _messageHandlerDisposable: vscode.Disposable | undefined;
	private _disposables: vscode.Disposable[] = [];

	public get panel(): vscode.WebviewPanel | undefined {
		return this._panel;
	}

	constructor(
		private _extensionUri: vscode.Uri,
		private _webviewRenderer: WebviewRenderer,
		private _messageHandler: (message: any) => void
	) {}

	public postMessage(message: any) {
		if (this._panel && this._panel.webview) {
			this._panel.webview.postMessage(message);
		} else if (this._webview) {
			this._webview.postMessage(message);
		} else {
			console.error('No webview available to post message to!');
		}
	}

	public setupWebviewPanel(panel: vscode.WebviewPanel) {
		this._panel = panel;
		this._panel.webview.html = this.getHtmlForWebview();
		this.setupWebviewMessageHandler(this._panel.webview);
	}

	public showInWebview(webview: vscode.Webview, webviewView?: vscode.WebviewView) {
		// Close main panel if it's open
		if (this._panel) {
			this._panel.dispose();
			this._panel = undefined;
		}

		this._webview = webview;
		this._webviewView = webviewView;
		this._webview.html = this.getHtmlForWebview();

		this.setupWebviewMessageHandler(this._webview);
	}

	private setupWebviewMessageHandler(webview: vscode.Webview) {
		// Dispose of any existing message handler
		if (this._messageHandlerDisposable) {
			this._messageHandlerDisposable.dispose();
		}

		// Set up new message handler
		this._messageHandlerDisposable = webview.onDidReceiveMessage(
			this._messageHandler,
			null,
			this._disposables
		);
	}

	public getHtmlForWebview(): string {
		const webviewUri = this._panel?.webview || this._webview;
		if (!webviewUri) {
			throw new Error('Webview URI not available');
		}
		return this._webviewRenderer.getHtmlForWebview(webviewUri);
	}

	public setupHotReload(postMessageFn: (msg: any) => void): void {
		this._webviewRenderer.setupHotReload(postMessageFn);
	}

	public recreateWebviewForHotReload(): void {
		try {
			const newHtml = this.getHtmlForWebview();

			if (this._panel && this._panel.webview) {
				this._panel.webview.html = newHtml;
			}

			if (this._webview) {
				this._webview.html = newHtml;
			}
		} catch (error) {
			console.error('❌ Failed to recreate webview for hot reload:', error);
		}
	}

	public closeSidebar() {
		if (this._webviewView) {
			// Switch VS Code to show Explorer view instead of chat sidebar
			vscode.commands.executeCommand('workbench.view.explorer');
		}
	}

	public dispose() {
		if (this._messageHandlerDisposable) {
			this._messageHandlerDisposable.dispose();
		}
		this._disposables.forEach(d => d.dispose());
	}
}

// =====================================
// UI CORE FUNCTIONALITY
// =====================================

// UI Core specific variables
let messagesDiv: HTMLElement;
let filePickerModal: HTMLElement;
let fileSearchInput: HTMLInputElement;
let _selectedFileIndex = -1;
let currentModel = 'opus';

export function initializeModals(): void {
	// Settings modal close functionality
	const settingsModal = document.getElementById('settingsModal');
	if (settingsModal) {
		settingsModal.addEventListener('click', (e) => {
			if (e.target === settingsModal) {
				// hideSettingsModal();
			}
		});
	}
	// MCP modal close functionality
	const mcpModal = document.getElementById('mcpModal');
	if (mcpModal) {
		mcpModal.addEventListener('click', (e) => {
			if (e.target === mcpModal) {
				// hideMCPModal();
			}
		});
	}
	// Model selector modal close functionality
	const modelModal = document.getElementById('modelModal');
	if (modelModal) {
		modelModal.addEventListener('click', (e) => {
			if (e.target === modelModal) {
				hideModelModal();
			}
		});
	}
	// Slash commands modal close functionality
	const slashCommandsModal = document.getElementById('slashCommandsModal');
	if (slashCommandsModal) {
		slashCommandsModal.addEventListener('click', (e) => {
			if (e.target === slashCommandsModal) {
				hideSlashCommandsModal();
			}
		});
	}
	// Thinking intensity modal close functionality
	const thinkingIntensityModal = document.getElementById('thinkingIntensityModal');
	if (thinkingIntensityModal) {
		thinkingIntensityModal.addEventListener('click', (e) => {
			if (e.target === thinkingIntensityModal) {
				// hideThinkingIntensityModal();
			}
		});
	}
}

export function toggleSettings(): void {
	const settingsModal = document.getElementById('settingsModal');
	if (settingsModal) {
		if (settingsModal.style.display === 'none') {
			// Request current settings from VS Code
			vsCodeApi.postMessage({
				type: 'getSettings'
			});
			// Request current permissions
			vsCodeApi.postMessage({
				type: 'getPermissions'
			});
			settingsModal.style.display = 'flex';
		} else {
			settingsModal.style.display = 'none';
		}
	}
}

export function showModelSelector(): void {
	document.getElementById('modelModal')!.style.display = 'flex';
	// Select the current model radio button
	const radioButton = document.getElementById('model-' + currentModel) as HTMLInputElement;
	if (radioButton) {
		radioButton.checked = true;
	}
}

export function showSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {modal.style.display = 'flex';}
	// Auto-focus the search input
	setTimeout(() => {
		const searchInput = document.getElementById('slashCommandsSearch') as HTMLInputElement;
		if (searchInput) {searchInput.focus();}
	}, 100);
}

export function hideModelModal(): void {
	const modal = document.getElementById('modelModal');
	if (modal) {modal.style.display = 'none';}
}

export function hideSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {modal.style.display = 'none';}
}

export function showFilePicker(): void {
	// Request initial file list from VS Code
	vsCodeApi.postMessage({
		type: 'getWorkspaceFiles',
		searchTerm: ''
	});
	// Show modal
	filePickerModal.style.display = 'flex';
	fileSearchInput.focus();
	_selectedFileIndex = -1;
}

export function hideFilePicker(): void {
	filePickerModal.style.display = 'none';
	fileSearchInput.value = '';
	_selectedFileIndex = -1;
}

export function selectImage(): void {
	// Use VS Code's native file picker instead of browser file picker
	vsCodeApi.postMessage({
		type: 'selectImageFile'
	});
}

export function newSession(): void {
	sendStats('New chat');
	vsCodeApi.postMessage({
		type: 'newSession'
	});
}

export function toggleConversationHistory(): void {
	const historyDiv = document.getElementById('conversationHistory');
	const chatContainer = document.getElementById('chatContainer');
	if (historyDiv && chatContainer) {
		if (historyDiv.style.display === 'none') {
			sendStats('History opened');
			// Show conversation history
			vsCodeApi.postMessage({
				type: 'getConversationList'
			});
			historyDiv.style.display = 'block';
			chatContainer.style.display = 'none';
		} else {
			// Hide conversation history
			historyDiv.style.display = 'none';
			chatContainer.style.display = 'flex';
		}
	}
}

export function addToolResultMessage(data: any): void {
	if (!data) {
		return;
	}
	if (!messagesDiv) {
		return;
	}
	const shouldScroll = shouldAutoScroll(messagesDiv);

	// Handle Read tools with special dimmed styling (toolResult doesn't have rawInput, but we can show file context)
	if (false && data.toolName === 'Read' && !data.isError) { // Skip toolResult for Read tools - visual context shows it's a read operation
		// Try to extract file path from content or use a generic indicator
		let filePath = 'file read';
		if (data.content && typeof data.content === 'string') {
			// Look for file path patterns in the content
			const contentLines = data.content.split('\n');
			const firstLine = contentLines[0] || '';
			// If content starts with line numbers, it's likely a file
			if (firstLine.match(/^\s*\d+→/)) {
				filePath = 'read file content';
			}
		}

		const readMessageDiv = document.createElement('div');
		readMessageDiv.className = 'systemMessage claudeContext';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';
		contentDiv.innerHTML = filePath;
		readMessageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(readMessageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle Bash tool results by appending to the previous bash system message
	if (data.toolName === 'Bash' && !data.isError) {
		// Find the most recent systemMessage claudeContext (the bash command)
		const systemMessages = messagesDiv.querySelectorAll('.systemMessage.claudeContext');
		const lastSystemMessage = systemMessages[systemMessages.length - 1] as HTMLElement;

		if (lastSystemMessage) {
			const contentDiv = lastSystemMessage.querySelector('.systemMessage-content');
			if (contentDiv) {
				// Add the result to the same system message box
				contentDiv.innerHTML += `<span class="systemMessage-response">${data.content}</span>`;
				scrollToBottomIfNeeded(messagesDiv, shouldScroll);
				return;
			}
		}
	}

	// For Read and Edit tools with hidden flag, just hide loading state and show completion message
	if (data.hidden && (data.toolName === 'Read' || data.toolName === 'Edit' || data.toolName === 'TodoWrite' || data.toolName === 'MultiEdit') && !data.isError) {
		return;
		// Show completion message
		const toolName = data.toolName;
		let completionText;
		if (toolName === 'Read') {
			completionText = '✅ Read completed';
		} else if (toolName === 'Edit') {
			completionText = '✅ Edit completed';
		} else if (toolName === 'TodoWrite') {
			completionText = '✅ Update Todos completed';
		} else {
			completionText = '✅ ' + toolName + ' completed';
		}
		addMessage(completionText, 'system');
		return; // Don't show the result message
	}
	if(data.isError && data.content === "File has not been read yet. Read it first before writing to it."){
		return addMessage("File has not been read yet. Let me read it first before writing to it.", 'system');
	}
	// Handle path-related tools - append result to existing systemMessage
	const pathTools = ['LS', 'Glob', 'Grep', 'Read'];
	const isPathTool = pathTools.includes(data.toolName);

	if (isPathTool && !data.isError && window.lastPathToolMessage) {
		// Append result as systemMessage-content to existing pathTool message
		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';

		let content = data.content || '';
		if (content.length > 200) {
			const truncateAt = 197;
			content = content.substring(0, truncateAt) + '...';
		}
		contentDiv.innerHTML = `<pre>${content}</pre>`;

		window.lastPathToolMessage.appendChild(contentDiv);
		window.lastPathToolMessage = undefined; // Clear reference

		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	const messageDiv = document.createElement('div');

	if (data.isError) {
		messageDiv.className = 'systemMessage error';
	} else {
		messageDiv.className = 'message tool-result';
	}

	if (!data.isError) {
		// Create header for regular tool results
		const headerDiv = document.createElement('div');
		headerDiv.className = 'message-header';
		const iconDiv = document.createElement('div');
		iconDiv.className = 'message-icon';
		iconDiv.style.background = 'linear-gradient(135deg, #1cc08c 0%, #16a974 100%)';
		iconDiv.textContent = '✅';
		const labelDiv = document.createElement('div');
		labelDiv.className = 'message-label';
		labelDiv.textContent = 'Result';
		headerDiv.appendChild(iconDiv);
		headerDiv.appendChild(labelDiv);
		messageDiv.appendChild(headerDiv);
	}

	// Add content (systemMessage structure for errors, regular structure for results)
	const contentDiv = document.createElement('div');
	contentDiv.className = data.isError ? 'systemMessage-content' : 'message-content';
	// Check if it's a tool result and truncate appropriately
	let content = data.content || '';
	if (content.length > 200 && !data.isError) {
		const truncateAt = 197;
		const truncated = content.substring(0, truncateAt);
		const resultId = 'result_' + Math.random().toString(36).substr(2, 9);
		const preElement = document.createElement('pre');
		preElement.innerHTML = '<span id="' + resultId + '_visible">' + escapeHtml(truncated) + '</span>' +
							   '<span id="' + resultId + '_ellipsis">...</span>' +
							   '<span id="' + resultId + '_hidden" style="display: none;">' + escapeHtml(content.substring(truncateAt)) + '</span>';
		contentDiv.appendChild(preElement);
		// Add expand button container
		const expandContainer = document.createElement('div');
		expandContainer.className = 'diff-expand-container';
		const expandButton = document.createElement('button');
		expandButton.className = 'diff-expand-btn';
		expandButton.textContent = 'Show more';
		expandButton.setAttribute('onclick', 'toggleResultExpansion(\'' + resultId + '\')');
		expandContainer.appendChild(expandButton);
		contentDiv.appendChild(expandContainer);
	} else {
		const preElement = document.createElement('pre');
		preElement.textContent = content;
		contentDiv.appendChild(preElement);
	}
	messageDiv.appendChild(contentDiv);
	// Check if this is a permission-related error and add yolo mode button
	if (data.isError && isPermissionError(content)) {
		const yoloSuggestion = document.createElement('div');
		yoloSuggestion.className = 'yolo-suggestion';
		yoloSuggestion.innerHTML = `
			<div class="yolo-suggestion-text">
				<span>💡 This looks like a permission issue. You can enable Yolo Mode to skip all permission checks.</span>
			</div>
			<button class="yolo-suggestion-btn" onclick="enableYoloMode()">Enable Yolo Mode</button>
		`;
		messageDiv.appendChild(yoloSuggestion);
	}
	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

export function toggleResultExpansion(resultId: string): void {
	const hiddenDiv = document.getElementById(resultId + '_hidden');
	const ellipsis = document.getElementById(resultId + '_ellipsis');
	const button = document.querySelector('[onclick*="toggleResultExpansion(\'' + resultId + '\')"]') as HTMLButtonElement;
	if (hiddenDiv && button) {
		if (hiddenDiv.style.display === 'none') {
			hiddenDiv.style.display = 'inline';
			if (ellipsis) {
				ellipsis.style.display = 'none';
			}
			button.textContent = 'Show less';
		} else {
			hiddenDiv.style.display = 'none';
			if (ellipsis) {
				ellipsis.style.display = 'inline';
			}
			button.textContent = 'Show more';
		}
	}
}

export function toggleExpand(button: HTMLElement): void {
	const key = button.getAttribute('data-key');
	const value = button.getAttribute('data-value');
	// Find the container that holds just this key-value pair
	let container = button.parentNode as HTMLElement;
	while (container && !container.classList.contains('expandable-item')) {
		container = container.parentNode as HTMLElement;
	}
	if (!container) {
		// Fallback: create a wrapper around the current line
		const parent = button.parentNode as HTMLElement;
		const wrapper = document.createElement('div');
		wrapper.className = 'expandable-item';
		parent.insertBefore(wrapper, button.previousSibling || button);
		// Move the key, value text, and button into the wrapper
		let currentNode = wrapper.nextSibling;
		const nodesToMove: Node[] = [];
		while (currentNode && currentNode !== button.nextSibling) {
			nodesToMove.push(currentNode);
			currentNode = currentNode.nextSibling;
		}
		nodesToMove.forEach(node => wrapper.appendChild(node));
		container = wrapper;
	}
	if (button.textContent === 'expand') {
		// Show full content
		const decodedValue = value!.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
		container.innerHTML = '<strong>' + key + ':</strong> ' + decodedValue + ' <span class="expand-btn" data-key="' + key + '" data-value="' + value + '" onclick="toggleExpand(this)">collapse</span>';
	} else {
		// Show truncated content
		const decodedValue = value!.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
		const truncated = decodedValue.substring(0, 97) + '...';
		container.innerHTML = '<strong>' + key + ':</strong> ' + truncated + ' <span class="expand-btn" data-key="' + key + '" data-value="' + value + '" onclick="toggleExpand(this)">expand</span>';
	}
}

export function toggleDiffExpansion(diffId: string): void {
	const hiddenDiv = document.getElementById(diffId + '_hidden');
	const button = document.querySelector('[onclick*="' + diffId + '"]') as HTMLButtonElement;
	if (hiddenDiv && button) {
		if (hiddenDiv.style.display === 'none') {
			hiddenDiv.style.display = 'block';
			button.textContent = 'Show less';
		} else {
			hiddenDiv.style.display = 'none';
			const hiddenLines = hiddenDiv.querySelectorAll('.diff-line').length;
			button.textContent = 'Show ' + hiddenLines + ' more lines';
		}
	}
}

export function requestConversationList(): void {
	vsCodeApi.postMessage({
		type: 'getConversationList'
	});
}

export function loadConversation(filename: string): void {
	vsCodeApi.postMessage({
		type: 'loadConversation',
		filename: filename
	});
	// Hide conversation history and show chat
	toggleConversationHistory();
}

export function displayConversationList(conversations: any[]): void {
	const listDiv = document.getElementById('conversationList');
	if (!listDiv) {return;}
	listDiv.innerHTML = '';
	if (conversations.length === 0) {
		listDiv.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No conversations found</p>';
		return;
	}
	conversations.forEach(conv => {
		const item = document.createElement('div');
		item.className = 'conversation-item';
		item.onclick = () => loadConversation(conv.filename);
		const date = new Date(conv.startTime).toLocaleDateString();
		const time = new Date(conv.startTime).toLocaleTimeString();
		item.innerHTML = `
			<div class="conversation-title">${conv.firstUserMessage.substring(0, 60)}${conv.firstUserMessage.length > 60 ? '...' : ''}</div>
			<div class="conversation-meta">${date} at ${time} • ${conv.messageCount} messages • $${conv.totalCost.toFixed(3)}</div>
			<div class="conversation-preview">Last: ${conv.lastUserMessage.substring(0, 80)}${conv.lastUserMessage.length > 80 ? '...' : ''}</div>
		`;
		listDiv.appendChild(item);
	});
}

export function restoreToCommit(commitSha: string): void {
	vsCodeApi.postMessage({
		type: 'restoreCommit',
		commitSha: commitSha
	});
	// Clear the checkpoint since it's being restored
	window.currentCheckpoint = null;
}

export function showRestoreContainer(data: any): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {return;}
	const shouldScroll = shouldAutoScroll(messagesDiv);
	const restoreContainer = document.createElement('div');
	restoreContainer.className = 'restore-container';
	restoreContainer.id = `restore-${data.sha}`;
	const timeAgo = new Date(data.timestamp).toLocaleTimeString();
	restoreContainer.innerHTML = `
		<button class="restore-btn dark" onclick="restoreToCommit('${data.sha}')">
			Restore checkpoint
		</button>
		<span class="restore-date">${timeAgo}</span>
	`;
	messagesDiv.appendChild(restoreContainer);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

export function _hideRestoreContainer(commitSha: string): void {
	const container = document.getElementById(`restore-${commitSha}`);
	if (container) {
		container.remove();
	}
}

export function showSessionInfo(_sessionId: string): void {
	// const sessionInfo = document.getElementById('sessionInfo');
	// const sessionIdSpan = document.getElementById('sessionId');
	const sessionStatus = document.getElementById('sessionStatus');
	const newSessionBtn = document.getElementById('newSessionBtn');
	const _historyBtn = document.getElementById('historyBtn');
	if (sessionStatus && newSessionBtn) {
		// sessionIdSpan.textContent = sessionId.substring(0, 8);
		// sessionIdSpan.title = `Full session ID: ${sessionId} (click to copy)`;
		// sessionIdSpan.style.cursor = 'pointer';
		// sessionIdSpan.onclick = () => copySessionId(sessionId);
		// sessionInfo.style.display = 'flex';
		sessionStatus.style.display = 'none';
		newSessionBtn.style.display = 'block';
		if (_historyBtn) {_historyBtn.style.display = 'block';}
	}
}

export function _copySessionId(sessionId: string): void {
	navigator.clipboard.writeText(sessionId).then(() => {
		// Show temporary feedback
		const sessionIdSpan = document.getElementById('sessionId');
		if (sessionIdSpan) {
			const originalText = sessionIdSpan.textContent;
			sessionIdSpan.textContent = 'Copied!';
			setTimeout(() => {
				sessionIdSpan.textContent = originalText;
			}, 1000);
		}
	});
}

export function hideSessionInfo(): void {
	// const sessionInfo = document.getElementById('sessionInfo');
	const sessionStatus = document.getElementById('sessionStatus');
	const newSessionBtn = document.getElementById('newSessionBtn');
	if (sessionStatus && newSessionBtn) {
		// sessionInfo.style.display = 'none';
		sessionStatus.style.display = 'none';
		// Always show new session
		newSessionBtn.style.display = 'block';
		// Keep history button visible - don't hide it
	}
}

export function _showImageAddedFeedback(fileName: string): void {
	// Create temporary feedback element
	const feedback = document.createElement('div');
	feedback.textContent = `Added: ${fileName}`;
	feedback.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		background: var(--vscode-notifications-background);
		color: var(--vscode-notifications-foreground);
		padding: 8px 12px;
		border-radius: 4px;
		font-size: 12px;
		z-index: 1000;
		opacity: 0;
		transition: opacity 0.3s ease;
	`;
	document.body.appendChild(feedback);
	// Animate in
	setTimeout(() => feedback.style.opacity = '1', 10);
	// Animate out and remove
	setTimeout(() => {
		feedback.style.opacity = '0';
		setTimeout(() => feedback.remove(), 300);
	}, 2000);
}

export function handleClipboardText(text: string): void {
	if (!text) {return;}
	// Insert text at cursor position
	const start = messageInput.selectionStart;
	const end = messageInput.selectionEnd;
	const currentValue = messageInput.value;
	const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
	messageInput.value = newValue;
	// Set cursor position after pasted text
	const newCursorPos = start + text.length;
	messageInput.setSelectionRange(newCursorPos, newCursorPos);
	// Trigger input event to adjust height
	messageInput.dispatchEvent(new Event('input', { bubbles: true }));
}

export function loadCustomSnippets(snippetsData: any = {}): void {
	const snippetsList = document.getElementById('promptSnippetsList');
	if (!snippetsList) {return;}
	// Remove existing custom snippets
	const existingCustom = snippetsList.querySelectorAll('.custom-snippet-item');
	existingCustom.forEach(item => item.remove());
	// Add custom snippets after the add button and form
	const addForm = document.getElementById('addSnippetForm');
	if (!addForm) {return;}
	Object.values(snippetsData).forEach((snippet: any) => {
		const snippetElement = document.createElement('div');
		snippetElement.className = 'slash-command-item prompt-snippet-item custom-snippet-item';
		snippetElement.onclick = () => {
			if (messageInput && snippet.prompt) {
				messageInput.value = snippet.prompt;
			}
		};
		snippetElement.innerHTML = `
			<div class="slash-command-icon">📝</div>
			<div class="slash-command-content">
				<div class="slash-command-title">/${snippet.name}</div>
				<div class="slash-command-description">${snippet.prompt}</div>
			</div>
			<div class="snippet-actions">
				<button class="snippet-delete-btn" onclick="event.stopPropagation(); deleteCustomSnippet('${snippet.id}')" title="Delete snippet">🗑️</button>
			</div>
		`;
		// Insert after the form
		addForm.parentNode?.insertBefore(snippetElement, addForm.nextSibling);
	});
}

export function initialize(): void {
	// Initialize DOM elements
	messagesDiv = document.getElementById('chatMessages')!;
	messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
	filePickerModal = document.getElementById('filePickerModal')!;
	fileSearchInput = document.getElementById('fileSearchInput') as HTMLInputElement;

	// Initialize modals
	initializeModals();

	// Expose functions to global scope for HTML onclick handlers
	Object.assign(window, {
		showModelSelector,
		hideModelModal,
		showSlashCommandsModal,
		hideSlashCommandsModal,
		showFilePicker,
		hideFilePicker,
		selectImage,
		newSession,
		toggleConversationHistory,
		toggleResultExpansion,
		toggleExpand,
		toggleDiffExpansion,
		restoreToCommit,
		loadConversation
	});
}

// Setters for global variables (to be called from ui-scripts.ts)
export function setMessagesDiv(div: HTMLElement): void {
	messagesDiv = div;
}

// Duplicate export removed

export function setFilePickerModal(modal: HTMLElement): void {
	filePickerModal = modal;
}

export function setFileSearchInput(input: HTMLInputElement): void {
	fileSearchInput = input;
}

export function setSelectedFileIndex(index: number): void {
	_selectedFileIndex = index;
}

export function setCurrentModel(model: string): void {
	currentModel = model;
}

export function toggleStatusPopover(): void {
	const statusPopover = document.getElementById('statusPopover');
	if (!statusPopover) {return;}

	if (statusPopover.style.display === 'none' || !statusPopover.style.display) {
		// Show popover with current status info
		updateStatusPopoverContent();
		statusPopover.style.display = 'block';

		// Auto-hide after 5 seconds
		setTimeout(() => {
			statusPopover.style.display = 'none';
		}, 5000);
	} else {
		statusPopover.style.display = 'none';
	}
}

export function updateStatusPopoverContent(): void {
	const statusPopover = document.getElementById('statusPopover');
	if (!statusPopover) {return;}

	// Get status data from global window properties
	const totalTokensInput = window.totalTokensInput || 0;
	const totalTokensOutput = window.totalTokensOutput || 0;
	const totalCost = window.totalCost || 0;
	const lastRequestCost = window.lastRequestCost || 0;
	const lastRequestTokens = window.lastRequestTokens || 0;
	const currentStatus = window.currentStatus || 'ready';

	const totalTokens = totalTokensInput + totalTokensOutput;
	const statusText = currentStatus === 'ready' ? 'Ready' : currentStatus === 'processing' ? 'Processing' : 'Error';

	// Format costs with 2 decimals and pad to align with total tokens
	const lastCostStr = lastRequestCost > 0 ? lastRequestCost.toFixed(2) : '0.00';
	const totalCostStr = totalCost > 0 ? totalCost.toFixed(2) : '0.00';
	const totalTokensStr = totalTokens.toLocaleString();

	statusPopover.innerHTML = `
		<div class="status-popover-content">
			<table class="status-table">
				<tr>
					<td>${statusText}:</td>
					<td>$${lastCostStr}</td>
					<td>${lastRequestTokens.toLocaleString()} tk</td>
				</tr>
				<tr>
					<td>Session total:</td>
					<td>$${totalCostStr}</td>
					<td>${totalTokensStr} tk</td>
				</tr>
			</table>
		</div>
	`;
}

export function setupMessageInput(): void {
	if (!messageInput) {
		return;
	}

	// Handle keyboard shortcuts
	messageInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			// Enter alone = send message
			e.preventDefault();
			window.sendMessage();
		}
		// Shift+Enter = new line (default behavior)
	});

	// Auto-resize textarea
	messageInput.addEventListener('input', () => {
		messageInput.style.height = 'auto';
		messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
	});

	// Save input text as user types (debounced)
	let saveInputTimeout: NodeJS.Timeout;
	messageInput.addEventListener('input', () => {
		clearTimeout(saveInputTimeout);
		saveInputTimeout = setTimeout(() => {
			vsCodeApi.postMessage({
				type: 'saveInputText',
				text: messageInput.value
			});
		}, 500); // Save after 500ms of no typing
	});
}

export function updateInputStatusIndicator(): void {
	const inputIndicator = document.getElementById('inputStatusIndicator');
	if (!inputIndicator) {return;}

	const currentStatus = window.currentStatus || 'ready';

	// Remove all status classes
	inputIndicator.classList.remove('ready', 'processing', 'error');

	// Add current status class
	inputIndicator.classList.add(currentStatus);
}

export function disableButtons(): void {
	const buttons = document.querySelectorAll('button:not(#stopBtn):not(#sendBtn)');
	buttons.forEach(btn => {
		(btn as HTMLButtonElement).disabled = true;
	});
}

export function enableButtons(): void {
	const buttons = document.querySelectorAll('button');
	buttons.forEach(btn => {
		(btn as HTMLButtonElement).disabled = false;
	});
}

export function showStopButton(): void {
	const stopBtn = document.getElementById('stopBtn');
	if (stopBtn) {
		stopBtn.style.display = 'flex';
	}
}

export function hideStopButton(): void {
	const stopBtn = document.getElementById('stopBtn');
	if (stopBtn) {
		stopBtn.style.display = 'none';
	}
}

// Hot reload function to refresh CSS without losing DOM state
export function reloadCSS(): void {
	const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');

	if (cssLinks.length === 0) {
		location.reload();
		return;
	}

	let reloadCount = 0;

	cssLinks.forEach((element) => {
		const link = element as HTMLLinkElement;

		if (link.href.includes('index.css') || link.href.includes('.css')) {
			reloadCount++;

			const url = new URL(link.href);
			// Add cache-busting parameter
			url.searchParams.set('t', Date.now().toString());

			// Create new link element
			const newLink = document.createElement('link');
			newLink.rel = 'stylesheet';
			newLink.href = url.toString();

			// Set timeout fallback in case CSS doesn't load
			const timeoutId = setTimeout(() => {
				location.reload();
			}, 3000);

			// Replace old link with new one
			newLink.onload = () => {
				clearTimeout(timeoutId);

				// Only remove old link after new one loads successfully
				setTimeout(() => {
					if (link.parentNode) {
						link.remove();
					}
				}, 100);
			};

			newLink.onerror = () => {
				clearTimeout(timeoutId);
				setTimeout(() => {
					location.reload();
				}, 100);
			};

			// Insert new link after the old one to avoid flash
			if (link.nextSibling) {
				link.parentNode?.insertBefore(newLink, link.nextSibling);
			} else {
				link.parentNode?.appendChild(newLink);
			}
		}
	});

	if (reloadCount === 0) {
		location.reload();
	}
}

export function updateEditorContextDisplay(contextData: any): void {
	const editorContextLine = document.getElementById('editorContextLine');
	if (!editorContextLine) {
		return;
	}

	// Get current editor context from global if not passed as parameter
	const currentEditorContext = contextData || window.currentEditorContext;

	if (!currentEditorContext || !currentEditorContext.hasActiveFile) {
		editorContextLine.style.display = 'none';
		return;
	}

	// Build simple context line
	let contextText = 'in ' + currentEditorContext.fileName;

	if (currentEditorContext.selection && currentEditorContext.selectedText) {
		// VS Code already provides 1-based line numbers
		const startLine = currentEditorContext.selection.start.line;
		const endLine = currentEditorContext.selection.end.line;
		contextText += ':' + startLine + '-' + endLine;
	} else if (currentEditorContext.cursorPosition) {
		// VS Code already provides 1-based line numbers
		const cursorLine = currentEditorContext.cursorPosition.line;
		contextText += ':' + cursorLine;
	}

	editorContextLine.textContent = contextText;
	editorContextLine.style.display = 'block';
}

// =====================================
// FORMATTING UTILITY FUNCTIONS (FROM MASTER.BACKUP)
// =====================================


// Expose functions to be used in HTML
declare global {
	interface _Window {
		showModelSelector: () => void;
		hideModelModal: () => void;
		showSlashCommandsModal: () => void;
		hideSlashCommandsModal: () => void;
		showFilePicker: () => void;
		hideFilePicker: () => void;
		selectImage: () => void;
		newSession: () => void;
		toggleConversationHistory: () => void;
		toggleResultExpansion: (resultId: string) => void;
		toggleExpand: (button: HTMLElement) => void;
		toggleDiffExpansion: (diffId: string) => void;
		restoreToCommit: (commitSha: string) => void;
		loadConversation: (filename: string) => void;
	}
}
