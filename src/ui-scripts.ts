// Complete original JavaScript functionality extracted from ui.ts.back
declare const acquireVsCodeApi: () => any;

const vscode = acquireVsCodeApi();
const messagesDiv = document.getElementById('messages') as HTMLElement;
const messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLElement;
const statusTextDiv = document.getElementById('statusText') as HTMLElement;
const filePickerModal = document.getElementById('filePickerModal') as HTMLElement;
const fileSearchInput = document.getElementById('fileSearchInput') as HTMLInputElement;
const fileList = document.getElementById('fileList') as HTMLElement;
const _imageBtn = document.getElementById('imageBtn') as HTMLButtonElement;

let _isProcessRunning = false;
let filteredFiles: any[] = [];
let selectedFileIndex = -1;
let planModeEnabled = false;
let thinkingModeEnabled = false;
let currentEditorContext: any = null;

let totalCost = 0;
let totalTokensInput = 0;
let totalTokensOutput = 0;
let requestCount = 0;
let isProcessing = false;
let requestStartTime: number | null = null;
let requestTimer: number | null = null;

function shouldAutoScroll(messagesDiv: HTMLElement): boolean {
	const threshold = 100; // pixels from bottom
	const scrollTop = messagesDiv.scrollTop;
	const scrollHeight = messagesDiv.scrollHeight;
	const clientHeight = messagesDiv.clientHeight;

	return (scrollTop + clientHeight >= scrollHeight - threshold);
}

function scrollToBottomIfNeeded(messagesDiv: HTMLElement, shouldScroll: boolean | null = null): void {
	// If shouldScroll is not provided, check current scroll position
	if (shouldScroll === null) {
		shouldScroll = shouldAutoScroll(messagesDiv);
	}

	if (shouldScroll) {
		messagesDiv.scrollTop = messagesDiv.scrollHeight;
	}
}

function addMessage(content: string, type = 'claude'): void {
	const shouldScroll = shouldAutoScroll(messagesDiv);

	const messageDiv = document.createElement('div');
	messageDiv.className = `message ${type}`;

	// Add header for main message types (excluding system)
	if (type === 'user' || type === 'claude' || type === 'error') {
		const headerDiv = document.createElement('div');
		headerDiv.className = 'message-header';

		const iconDiv = document.createElement('div');
		iconDiv.className = `message-icon ${type}`;

		const labelDiv = document.createElement('div');
		labelDiv.className = 'message-label';

		// Set icon and label based on type
		switch(type) {
			case 'user':
				iconDiv.textContent = '👤';
				labelDiv.textContent = 'You';
				break;
			case 'claude':
				iconDiv.textContent = '🤖';
				labelDiv.textContent = 'Claude';
				break;
			case 'error':
				iconDiv.textContent = '⚠️';
				labelDiv.textContent = 'Error';
				break;
		}

		// Add copy button
		const copyBtn = document.createElement('button');
		copyBtn.className = 'copy-btn';
		copyBtn.title = 'Copy message';
		copyBtn.onclick = () => copyMessageContent(messageDiv);
		copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

		headerDiv.appendChild(iconDiv);
		headerDiv.appendChild(labelDiv);
		headerDiv.appendChild(copyBtn);
		messageDiv.appendChild(headerDiv);
	}

	// Add content
	const contentDiv = document.createElement('div');
	contentDiv.className = 'message-content';

	if(type === 'user' || type === 'claude' || type === 'thinking'){
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

function addToolUseMessage(data: any): void {
	const shouldScroll = shouldAutoScroll(messagesDiv);

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
	let toolName = data.toolInfo.replace('🔧 Executing: ', '');
	// Replace TodoWrite with more user-friendly name
	if (toolName === 'TodoWrite') {
		toolName = 'Update Todos';
	}
	toolInfoElement.textContent = toolName;

	headerDiv.appendChild(iconDiv);
	headerDiv.appendChild(toolInfoElement);
	messageDiv.appendChild(headerDiv);

	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

function sendMessage(): void {
	console.log('sendMessage called');
	const text = messageInput.value.trim();

	if (text) {
		// Enhance message with editor context if available
		let enhancedText = text;
		const contextInfo = getEditorContextInfo();
		if (contextInfo) {
			enhancedText = contextInfo + '\n\n' + text;
		}
		sendStats('Send message');

		console.log('Posting message to extension:', text);

		vscode.postMessage({
			type: 'sendMessage',
			text: enhancedText,
			planMode: planModeEnabled,
			thinkingMode: thinkingModeEnabled,
			editorContext: currentEditorContext
		});

		messageInput.value = '';
	}
}

function togglePlanMode(): void {
	planModeEnabled = !planModeEnabled;
	const switchElement = document.getElementById('planModeSwitch');
	if (planModeEnabled) {
		switchElement?.classList.add('active');
	} else {
		switchElement?.classList.remove('active');
	}
}

function toggleThinkingMode(): void {
	thinkingModeEnabled = !thinkingModeEnabled;

	if (thinkingModeEnabled) {
		sendStats('Thinking mode enabled');
	}

	const switchElement = document.getElementById('thinkingModeSwitch');
	const toggleLabel = document.getElementById('thinkingModeLabel');
	if (thinkingModeEnabled) {
		switchElement?.classList.add('active');
		// Show thinking intensity modal when thinking mode is enabled
		showThinkingIntensityModal();
	} else {
		switchElement?.classList.remove('active');
		// Reset to default "Thinking Mode" when turned off
		if (toggleLabel) {
			toggleLabel.textContent = 'Thinking Mode';
		}
	}
}

function getEditorContextInfo(): string | null {
	if (!currentEditorContext) {
		return null;
	}

	let contextInfo = 'in ' + currentEditorContext.fileName;

	if (currentEditorContext.selection && currentEditorContext.selectedText) {
		// Show selection range (VS Code already provides 1-based line numbers)
		const startLine = currentEditorContext.selection.start.line;
		const endLine = currentEditorContext.selection.end.line;
		contextInfo += ':' + startLine + '-' + endLine;
	} else {
		// Show just cursor position (VS Code already provides 1-based line numbers)
		contextInfo += ':' + currentEditorContext.cursorPosition.line;
	}

	return contextInfo;
}

function sendStats(eventName: string): void {
	try {
		if (typeof (window as any).umami !== 'undefined' && (window as any).umami.track) {
			(window as any).umami.track(eventName);
		}
	} catch (error) {
		console.error('Error sending stats:', error);
	}
}

function isPermissionError(content: string): boolean {
	const permissionErrorPatterns = [
		'Error: MCP config file not found',
		'Error: MCP tool',
		'Claude requested permissions to use',
		'permission denied',
		'Permission denied',
		'permission request',
		'Permission request',
		'EACCES',
		'permission error',
		'Permission error'
	];

	return permissionErrorPatterns.some(pattern =>
		content.toLowerCase().includes(pattern.toLowerCase())
	);
}

function enableYoloMode(): void {
	sendStats('YOLO mode enabled');

	// Update the checkbox
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	if (yoloModeCheckbox) {
		yoloModeCheckbox.checked = true;

		// Trigger the settings update
		updateSettings();

		// Show confirmation message
		addMessage('✅ Yolo Mode enabled! All permission checks will be bypassed for future commands.', 'system');

		// Update the warning banner
		updateYoloWarning();
	}
}

function updateSettings(): void {
	const wslEnabled = (document.getElementById('wsl-enabled') as HTMLInputElement).checked;
	const wslDistro = (document.getElementById('wsl-distro') as HTMLInputElement).value;
	const wslNodePath = (document.getElementById('wsl-node-path') as HTMLInputElement).value;
	const wslClaudePath = (document.getElementById('wsl-claude-path') as HTMLInputElement).value;
	const yoloMode = (document.getElementById('yolo-mode') as HTMLInputElement).checked;

	// Update WSL options visibility
	const wslOptions = document.getElementById('wslOptions');
	if (wslOptions) {
		wslOptions.style.display = wslEnabled ? 'block' : 'none';
	}

	// Send settings to VS Code immediately
	vscode.postMessage({
		type: 'updateSettings',
		settings: {
			'wsl.enabled': wslEnabled,
			'wsl.distro': wslDistro || 'Ubuntu',
			'wsl.nodePath': wslNodePath || '/usr/bin/node',
			'wsl.claudePath': wslClaudePath || '/usr/local/bin/claude',
			'permissions.yoloMode': yoloMode
		}
	});
}

function updateYoloWarning(): void {
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	const warning = document.getElementById('yoloWarning');

	if (!yoloModeCheckbox || !warning) {
		return; // Elements not ready yet
	}

	const yoloMode = yoloModeCheckbox.checked;
	warning.style.display = yoloMode ? 'block' : 'none';
}

function copyMessageContent(messageDiv: HTMLElement): void {
	const contentDiv = messageDiv.querySelector('.message-content');
	if (contentDiv) {
		// Get text content, preserving line breaks
		const text = contentDiv.textContent || '';

		// Copy to clipboard
		navigator.clipboard.writeText(text).then(() => {
			// Show brief feedback
			const copyBtn = messageDiv.querySelector('.copy-btn') as HTMLButtonElement;
			const originalHtml = copyBtn.innerHTML;
			copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
			copyBtn.style.color = '#4caf50';

			setTimeout(() => {
				copyBtn.innerHTML = originalHtml;
				copyBtn.style.color = '';
			}, 1000);
		}).catch(err => {
			console.error('Failed to copy message:', err);
		});
	}
}

function showThinkingIntensityModal(): void {
	// Request current settings from VS Code first
	vscode.postMessage({
		type: 'getSettings'
	});
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) {
		modal.style.display = 'flex';
	}
}

function updateStatus(text: string, state = 'ready'): void {
	statusTextDiv.textContent = text;
	statusDiv.className = `status ${state}`;
}

function updateStatusWithTotals(): void {
	if (isProcessing) {
		// While processing, show tokens and elapsed time
		const totalTokens = totalTokensInput + totalTokensOutput;
		const tokensStr = totalTokens > 0 ?
			`${totalTokens.toLocaleString()} tokens` : '0 tokens';

		let elapsedStr = '';
		if (requestStartTime) {
			const elapsedSeconds = Math.floor((Date.now() - requestStartTime) / 1000);
			elapsedStr = ` • ${elapsedSeconds}s`;
		}

		const statusText = `Processing • ${tokensStr}${elapsedStr}`;
		updateStatus(statusText, 'processing');
	} else {
		// When ready, show full info
		const costStr = totalCost > 0 ? `$${totalCost.toFixed(4)}` : '$0.00';
		const totalTokens = totalTokensInput + totalTokensOutput;
		const tokensStr = totalTokens > 0 ?
			`${totalTokens.toLocaleString()} tokens` : '0 tokens';
		const requestStr = requestCount > 0 ? `${requestCount} requests` : '';

		const statusText = `Ready • ${costStr} • ${tokensStr}${requestStr ? ` • ${requestStr}` : ''}`;
		updateStatus(statusText, 'ready');
	}
}

function startRequestTimer(startTime?: number): void {
	requestStartTime = startTime || Date.now();
	// Update status every 100ms for smooth real-time display
	requestTimer = setInterval(() => {
		if (isProcessing) {
			updateStatusWithTotals();
		}
	}, 100) as unknown as number;
}

function stopRequestTimer(): void {
	if (requestTimer) {
		clearInterval(requestTimer);
		requestTimer = null;
	}
	requestStartTime = null;
}

function showStopButton(): void {
	const stopBtn = document.getElementById('stopBtn');
	if (stopBtn) {
		stopBtn.style.display = 'flex';
	}
}

function hideStopButton(): void {
	const stopBtn = document.getElementById('stopBtn');
	if (stopBtn) {
		stopBtn.style.display = 'none';
	}
}

function disableButtons(): void {
	if (sendBtn) {
		sendBtn.disabled = true;
	}
}

function enableButtons(): void {
	if (sendBtn) {
		sendBtn.disabled = false;
	}
}

function getFileIcon(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'js': case 'jsx': case 'ts': case 'tsx': return '📄';
		case 'html': case 'htm': return '🌐';
		case 'css': case 'scss': case 'sass': return '🎨';
		case 'json': return '📋';
		case 'md': return '📝';
		case 'py': return '🐍';
		case 'java': return '☕';
		case 'cpp': case 'c': case 'h': return '⚙️';
		case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return '🖼️';
		case 'pdf': return '📄';
		case 'zip': case 'tar': case 'gz': return '📦';
		default: return '📄';
	}
}

function renderFileList(): void {
	fileList.innerHTML = '';

	filteredFiles.forEach((file, index) => {
		const fileItem = document.createElement('div');
		fileItem.className = 'file-item';
		if (index === selectedFileIndex) {
			fileItem.classList.add('selected');
		}

		fileItem.innerHTML = `
			<span class="file-icon">${getFileIcon(file.name)}</span>
			<div class="file-info">
				<div class="file-name">${file.name}</div>
				<div class="file-path">${file.path}</div>
			</div>
		`;

		fileItem.addEventListener('click', () => {
			selectFile(file);
		});

		fileList.appendChild(fileItem);
	});
}

function selectFile(file: any): void {
	// Insert file path at cursor position
	const cursorPos = messageInput.selectionStart;
	const textBefore = messageInput.value.substring(0, cursorPos);
	const textAfter = messageInput.value.substring(cursorPos);

	// Replace the @ symbol with the file path
	const beforeAt = textBefore.substring(0, textBefore.lastIndexOf('@'));
	const newText = beforeAt + '@' + file.path + ' ' + textAfter;

	messageInput.value = newText;
	messageInput.focus();

	// Set cursor position after the inserted path
	const newCursorPos = beforeAt.length + file.path.length + 2;
	messageInput.setSelectionRange(newCursorPos, newCursorPos);

	filePickerModal.style.display = 'none';
	fileSearchInput.value = '';
	selectedFileIndex = -1;
}

function filterFiles(searchTerm: string): void {
	// Send search request to backend instead of filtering locally
	vscode.postMessage({
		type: 'getWorkspaceFiles',
		searchTerm: searchTerm
	});
	selectedFileIndex = -1;
}

function updateEditorContext(contextData: any): void {
	console.log('Updating editor context:', contextData);
	currentEditorContext = contextData;
	const editorContextLine = document.getElementById('editorContextLine');

	if (!editorContextLine) {
		return;
	}

	if (!contextData.hasActiveFile) {
		editorContextLine.style.display = 'none';
		return;
	}

	// Build simple context line
	let contextText = 'in ' + contextData.fileName;

	if (contextData.selection && contextData.selectedText) {
		// Show selection range (VS Code already provides 1-based line numbers)
		const startLine = contextData.selection.start.line;
		const endLine = contextData.selection.end.line;
		contextText += ':' + startLine + '-' + endLine;
	} else {
		// Show just cursor position (VS Code already provides 1-based line numbers)
		contextText += ':' + contextData.cursorPosition.line;
	}

	editorContextLine.textContent = contextText;
	editorContextLine.style.display = 'block';
}

function parseSimpleMarkdown(markdown: string): string {
	if (!markdown) {
		return '';
	}

	// Convert basic markdown to HTML
	return markdown
		.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.*?)\*/g, '<em>$1</em>')
		.replace(/`(.*?)`/g, '<code>$1</code>')
		.replace(/\n/g, '<br>');
}

function addToolResultMessage(data: any): void {
	const shouldScroll = shouldAutoScroll(messagesDiv);
	const messageDiv = document.createElement('div');
	messageDiv.className = 'message tool-result';

	const contentDiv = document.createElement('div');
	contentDiv.className = 'message-content';

	if (typeof data === 'string') {
		contentDiv.innerHTML = parseSimpleMarkdown(data);
	} else {
		contentDiv.textContent = JSON.stringify(data, null, 2);
	}

	messageDiv.appendChild(contentDiv);
	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

// Global functions accessible from HTML onclick handlers
(window as any).toggleSettings = function() {
	const settingsModal = document.getElementById('settingsModal');
	if (settingsModal) {
		if (settingsModal.style.display === 'none') {
			// Request current settings from VS Code
			vscode.postMessage({
				type: 'getSettings'
			});
			// Request current permissions
			vscode.postMessage({
				type: 'getPermissions'
			});
			settingsModal.style.display = 'flex';
		} else {
			settingsModal.style.display = 'none';
		}
	}
};

(window as any).toggleConversationHistory = function() {
	const historyDiv = document.getElementById('conversationHistory');
	const chatContainer = document.getElementById('chatContainer');

	if (historyDiv && chatContainer) {
		if (historyDiv.style.display === 'none') {
			sendStats('History opened');
			// Show conversation history
			vscode.postMessage({
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
};

(window as any).newSession = function() {
	sendStats('New chat');

	vscode.postMessage({
		type: 'newSession'
	});
};

(window as any).togglePlanMode = togglePlanMode;

(window as any).toggleThinkingMode = toggleThinkingMode;

(window as any).showModelSelector = function() {
	const modal = document.getElementById('modelModal');
	if (modal) {
		modal.style.display = 'flex';
	}
};

(window as any).showMCPModal = function() {
	const modal = document.getElementById('mcpModal');
	if (modal) {
		modal.style.display = 'flex';
		// Load existing MCP servers
		vscode.postMessage({ type: 'loadMCPServers' });
	}
};

(window as any).showSlashCommandsModal = function() {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {
		modal.style.display = 'flex';
		// Auto-focus the search input
		setTimeout(() => {
			const searchInput = document.getElementById('slashCommandsSearch') as HTMLInputElement;
			if (searchInput) {
				searchInput.focus();
			}
		}, 100);
	}
};

(window as any).showFilePicker = function() {
	// Request initial file list from VS Code
	vscode.postMessage({
		type: 'getWorkspaceFiles',
		searchTerm: ''
	});

	// Show modal
	filePickerModal.style.display = 'flex';
	fileSearchInput.focus();
	selectedFileIndex = -1;
};

(window as any).selectImage = function() {
	// Use VS Code's native file picker instead of browser file picker
	vscode.postMessage({
		type: 'selectImageFile'
	});
};

(window as any).sendMessage = sendMessage;

(window as any).stopRequest = function() {
	sendStats('Stop request');

	vscode.postMessage({
		type: 'stopRequest'
	});
	const stopBtn = document.getElementById('stopBtn');
	if (stopBtn) {
		stopBtn.style.display = 'none';
	}
};

(window as any).enableYoloMode = enableYoloMode;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
	console.log('UI initialized');
	console.log('Communication test - vscode API:', typeof vscode);
	console.log('Elements found:', {
		messageInput: !!messageInput,
		sendBtn: !!sendBtn,
		messagesDiv: !!messagesDiv
	});

	// Set up message input event listeners
	messageInput.addEventListener('keydown', function(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (sendBtn.disabled){
				return;
			}
			sendMessage();
		} else if (e.key === '@' && !e.ctrlKey && !e.metaKey) {
			// Don't prevent default, let @ be typed first
			setTimeout(() => {
				(window as any).showFilePicker();
			}, 0);
		} else if (e.key === 'Escape' && filePickerModal.style.display === 'flex') {
			e.preventDefault();
			filePickerModal.style.display = 'none';
			fileSearchInput.value = '';
			selectedFileIndex = -1;
		}
	});

	// File picker event listeners
	fileSearchInput.addEventListener('input', (e) => {
		filterFiles((e.target as HTMLInputElement).value);
	});

	fileSearchInput.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedFileIndex = Math.min(selectedFileIndex + 1, filteredFiles.length - 1);
			renderFileList();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedFileIndex = Math.max(selectedFileIndex - 1, -1);
			renderFileList();
		} else if (e.key === 'Enter' && selectedFileIndex >= 0) {
			e.preventDefault();
			selectFile(filteredFiles[selectedFileIndex]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			filePickerModal.style.display = 'none';
			fileSearchInput.value = '';
			selectedFileIndex = -1;
		}
	});

	// Close modal when clicking outside
	filePickerModal.addEventListener('click', (e) => {
		if (e.target === filePickerModal) {
			filePickerModal.style.display = 'none';
			fileSearchInput.value = '';
			selectedFileIndex = -1;
		}
	});

	// Listen for messages from the extension
	window.addEventListener('message', function(event: MessageEvent) {
		console.log('Received message from extension:', event.data.type);
		const message = event.data;

		switch (message.type) {
			case 'addMessage':
				addMessage(message.content, message.messageType);
				break;
			case 'addToolUse':
				addToolUseMessage(message.data);
				break;
			case 'workspaceFiles':
				filteredFiles = message.data;
				selectedFileIndex = -1;
				renderFileList();
				break;
			case 'setProcessing':
				isProcessing = message.data.isProcessing;
				if (isProcessing) {
					startRequestTimer(message.data.requestStartTime);
					showStopButton();
					disableButtons();
				} else {
					stopRequestTimer();
					hideStopButton();
					enableButtons();
				}
				updateStatusWithTotals();
				break;
			case 'ready':
				console.log('Extension ready');
				break;
			case 'modelSelected':
				console.log('Model selected:', message.model);
				break;
			case 'platformInfo':
				console.log('Platform info received');
				break;
			case 'settingsData':
				console.log('Settings data received');
				break;
			case 'editorContext':
				console.log('Editor context updated');
				updateEditorContext(message.data);
				break;
			case 'userInput':
				console.log('User input received');
				if (message.data.trim()) {
					addMessage(parseSimpleMarkdown(message.data), 'user');
				}
				break;
			case 'output':
				console.log('Output received');
				if (message.data.trim()) {
					let displayData = message.data;

					// Check if this is a usage limit message with Unix timestamp
					const usageLimitMatch = displayData.match(/Claude AI usage limit reached\\|(\\d+)/);
					if (usageLimitMatch) {
						const timestamp = parseInt(usageLimitMatch[1]);
						const date = new Date(timestamp * 1000);
						const readableDate = date.toLocaleString(
							undefined,
							{
								weekday: 'short',
								month: 'short',
								day: 'numeric',
								hour: 'numeric',
								minute: '2-digit',
								second: '2-digit',
								hour12: true,
								timeZoneName: 'short',
								year: 'numeric'
							}
						);
						displayData = displayData.replace(usageLimitMatch[0], `Claude AI usage limit reached: ${readableDate}`);
					}

					addMessage(parseSimpleMarkdown(displayData), 'claude');
				}
				updateStatusWithTotals();
				break;
			case 'loading':
				console.log('Loading message received');
				addMessage(message.data, 'system');
				updateStatusWithTotals();
				break;
			case 'clearLoading':
				console.log('Clear loading received');
				// Remove the last loading message
				const messages = messagesDiv.children;
				if (messages.length > 0) {
					const lastMessage = messages[messages.length - 1];
					if (lastMessage.classList.contains('system')) {
						lastMessage.remove();
					}
				}
				updateStatusWithTotals();
				break;
			case 'error':
				console.log('Error received');
				if (message.data.trim()) {
					// Check if this is an install required error
					if (message.data.includes('Install claude code first') ||
						message.data.includes('command not found') ||
						message.data.includes('ENOENT')) {
						sendStats('Install required');
					}
					addMessage(message.data, 'error');
				}
				updateStatusWithTotals();
				break;
			case 'toolUse':
				console.log('Tool use received');
				if (typeof message.data === 'object') {
					addToolUseMessage(message.data);
				} else if (message.data.trim()) {
					addMessage(message.data, 'tool');
				}
				break;
			case 'toolResult':
				console.log('Tool result received');
				addToolResultMessage(message.data);
				break;
			case 'thinking':
				console.log('Thinking received');
				if (message.data.trim()) {
					addMessage('💭 Thinking...' + parseSimpleMarkdown(message.data), 'thinking');
				}
				break;
			case 'sessionInfo':
				console.log('Session info received');
				// Session info handling can be added later if needed
				break;
			case 'updateTokens':
				console.log('Update tokens received');
				// Update token totals in real-time
				totalTokensInput = message.data.totalTokensInput || 0;
				totalTokensOutput = message.data.totalTokensOutput || 0;

				// Update status bar immediately
				updateStatusWithTotals();

				// Show detailed token breakdown for current message
				const currentTotal = (message.data.currentInputTokens || 0) + (message.data.currentOutputTokens || 0);
				if (currentTotal > 0) {
					let tokenBreakdown = `📊 Tokens: ${currentTotal.toLocaleString()}`;

					if (message.data.cacheCreationTokens || message.data.cacheReadTokens) {
						const cacheInfo = [];
						if (message.data.cacheCreationTokens) {
							cacheInfo.push(`${message.data.cacheCreationTokens.toLocaleString()} cache created`);
						}
						if (message.data.cacheReadTokens) {
							cacheInfo.push(`${message.data.cacheReadTokens.toLocaleString()} cache read`);
						}
						tokenBreakdown += ` • ${cacheInfo.join(' • ')}`;
					}

					addMessage(tokenBreakdown, 'system');
				}
				break;
			case 'updateTotals':
				console.log('Update totals received');
				// Update local tracking variables
				totalCost = message.data.totalCost || 0;
				totalTokensInput = message.data.totalTokensInput || 0;
				totalTokensOutput = message.data.totalTokensOutput || 0;
				requestCount = message.data.requestCount || 0;

				// Update status bar with new totals
				updateStatusWithTotals();
				break;
			case 'showRestoreOption':
				console.log('Show restore option received');
				// Restore option handling can be added later if needed
				break;
			default:
				console.log('Unknown message type:', message.type);
		}
	});
});
