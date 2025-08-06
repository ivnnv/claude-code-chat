// Import CSS for RSBuild bundling
import './index.css';

// Complete original JavaScript functionality extracted from ui.ts.back
declare const acquireVsCodeApi: () => any;

const vscode = acquireVsCodeApi();
let messagesDiv: HTMLElement;
let messageInput: HTMLTextAreaElement;
let sendBtn: HTMLButtonElement;
let statusTextDiv: HTMLElement;
let currentCheckpoint: {sha: string, timestamp: string} | null = null;
let filePickerModal: HTMLElement;
let fileSearchInput: HTMLInputElement;
let fileList: HTMLElement;
let _imageBtn: HTMLButtonElement;

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
let messageCounter = 0;

function shouldAutoScroll(messagesDiv: HTMLElement | null): boolean {
	if (!messagesDiv) {return false;}

	const threshold = 100; // pixels from bottom
	const scrollTop = messagesDiv.scrollTop;
	const scrollHeight = messagesDiv.scrollHeight;
	const clientHeight = messagesDiv.clientHeight;

	return (scrollTop + clientHeight >= scrollHeight - threshold);
}

function scrollToBottomIfNeeded(messagesDiv: HTMLElement | null, shouldScroll: boolean | null = null): void {
	if (!messagesDiv) {return;}

	// If shouldScroll is not provided, check current scroll position
	if (shouldScroll === null) {
		shouldScroll = shouldAutoScroll(messagesDiv);
	}

	if (shouldScroll) {
		messagesDiv.scrollTop = messagesDiv.scrollHeight;
	}
}

function addMessage(content: string, type = 'claude'): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {return;}

	const shouldScroll = shouldAutoScroll(messagesDiv);

	// Generate unique ID for this message
	messageCounter++;
	const messageId = `msg-${type}-${messageCounter}`;

	// Handle new userMessage structure
	if (type === 'user') {
		const messageDiv = document.createElement('div');
		messageDiv.id = messageId;
		messageDiv.className = 'userMessage';

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
		contentDiv.innerHTML = userText; // Clean user text without file reference

		// Add copy button
		const copyBtn = document.createElement('button');
		copyBtn.className = 'copy-btn';
		copyBtn.title = 'Copy message';
		copyBtn.onclick = () => copyMessageContent(contentDiv);
		copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

		// Position copy button absolutely in content area
		copyBtn.style.position = 'absolute';
		copyBtn.style.top = '8px';
		copyBtn.style.right = '8px';
		copyBtn.style.opacity = '0';
		copyBtn.style.transition = 'opacity 0.2s ease';

		contentDiv.style.position = 'relative';
		contentDiv.appendChild(copyBtn);
		messageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle system messages with new structure
	if (type === 'system') {
		const messageDiv = document.createElement('div');
		messageDiv.id = messageId;
		messageDiv.className = 'systemMessage';

		// This type of message doesnt need a header yet

		// Create content
		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';
		contentDiv.innerHTML = content;
		messageDiv.appendChild(contentDiv);

		messagesDiv.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	// Handle other message types (keep existing structure but add IDs with proper order)
	const messageDiv = document.createElement('div');
	messageDiv.id = messageId;
	messageDiv.className = `message ${type}`;

	// Only add copy button for non-system messages, no headers
	if (type === 'claude' || type === 'error') {
		// Add copy button directly to message div
		const copyBtn = document.createElement('button');
		copyBtn.className = 'copy-btn';
		copyBtn.title = 'Copy message';
		copyBtn.onclick = () => copyMessageContent(messageDiv);
		copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

		// Position copy button absolutely in top-right
		copyBtn.style.position = 'absolute';
		copyBtn.style.top = '8px';
		copyBtn.style.right = '8px';
		copyBtn.style.opacity = '0';
		copyBtn.style.transition = 'opacity 0.2s ease';

		messageDiv.style.position = 'relative';
		messageDiv.appendChild(copyBtn);
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

function addToolUseMessage(data: any): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {return;}
	const shouldScroll = shouldAutoScroll(messagesDiv);

	// Only show diff content for Edit, MultiEdit, and Write tools - skip everything else
	if (data.rawInput && (data.toolName === 'Edit' || data.toolName === 'MultiEdit' || data.toolName === 'Write')) {
		const messageDiv = document.createElement('div');
		messageDiv.className = 'message tool-result';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'tool-input-content';

		// Show only the diff content without headers or containers
		let formattedContent = '';
		if (data.toolName === 'Edit') {
			formattedContent = formatEditToolDiff(data.rawInput);
		} else if (data.toolName === 'MultiEdit') {
			formattedContent = formatMultiEditToolDiff(data.rawInput);
		} else if (data.toolName === 'Write') {
			formattedContent = formatWriteToolDiff(data.rawInput);
		}

		if (formattedContent.trim()) {
			contentDiv.innerHTML = formattedContent;
			messageDiv.appendChild(contentDiv);
			messagesDiv.appendChild(messageDiv);
			scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		}
	}
	// Skip all other tools (Read, etc.) - no visual output needed
}

function sendMessage(): void {
	const text = messageInput.value.trim();

	if (text) {
		// Enhance message with editor context for Claude (backend needs this)
		let enhancedText = text;
		const contextInfo = getEditorContextInfo();
		if (contextInfo) {
			enhancedText = contextInfo + '\n\n' + text;
		}
		sendStats('Send message');

		vscode.postMessage({
			type: 'sendMessage',
			text: enhancedText, // Full enhanced text for Claude
			planMode: planModeEnabled,
			thinkingMode: thinkingModeEnabled,
			editorContext: currentEditorContext, // Also send context for UI
			originalUserText: text // Send clean user text separately for UI
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

	const switchElement = document.getElementById('thinkingModeSwitch')!;
	const toggleLabel = document.getElementById('thinkingModeLabel');
	if (thinkingModeEnabled) {
		switchElement.classList.add('active');
		// Show thinking intensity modal when thinking mode is enabled
		showThinkingIntensityModal();
	} else {
		switchElement.classList.remove('active');
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

	// extension provider already provides 1-based line numbers
	if (currentEditorContext.selection && currentEditorContext.selectedText) {
		const startLine = currentEditorContext.selection.start.line;
		const endLine = currentEditorContext.selection.end.line;
		contextInfo += ':' + startLine + '-' + endLine;
	} else {
		const cursorLine = currentEditorContext.cursorPosition.line;
		contextInfo += ':' + cursorLine;
	}
	return contextInfo;
}

function sendStats(_eventName: string): void {
	// User tracking removed in this fork for privacy
	// Original extension used Umami analytics to track user interactions
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

function addTokenInfoToLastMessage(tokenInfo: string): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {return;}

	const claudeMessages = messagesDiv.querySelectorAll('.message.claude');
	const lastClaudeMessage = claudeMessages[claudeMessages.length - 1] as HTMLElement;

	if (lastClaudeMessage) {
		const contentDiv = lastClaudeMessage.querySelector('.message-content');
		if (contentDiv && !lastClaudeMessage.querySelector('.token-info-icon')) {
			// Create info icon
			const infoIcon = document.createElement('span');
			infoIcon.className = 'token-info-icon';
			infoIcon.innerHTML = ' <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.5; cursor: pointer; margin-left: 4px; vertical-align: text-bottom;"><circle cx="12" cy="12" r="10"/><path d="m12 6h.01M12 10v6"/></svg>';
			infoIcon.title = 'Click to view token usage';
			infoIcon.style.opacity = '0.5';
			infoIcon.style.cursor = 'pointer';

			// Store token info as data attribute
			infoIcon.setAttribute('data-token-info', tokenInfo);

			// Add click handler to show token info
			infoIcon.addEventListener('click', function() {
				const existingTokenMsg = document.querySelector('.token-info-message');
				if (existingTokenMsg) {
					existingTokenMsg.remove();
				} else {
					const tokenMsg = document.createElement('div');
					tokenMsg.className = 'message system token-info-message';
					tokenMsg.style.fontSize = '11px';
					tokenMsg.style.opacity = '0.7';
					tokenMsg.style.marginTop = '4px';
					tokenMsg.textContent = tokenInfo;

					// Insert after the current message
					lastClaudeMessage.insertAdjacentElement('afterend', tokenMsg);

					// Auto-hide after 5 seconds
					setTimeout(() => {
						if (tokenMsg.parentNode) {
							tokenMsg.remove();
						}
					}, 5000);
				}
			});

			// Append to the end of content
			contentDiv.appendChild(infoIcon);
		}
	}
}

function addFileInfoToLastMessage(filePath: string): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {return;}

	const claudeMessages = messagesDiv.querySelectorAll('.message.claude');
	const lastClaudeMessage = claudeMessages[claudeMessages.length - 1] as HTMLElement;

	if (lastClaudeMessage) {
		const contentDiv = lastClaudeMessage.querySelector('.message-content');
		if (contentDiv && !lastClaudeMessage.querySelector('.file-info-icon')) {
			// Create file icon
			const fileIcon = document.createElement('span');
			fileIcon.className = 'file-info-icon';
			fileIcon.innerHTML = ' <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.5; cursor: pointer; margin-left: 4px; vertical-align: text-bottom;"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>';
			fileIcon.title = 'Click to view file path';
			fileIcon.style.opacity = '0.5';
			fileIcon.style.cursor = 'pointer';

			// Store file path as data attribute
			fileIcon.setAttribute('data-file-path', filePath);

			// Add click handler to show file path
			fileIcon.addEventListener('click', function() {
				const existingFileMsg = document.querySelector('.file-info-message');
				if (existingFileMsg) {
					existingFileMsg.remove();
				} else {
					const fileMsg = document.createElement('div');
					fileMsg.className = 'message system file-info-message';
					fileMsg.style.fontSize = '11px';
					fileMsg.style.opacity = '0.7';
					fileMsg.style.marginTop = '4px';
					fileMsg.style.fontFamily = 'var(--vscode-editor-font-family)';
					fileMsg.textContent = '📁 ' + filePath;

					// Insert after the current message
					lastClaudeMessage.insertAdjacentElement('afterend', fileMsg);

					// Auto-hide after 5 seconds
					setTimeout(() => {
						if (fileMsg.parentNode) {
							fileMsg.remove();
						}
					}, 5000);
				}
			});

			// Append to the end of content
			contentDiv.appendChild(fileIcon);
		}
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
	// Update indicator in popover
	const statusIndicator = document.getElementById('statusIndicator');
	if (statusIndicator) {
		statusIndicator.className = `status-indicator ${state}`;
	}
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
	currentEditorContext = contextData;
	const editorContextLine = document.getElementById('editorContextLine')!;


	if (!contextData.hasActiveFile) {
		editorContextLine.style.display = 'none';
		return;
	}

	// Build simple context line
	let contextText = 'in ' + contextData.fileName;

	if (contextData.selection && contextData.selectedText) {
		// VS Code already provides 1-based line numbers
		const startLine = contextData.selection.start.line;
		const endLine = contextData.selection.end.line;
		contextText += ':' + startLine + '-' + endLine;
	} else {
		// VS Code already provides 1-based line numbers
		const cursorLine = contextData.cursorPosition.line;
		contextText += ':' + cursorLine;
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

function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function _createExpandableInput(toolInput: string, rawInput: any): string {
	try {
		let html = toolInput.replace(/\[expand\]/g, '<span class="expand-btn" style="cursor: pointer;">expand</span>');
		// Store raw input data for expansion
		if (rawInput && typeof rawInput === 'object') {
			let btnIndex = 0;
			html = html.replace(/<span class="expand-btn"[^>]*>expand<\/span>/g, (_match) => {
				const keys = Object.keys(rawInput);
				const key = keys[btnIndex] || '';
				const value = rawInput[key] || '';
				const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
				const escapedValue = valueStr.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
				btnIndex++;
				return `<span class="expand-btn" data-key="${key}" data-value="${escapedValue}" onclick="toggleExpand(this)">expand</span>`;
			});
		}
		return html;
	} catch (error) {
		console.error('Error creating expandable input:', error);
		return toolInput;
	}
}

function formatFilePath(filePath: string): string {
	const parts = filePath.split('/');
	if (parts.length > 3) {
		return '.../' + parts.slice(-2).join('/');
	}
	return filePath;
}

function openFileInEditor(filePath: string): void {
	vscode.postMessage({
		type: 'openFile',
		filePath: filePath
	});
}

function formatToolInputUI(input: any): string {
	if (!input || typeof input !== 'object') {
		const str = String(input);
		if (str.length > 100) {
			const truncateAt = 97;
			const truncated = str.substring(0, truncateAt);
			const inputId = 'input_' + Math.random().toString(36).substr(2, 9);
			return '<span id="' + inputId + '_visible">' + escapeHtml(truncated) + '</span>' +
				   '<span id="' + inputId + '_ellipsis">...</span>' +
				   '<span id="' + inputId + '_hidden" style="display: none;">' + escapeHtml(str.substring(truncateAt)) + '</span>' +
				   '<div class="diff-expand-container">' +
				   '<button class="result-expand-btn" data-result-id="' + inputId + '" style="cursor: pointer;">Show more</button>' +
				   '</div>';
		}
		return str;
	}
	// Special handling for Read tool with file_path - don't show standalone path
	if (input.file_path && Object.keys(input).length === 1) {
		// Return empty string to avoid showing standalone file path
		return '';
	}
	let result = '';
	let isFirst = true;
	for (const [key, value] of Object.entries(input)) {
		const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
		if (!isFirst) {result += '\n';}
		isFirst = false;
		// Skip file_path display to avoid duplicate paths (shown in diff headers instead)
		if (key === 'file_path') {
			// Skip showing file_path to avoid duplication with diff headers
			continue;
		} else if (valueStr.length > 100) {
			const truncated = valueStr.substring(0, 97) + '...';
			const escapedValue = valueStr.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
			result += '<span class="expandable-item"><strong>' + key + ':</strong> ' + truncated + ' <span class="expand-btn" data-key="' + key + '" data-value="' + escapedValue + '" style="cursor: pointer;">expand</span></span>';
		} else {
			result += '<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

function formatEditToolDiff(input: any): string {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}
	// Check if this is an Edit tool (has file_path, old_string, new_string)
	if (!input.file_path || !input.old_string || !input.new_string) {
		return formatToolInputUI(input);
	}
	// Format file path with better display
	const formattedPath = formatFilePath(input.file_path);
	// Create diff view
	const oldLines = input.old_string.split('\n');
	const newLines = input.new_string.split('\n');
	const allLines = [...oldLines.map((line: string) => ({type: 'removed', content: line})),
					 ...newLines.map((line: string) => ({type: 'added', content: line}))];
	const maxLines = 6;
	const shouldTruncate = allLines.length > maxLines;
	const visibleLines = shouldTruncate ? allLines.slice(0, maxLines) : allLines;
	const hiddenLines = shouldTruncate ? allLines.slice(maxLines) : [];
	let result = '<div class="diff-container">';
	let changesRow = '<div class="diff-changes-row">';
	changesRow += '<span class="diff-changes-label">Changes:</span>';
	if (currentCheckpoint) {
		const timeAgo = new Date(currentCheckpoint.timestamp).toLocaleTimeString();
		changesRow += '<div class="diff-timestamp-group">';
		changesRow += '<span class="diff-timestamp">(' + timeAgo + ')</span>';
		changesRow += '<button class="diff-restore-btn" onclick="restoreToCommit(\'' + currentCheckpoint.sha + '\')" title="Restore checkpoint">↶</button>';
		changesRow += '</div>';
	}
	changesRow += '</div>';

	let filePathRow = '<div class="diff-filepath-row"><span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '">' + formattedPath + '</span></div>';

	result += '<div class="diff-header">' + changesRow + filePathRow + '</div>';
	// Create a unique ID for this diff
	const diffId = 'diff_' + Math.random().toString(36).substr(2, 9);
	// Show visible lines
	result += '<div id="' + diffId + '_visible">';
	for (const line of visibleLines) {
		const prefix = line.type === 'removed' ? '- ' : '+ ';
		const cssClass = line.type === 'removed' ? 'removed' : 'added';
		result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
	}
	result += '</div>';
	// Show hidden lines (initially hidden)
	if (shouldTruncate) {
		result += '<div id="' + diffId + '_hidden" style="display: none;">';
		for (const line of hiddenLines) {
			const prefix = line.type === 'removed' ? '- ' : '+ ';
			const cssClass = line.type === 'removed' ? 'removed' : 'added';
			result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
		}
		result += '</div>';
		// Add expand button
		result += '<div class="diff-expand-container">';
		result += '<button class="diff-expand-btn" data-diff-id="' + diffId + '" style="cursor: pointer;">Show ' + hiddenLines.length + ' more lines</button>';
		result += '</div>';
	}
	result += '</div>';
	// Add other properties if they exist
	for (const [key, value] of Object.entries(input)) {
		if (key !== 'file_path' && key !== 'old_string' && key !== 'new_string') {
			const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
			result += '\n<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

function formatSingleEdit(edit: any, editNumber: number): string {
	let result = '<div class="single-edit">';
	result += '<div class="edit-number">Edit #' + editNumber + '</div>';
	// Create diff view for this single edit
	const oldLines = edit.old_string.split('\n');
	const newLines = edit.new_string.split('\n');
	// Show removed lines
	for (const line of oldLines) {
		result += '<div class="diff-line removed">- ' + escapeHtml(line) + '</div>';
	}
	// Show added lines
	for (const line of newLines) {
		result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
	}
	result += '</div>';
	return result;
}

function formatMultiEditToolDiff(input: any): string {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}
	// Check if this is a MultiEdit tool (has file_path and edits array)
	if (!input.file_path || !input.edits || !Array.isArray(input.edits)) {
		return formatToolInputUI(input);
	}
	// Format file path with better display
	const formattedPath = formatFilePath(input.file_path);
	// Count total lines across all edits for truncation
	let totalLines = 0;
	for (const edit of input.edits) {
		if (edit.old_string && edit.new_string) {
			const oldLines = edit.old_string.split('\n');
			const newLines = edit.new_string.split('\n');
			totalLines += oldLines.length + newLines.length;
		}
	}
	const maxLines = 6;
	const shouldTruncate = totalLines > maxLines;
	let result = '<div class="diff-container">';
	result += '<div class="diff-header">Changes (' + input.edits.length + ' edit' + (input.edits.length > 1 ? 's' : '') + '): <span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer; font-size: 10px; opacity: 0.7; font-weight: normal;">' + formattedPath + '</span></div>';
	// Create a unique ID for this diff
	const diffId = 'multiedit_' + Math.random().toString(36).substr(2, 9);
	let currentLineCount = 0;
	const visibleEdits = [];
	const hiddenEdits = [];
	// Determine which edits to show/hide based on line count
	for (let i = 0; i < input.edits.length; i++) {
		const edit = input.edits[i];
		if (!edit.old_string || !edit.new_string) {continue;}
		const oldLines = edit.old_string.split('\n');
		const newLines = edit.new_string.split('\n');
		const editLines = oldLines.length + newLines.length;
		if (shouldTruncate && currentLineCount + editLines > maxLines && visibleEdits.length > 0) {
			hiddenEdits.push(edit);
		} else {
			visibleEdits.push(edit);
			currentLineCount += editLines;
		}
	}
	// Show visible edits
	result += '<div id="' + diffId + '_visible">';
	for (let i = 0; i < visibleEdits.length; i++) {
		const edit = visibleEdits[i];
		if (i > 0) {result += '<div class="diff-edit-separator"></div>';}
		result += formatSingleEdit(edit, i + 1);
	}
	result += '</div>';
	// Show hidden edits (initially hidden)
	if (hiddenEdits.length > 0) {
		result += '<div id="' + diffId + '_hidden" style="display: none;">';
		for (let i = 0; i < hiddenEdits.length; i++) {
			const edit = hiddenEdits[i];
			result += '<div class="diff-edit-separator"></div>';
			result += formatSingleEdit(edit, visibleEdits.length + i + 1);
		}
		result += '</div>';
		// Add expand button
		result += '<div class="diff-expand-container">';
		result += '<button class="diff-expand-btn" data-diff-id="' + diffId + '" style="cursor: pointer;">Show ' + hiddenEdits.length + ' more edit' + (hiddenEdits.length > 1 ? 's' : '') + '</button>';
		result += '</div>';
	}
	result += '</div>';
	// Add other properties if they exist
	for (const [key, value] of Object.entries(input)) {
		if (key !== 'file_path' && key !== 'edits') {
			const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
			result += '\n<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

function formatWriteToolDiff(input: any): string {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}
	// Check if this is a Write tool (has file_path and content)
	if (!input.file_path || !input.content) {
		return formatToolInputUI(input);
	}
	// Format file path with better display
	const formattedPath = formatFilePath(input.file_path);
	// Create diff view showing all content as additions
	const contentLines = input.content.split('\n');
	const maxLines = 6;
	const shouldTruncate = contentLines.length > maxLines;
	const visibleLines = shouldTruncate ? contentLines.slice(0, maxLines) : contentLines;
	const hiddenLines = shouldTruncate ? contentLines.slice(maxLines) : [];
	let result = '<div class="diff-container">';
	result += '<div class="diff-header">New file content: <span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer; font-size: 10px; opacity: 0.7; font-weight: normal;">' + formattedPath + '</span></div>';
	// Create a unique ID for this diff
	const diffId = 'write_' + Math.random().toString(36).substr(2, 9);
	// Show visible lines (all as additions)
	result += '<div id="' + diffId + '_visible">';
	for (const line of visibleLines) {
		result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
	}
	result += '</div>';
	// Show hidden lines (initially hidden)
	if (shouldTruncate) {
		result += '<div id="' + diffId + '_hidden" style="display: none;">';
		for (const line of hiddenLines) {
			result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
		}
		result += '</div>';
		// Add expand button
		result += '<div class="diff-expand-container">';
		result += '<button class="diff-expand-btn" data-diff-id="' + diffId + '" style="cursor: pointer;">Show ' + hiddenLines.length + ' more lines</button>';
		result += '</div>';
	}
	result += '</div>';
	// Add other properties if they exist
	for (const [key, value] of Object.entries(input)) {
		if (key !== 'file_path' && key !== 'content') {
			const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
			result += '\n<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

function _hideEditorContext(): void {
	const editorContextLine = document.getElementById('editorContextLine');
	if (editorContextLine) {
		editorContextLine.style.display = 'none';
	}
}

function adjustTextareaHeight(): void {
	// Reset height to calculate new height
	messageInput.style.height = 'auto';
	// Get computed styles
	const computedStyle = getComputedStyle(messageInput);
	const lineHeight = parseFloat(computedStyle.lineHeight);
	const paddingTop = parseFloat(computedStyle.paddingTop);
	const paddingBottom = parseFloat(computedStyle.paddingBottom);
	const borderTop = parseFloat(computedStyle.borderTopWidth);
	const borderBottom = parseFloat(computedStyle.borderBottomWidth);
	// Calculate heights
	const scrollHeight = messageInput.scrollHeight;
	const maxRows = 5;
	const minHeight = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;
	const maxHeight = (lineHeight * maxRows) + paddingTop + paddingBottom + borderTop + borderBottom;
	// Set height
	if (scrollHeight <= maxHeight) {
		messageInput.style.height = Math.max(scrollHeight, minHeight) + 'px';
	} else {
		messageInput.style.height = maxHeight + 'px';
	}
}

function loadMCPServers(): void {
	vscode.postMessage({ type: 'loadMCPServers' });
}

function showAddServerForm(): void {
	const addServerBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addServerForm = document.getElementById('addServerForm');
	if (addServerBtn) {addServerBtn.style.display = 'none';}
	if (popularServers) {popularServers.style.display = 'none';}
	if (addServerForm) {addServerForm.style.display = 'block';}
}

function hideAddServerForm(): void {
	const addServerBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addServerForm = document.getElementById('addServerForm');
	if (addServerBtn) {addServerBtn.style.display = 'block';}
	if (popularServers) {popularServers.style.display = 'block';}
	if (addServerForm) {addServerForm.style.display = 'none';}
	// Reset form title and button
	const formTitle = document.querySelector('#addServerForm h5');
	if (formTitle) {formTitle.remove();}
	const submitBtn = document.querySelector('#addServerForm .btn');
	if (submitBtn) {submitBtn.textContent = 'Add Server';}
}

function addToolResultMessage(data: any): void {
	const shouldScroll = shouldAutoScroll(messagesDiv);
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
	const messageDiv = document.createElement('div');
	messageDiv.className = data.isError ? 'message error' : 'message tool-result';
	// Create header
	const headerDiv = document.createElement('div');
	headerDiv.className = 'message-header';
	const iconDiv = document.createElement('div');
	iconDiv.className = data.isError ? 'message-icon error' : 'message-icon';
	iconDiv.style.background = data.isError ?
		'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' :
		'linear-gradient(135deg, #1cc08c 0%, #16a974 100%)';
	iconDiv.textContent = data.isError ? '❌' : '✅';
	const labelDiv = document.createElement('div');
	labelDiv.className = 'message-label';
	labelDiv.textContent = data.isError ? 'Error' : 'Result';
	headerDiv.appendChild(iconDiv);
	headerDiv.appendChild(labelDiv);
	messageDiv.appendChild(headerDiv);
	// Add content
	const contentDiv = document.createElement('div');
	contentDiv.className = 'message-content';
	// Check if it's a tool result and truncate appropriately
	let content = data.content;
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

// Global functions accessible from HTML onclick handlers
function toggleSettings(): void {
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
}

function toggleStatusInfo(): void {
	const statusPopover = document.getElementById('statusPopover');
	if (statusPopover) {
		if (statusPopover.style.display === 'none') {
			statusPopover.style.display = 'block';
		} else {
			statusPopover.style.display = 'none';
		}
	}
}

function toggleConversationHistory(): void {
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
}

function newSession(): void {
	sendStats('New chat');

	// Clear any existing checkpoint since we're starting fresh
	currentCheckpoint = null;

	vscode.postMessage({
		type: 'newSession'
	});
}

// Global scope assignments moved to end of file

// Duplicate functions removed - using properly typed versions defined later

function showFilePicker(): void {
	// Request initial file list from VS Code
	vscode.postMessage({
		type: 'getWorkspaceFiles',
		searchTerm: ''
	});

	// Show modal
	filePickerModal.style.display = 'flex';
	fileSearchInput.focus();
	selectedFileIndex = -1;
}

function selectImage(): void {
	// Use VS Code's native file picker instead of browser file picker
	vscode.postMessage({
		type: 'selectImageFile'
	});
}

// Global scope assignments moved to end of file

function showMCPModal(): void {
	const modal = document.getElementById('mcpModal');
	if (modal) {
		modal.style.display = 'flex';
		loadMCPServers();
	}
}

function hideMCPModal(): void {
	const modal = document.getElementById('mcpModal');
	if (modal) {
		modal.style.display = 'none';
		hideAddServerForm();
	}
}

// Global scope assignments moved to end of file

// Duplicate updateServerForm removed - using the one defined later with proper typing

function saveMCPServer(): void {
	sendStats('MCP server added');
	const name = (document.getElementById('serverName') as HTMLInputElement).value.trim();
	const type = (document.getElementById('serverType') as HTMLSelectElement).value;
	if (!name) {
		// Use a simple notification instead of alert which is blocked
		const notification = document.createElement('div');
		notification.textContent = 'Server name is required';
		notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
		document.body.appendChild(notification);
		setTimeout(() => notification.remove(), 3000);
		return;
	}
	// If editing, we can use the same name; if adding, check for duplicates
	if (!editingServerName) {
		const serversList = document.getElementById('mcpServersList');
		if (!serversList) {return;}
		const existingServers = serversList.querySelectorAll('.server-name');
		for (let i = 0; i < existingServers.length; i++) {
			const server = existingServers[i];
			if (server.textContent === name) {
				const notification = document.createElement('div');
				notification.textContent = `Server "${name}" already exists`;
				notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
				document.body.appendChild(notification);
				setTimeout(() => notification.remove(), 3000);
				return;
			}
		}
	}
	const serverConfig: any = { type };
	if (type === 'stdio') {
		const command = (document.getElementById('serverCommand') as HTMLInputElement).value.trim();
		if (!command) {
			const notification = document.createElement('div');
			notification.textContent = 'Command is required for stdio servers';
			notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
			document.body.appendChild(notification);
			setTimeout(() => notification.remove(), 3000);
			return;
		}
		serverConfig.command = command;
		const argsText = (document.getElementById('serverArgs') as HTMLTextAreaElement).value.trim();
		if (argsText) {
			serverConfig.args = argsText.split('\n').filter(line => line.trim());
		}
		const envText = (document.getElementById('serverEnv') as HTMLTextAreaElement).value.trim();
		if (envText) {
			serverConfig.env = {};
			envText.split('\n').forEach(line => {
				const [key, ...valueParts] = line.split('=');
				if (key && valueParts.length > 0) {
					serverConfig.env[key.trim()] = valueParts.join('=').trim();
				}
			});
		}
	} else if (type === 'http' || type === 'sse') {
		const url = (document.getElementById('serverUrl') as HTMLInputElement).value.trim();
		if (!url) {
			const notification = document.createElement('div');
			notification.textContent = 'URL is required for HTTP/SSE servers';
			notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
			document.body.appendChild(notification);
			setTimeout(() => notification.remove(), 3000);
			return;
		}
		serverConfig.url = url;
		const headersText = (document.getElementById('serverHeaders') as HTMLTextAreaElement).value.trim();
		if (headersText) {
			serverConfig.headers = {};
			headersText.split('\n').forEach(line => {
				const [key, ...valueParts] = line.split('=');
				if (key && valueParts.length > 0) {
					serverConfig.headers[key.trim()] = valueParts.join('=').trim();
				}
			});
		}
	}
	vscode.postMessage({
		type: 'saveMCPServer',
		name: name,
		config: serverConfig
	});
	hideAddServerForm();
}

function deleteMCPServer(serverName: string): void {
	// Just delete without confirmation
	vscode.postMessage({
		type: 'deleteMCPServer',
		name: serverName
	});
}

function addPopularServer(name: string, config: any): void {
	vscode.postMessage({
		type: 'saveMCPServer',
		serverName: name,
		config
	});
}

function toggleResultExpansion(resultId: string): void {
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

function toggleExpand(button: HTMLElement): void {
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

function toggleDiffExpansion(diffId: string): void {
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

// Additional essential utility functions from original ui.ts

// Duplicate functions removed - using original implementations above

function hideThinkingIntensityModal(): void {
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) {modal.style.display = 'none';}
}

function setThinkingIntensity(intensity: string): void {
	const toggleLabel = document.getElementById('thinkingModeLabel');
	if (toggleLabel) {
		toggleLabel.textContent = `Thinking Mode (${intensity})`;
	}

	vscode.postMessage({
		type: 'setThinkingIntensity',
		intensity: intensity
	});

	hideThinkingIntensityModal();
}

function setThinkingIntensityValue(value: number): void {
	// Set slider value for thinking intensity modal
	const thinkingIntensitySlider = document.getElementById('thinkingIntensitySlider') as HTMLInputElement;
	if (thinkingIntensitySlider) {
		thinkingIntensitySlider.value = value.toString();
	}

	// Update visual state
	updateThinkingIntensityDisplay(value);
}

function updateThinkingModeToggleName(intensityValue: number): void {
	const intensityNames = ['Thinking', 'Think Hard', 'Think Harder', 'Ultrathink'];
	const modeName = intensityNames[intensityValue] || 'Thinking';
	const toggleLabel = document.getElementById('thinkingModeLabel');
	if (toggleLabel) {
		toggleLabel.textContent = modeName + ' Mode';
	}
}

function updateThinkingIntensityDisplay(value: number): void {
	// Update label highlighting for thinking intensity modal
	for (let i = 0; i < 4; i++) {
		const label = document.getElementById('thinking-label-' + i)!;
		if (i === value) {
			label.classList.add('active');
		} else {
			label.classList.remove('active');
		}
	}
	// Don't update toggle name until user confirms
}

function confirmThinkingIntensity(): void {
	// Get the current slider value
	const currentValue = (document.getElementById('thinkingIntensitySlider') as HTMLInputElement).value;
	// Update the toggle name with confirmed selection
	updateThinkingModeToggleName(parseInt(currentValue));
	// Save the current intensity setting
	saveThinkingIntensity();
	// Close the modal
	hideThinkingIntensityModal();
}

function saveThinkingIntensity(): void {
	const thinkingSlider = document.getElementById('thinkingIntensitySlider') as HTMLInputElement;
	const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink'];
	const value = parseInt(thinkingSlider.value);
	const thinkingIntensity = intensityValues[value] || 'think';
	// Send settings to VS Code
	vscode.postMessage({
		type: 'updateSettings',
		settings: {
			thinkingIntensity: thinkingIntensity
		}
	});
}

function restoreToCommit(commitSha: string): void {
	console.log('Restore button clicked for commit:', commitSha);
	vscode.postMessage({
		type: 'restoreCommit',
		commitSha: commitSha
	});
	// Clear the checkpoint since it's being restored
	currentCheckpoint = null;
}

function requestConversationList(): void {
	vscode.postMessage({
		type: 'getConversationList'
	});
}

function loadConversation(filename: string): void {
	vscode.postMessage({
		type: 'loadConversation',
		filename: filename
	});
	// Hide conversation history and show chat
	toggleConversationHistory();
}

function showRestoreContainer(data: any): void {
	// Store checkpoint info globally so it can be used in diff headers
	currentCheckpoint = {
		sha: data.sha,
		timestamp: data.timestamp
	};
	// No longer need to show a separate restore container
	// The restore button will appear in diff headers
}

function _hideRestoreContainer(commitSha: string): void {
	const container = document.getElementById(`restore-${commitSha}`);
	if (container) {
		container.remove();
	}
}

function showSessionInfo(_sessionId: string): void {
	// const sessionInfo = document.getElementById('sessionInfo');
	// const sessionIdSpan = document.getElementById('sessionId');
	const sessionStatus = document.getElementById('sessionStatus');
	const newSessionBtn = document.getElementById('newSessionBtn');
	const historyBtn = document.getElementById('historyBtn');
	if (sessionStatus && newSessionBtn) {
		// sessionIdSpan.textContent = sessionId.substring(0, 8);
		// sessionIdSpan.title = `Full session ID: ${sessionId} (click to copy)`;
		// sessionIdSpan.style.cursor = 'pointer';
		// sessionIdSpan.onclick = () => copySessionId(sessionId);
		// sessionInfo.style.display = 'flex';
		sessionStatus.style.display = 'none';
		newSessionBtn.style.display = 'block';
		if (historyBtn) {historyBtn.style.display = 'block';}
	}
}

function _copySessionId(sessionId: string): void {
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
	}).catch(err => {
		console.error('Failed to copy session ID:', err);
	});
}

function hideSessionInfo(): void {
	// const sessionInfo = document.getElementById('sessionInfo');
	const sessionStatus = document.getElementById('sessionStatus');
	const newSessionBtn = document.getElementById('newSessionBtn');
	const historyBtn = document.getElementById('historyBtn');
	if (sessionStatus && newSessionBtn) {
		// sessionInfo.style.display = 'none';
		sessionStatus.style.display = 'none';
		// Always show new session
		newSessionBtn.style.display = 'block';
		// Keep history button visible - don't hide it
		if (historyBtn) {historyBtn.style.display = 'block';}
	}
}

function hideFilePicker(): void {
	filePickerModal.style.display = 'none';
	fileSearchInput.value = '';
	selectedFileIndex = -1;
}

function _showImageAddedFeedback(fileName: string): void {
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

function displayConversationList(conversations: any[]): void {
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

function handleClipboardText(text: string): void {
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

// Plan mode and thinking mode toggles - already defined above

// Global sendMessage function - assignment moved to end of file

// Missing global variables for MCP server editing state
let editingServerName: string | null = null;

// Store custom snippets data globally
let customSnippetsData: any = {};

// Additional essential global functions - exposed to window for HTML onclick handlers

// Duplicate functions removed - using original implementations above

// Duplicate modal functions removed - using properly typed versions defined later

function executeSlashCommand(command: string): void {
	// Hide the modal
	hideSlashCommandsModal();

	// Clear the input since user selected a command
	messageInput.value = '';

	// Send command to VS Code to execute in terminal
	vscode.postMessage({
		type: 'executeSlashCommand',
		command: command
	});
	// Show user feedback
	addMessage(`Executing /${command} command in terminal. Check the terminal output and return when ready.`, 'system');
}

// WSL Alert functions
function showWSLAlert(): void {
	const alert = document.getElementById('wslAlert');
	if (alert) {alert.style.display = 'block';}
};

function dismissWSLAlert(): void {
	const alert = document.getElementById('wslAlert');
	if (alert) {alert.style.display = 'none';}
	// Send dismiss message to extension to store in globalState
	vscode.postMessage({
		type: 'dismissWSLAlert'
	});
};

function openWSLSettings(): void {
	// Dismiss the alert
	dismissWSLAlert();

	// Open settings modal
	toggleSettings();
};

// MCP Server display and editing functions
function displayMCPServers(servers: any): void {
	const serversList = document.getElementById('mcpServersList');
	if (!serversList) {return;}

	serversList.innerHTML = '';

	if (Object.keys(servers).length === 0) {
		serversList.innerHTML = '<div class="no-servers">No MCP servers configured</div>';
		return;
	}

	for (const [name, config] of Object.entries(servers)) {
		const serverItem = document.createElement('div');
		serverItem.className = 'mcp-server-item';

		// Defensive check for config structure
		if (!config || typeof config !== 'object') {
			console.error('Invalid config for server:', name, config);
			continue;
		}

		const serverConfig = config as any;
		const serverType = serverConfig.type || 'stdio';
		let configDisplay = '';

		if (serverType === 'stdio') {
			configDisplay = `Command: ${serverConfig.command || 'Not specified'}`;
			if (serverConfig.args && Array.isArray(serverConfig.args)) {
				configDisplay += `<br>Args: ${serverConfig.args.join(' ')}`;
			}
		} else if (serverType === 'http' || serverType === 'sse') {
			configDisplay = `URL: ${serverConfig.url || 'Not specified'}`;
		} else {
			configDisplay = `Type: ${serverType}`;
		}

		serverItem.innerHTML = `
			<div class="server-info">
				<div class="server-name">${name}</div>
				<div class="server-type">${serverType.toUpperCase()}</div>
				<div class="server-config">${configDisplay}</div>
			</div>
			<div class="server-actions">
				<button class="btn outlined server-edit-btn" onclick="editMCPServer('${name}', ${JSON.stringify(serverConfig).replace(/"/g, '&quot;')})">Edit</button>
				<button class="btn outlined server-delete-btn" onclick="deleteMCPServer('${name}')">Delete</button>
			</div>
		`;

		serversList.appendChild(serverItem);
	}
}

function editMCPServer(name: string, config: any): void {
	// Set editing state
	editingServerName = name;

	// Hide add button and popular servers
	const addBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addForm = document.getElementById('addServerForm');

	if (addBtn) {addBtn.style.display = 'none';}
	if (popularServers) {popularServers.style.display = 'none';}
	if (addForm) {addForm.style.display = 'block';}

	// Update form title and button
	if (!document.querySelector('#addServerForm h5')) {
		addForm?.insertAdjacentHTML('afterbegin', '<h5 style="margin: 0 0 20px 0; font-size: 14px; font-weight: 600;">Edit MCP Server</h5>');
	} else {
		const title = document.querySelector('#addServerForm h5');
		if (title) {title.textContent = 'Edit MCP Server';}
	}

	// Update save button text
	const saveBtn = document.querySelector('#addServerForm .btn:not(.outlined)');
	if (saveBtn) {saveBtn.textContent = 'Update Server';}

	// Populate form with existing values
	const serverName = document.getElementById('serverName') as HTMLInputElement;
	const serverType = document.getElementById('serverType') as HTMLSelectElement;
	const serverCommand = document.getElementById('serverCommand') as HTMLInputElement;
	const serverUrl = document.getElementById('serverUrl') as HTMLInputElement;
	const serverArgs = document.getElementById('serverArgs') as HTMLTextAreaElement;
	const serverEnv = document.getElementById('serverEnv') as HTMLTextAreaElement;
	const serverHeaders = document.getElementById('serverHeaders') as HTMLTextAreaElement;

	if (serverName) {
		serverName.value = name;
		serverName.disabled = true; // Don't allow name changes when editing
	}

	if (serverType) {serverType.value = config.type || 'stdio';}

	if (config.command && serverCommand) {
		serverCommand.value = config.command;
	}
	if (config.url && serverUrl) {
		serverUrl.value = config.url;
	}
	if (config.args && Array.isArray(config.args) && serverArgs) {
		serverArgs.value = config.args.join('\n');
	}
	if (config.env && serverEnv) {
		const envLines = Object.entries(config.env).map(([key, value]) => `${key}=${value}`);
		serverEnv.value = envLines.join('\n');
	}
	if (config.headers && serverHeaders) {
		const headerLines = Object.entries(config.headers).map(([key, value]) => `${key}=${value}`);
		serverHeaders.value = headerLines.join('\n');
	}

	// Update form field visibility
	updateServerForm();

	const toolsList = document.querySelector('.tools-list') as HTMLElement;
	if (toolsList) {
		toolsList.scrollTop = toolsList.scrollHeight;
	}
};

// Additional functions for prompt snippets and slash commands
function usePromptSnippet(snippetType: string): void {
	const builtInSnippets: { [key: string]: string } = {
		'performance-analysis': 'Analyze this code for performance issues and suggest optimizations',
		'security-review': 'Review this code for security vulnerabilities',
		'implementation-review': 'Review the implementation in this code',
		'code-explanation': 'Explain how this code works in detail',
		'bug-fix': 'Help me fix this bug in my code',
		'refactor': 'Refactor this code to improve readability and maintainability',
		'test-generation': 'Generate comprehensive tests for this code',
		'documentation': 'Generate documentation for this code'
	};

	// Check built-in snippets first
	let promptText = builtInSnippets[snippetType];

	// If not found in built-in, check custom snippets
	if (!promptText && customSnippetsData[snippetType]) {
		promptText = customSnippetsData[snippetType].prompt;
	}

	if (promptText) {
		// Hide the modal
		hideSlashCommandsModal();

		// Insert the prompt into the message input
		messageInput.value = promptText;
		messageInput.focus();

		// Auto-resize the textarea
		adjustTextareaHeight();
	}
};

function showAddSnippetForm(): void {
	document.getElementById('addSnippetForm')!.style.display = 'block';
	document.getElementById('snippetName')!.focus();
}

function hideAddSnippetForm(): void {
	document.getElementById('addSnippetForm')!.style.display = 'none';
	// Clear form fields
	(document.getElementById('snippetName') as HTMLInputElement).value = '';
	(document.getElementById('snippetPrompt') as HTMLTextAreaElement).value = '';
};

function saveCustomSnippet(): void {
	const name = (document.getElementById('snippetName') as HTMLInputElement).value.trim();
	const prompt = (document.getElementById('snippetPrompt') as HTMLTextAreaElement).value.trim();

	if (!name || !prompt) {
		alert('Please fill in both name and prompt text.');
		return;
	}

	// Generate a unique ID for the snippet
	const snippetId = 'custom-' + Date.now();

	// Save the snippet using VS Code global storage
	const snippetData = {
		name: name,
		prompt: prompt,
		id: snippetId
	};

	vscode.postMessage({
		type: 'saveCustomSnippet',
		snippet: snippetData
	});

	// Hide the form
	hideAddSnippetForm();
};

function loadCustomSnippets(snippetsData: any = {}): void {
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
		snippetElement.onclick = () => usePromptSnippet(snippet.id);

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

function deleteCustomSnippet(snippetId: string): void {
	vscode.postMessage({
		type: 'deleteCustomSnippet',
		snippetId: snippetId
	});
};

function filterSlashCommands(): void {
	const searchInput = document.getElementById('slashCommandsSearch') as HTMLInputElement;
	const searchTerm = searchInput?.value.toLowerCase() || '';
	const allItems = document.querySelectorAll('.slash-command-item');

	allItems.forEach((item: Element) => {
		const title = item.querySelector('.slash-command-title')?.textContent?.toLowerCase() || '';
		const description = item.querySelector('.slash-command-description')?.textContent?.toLowerCase() || '';

		if (title.includes(searchTerm) || description.includes(searchTerm)) {
			(item as HTMLElement).style.display = 'flex';
		} else {
			(item as HTMLElement).style.display = 'none';
		}
	});
};

function handleCustomCommandKeydown(event: KeyboardEvent): void {
	if (event.key === 'Enter') {
		event.preventDefault();
		const target = event.target as HTMLInputElement;
		const customCommand = target.value.trim();
		if (customCommand) {
			executeSlashCommand(customCommand);
			// Clear the input for next use
			target.value = '';
		}
	}
};

function openModelTerminal(): void {
	vscode.postMessage({
		type: 'openModelTerminal'
	});
	hideModelModal();
}

// updateServerForm function that was missing
function updateServerForm(): void {
	const serverType = (document.getElementById('serverType') as HTMLSelectElement)?.value;
	const commandGroup = document.getElementById('commandGroup');
	const urlGroup = document.getElementById('urlGroup');
	const argsGroup = document.getElementById('argsGroup');
	const envGroup = document.getElementById('envGroup');
	const headersGroup = document.getElementById('headersGroup');

	if (serverType === 'stdio') {
		if (commandGroup) {commandGroup.style.display = 'block';}
		if (urlGroup) {urlGroup.style.display = 'none';}
		if (argsGroup) {argsGroup.style.display = 'block';}
		if (envGroup) {envGroup.style.display = 'block';}
		if (headersGroup) {headersGroup.style.display = 'none';}
	} else if (serverType === 'http' || serverType === 'sse') {
		if (commandGroup) {commandGroup.style.display = 'none';}
		if (urlGroup) {urlGroup.style.display = 'block';}
		if (argsGroup) {argsGroup.style.display = 'none';}
		if (envGroup) {envGroup.style.display = 'none';}
		if (headersGroup) {headersGroup.style.display = 'block';}
	}
}

// Hide modal functions for close buttons (X)
function hideSettingsModal(): void {
	const modal = document.getElementById('settingsModal');
	if (modal) {modal.style.display = 'none';}
}

function hideModelModal(): void {
	const modal = document.getElementById('modelModal');
	if (modal) {modal.style.display = 'none';}
}

function hideSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {modal.style.display = 'none';}
}

function showModelSelector(): void {
	document.getElementById('modelModal')!.style.display = 'flex';
	// Select the current model radio button
	const radioButton = document.getElementById('model-' + currentModel) as HTMLInputElement;
	if (radioButton) {
		radioButton.checked = true;
	}
}

function showSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {modal.style.display = 'flex';}
	// Auto-focus the search input
	setTimeout(() => {
		const searchInput = document.getElementById('slashCommandsSearch') as HTMLInputElement;
		if (searchInput) {searchInput.focus();}
	}, 100);
}

// Global scope assignments moved to end of file

// Model selection functions
let currentModel = 'opus'; // Default model

function selectModel(model: string, fromBackend = false): void {
	currentModel = model;

	// Update the display text
	const displayNames: Record<string, string> = {
		'opus': 'Opus',
		'sonnet': 'Sonnet',
		'default': 'Model'
	};
	document.getElementById('selectedModel')!.textContent = displayNames[model] || model;

	// Only send model selection to VS Code extension if not from backend
	if (!fromBackend) {
		vscode.postMessage({
			type: 'selectModel',
			model: model
		});

		// Save preference
		localStorage.setItem('selectedModel', model);
	}

	// Update radio button if modal is open
	const radioButton = document.getElementById('model-' + model) as HTMLInputElement;
	if (radioButton) {
		radioButton.checked = true;
	}

	hideModelModal();
}

// Stop request function
function stopRequest(): void {
	sendStats('Stop request');

	vscode.postMessage({
		type: 'stopRequest'
	});
	hideStopButton();
};

// Copy functions - using original implementation defined earlier

function copyCodeBlock(codeId: string): void {
	const codeElement = document.getElementById(codeId);
	if (codeElement) {
		const rawCode = codeElement.getAttribute('data-raw-code');
		if (rawCode) {
			// Decode HTML entities
			const decodedCode = rawCode.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
			navigator.clipboard.writeText(decodedCode).then(() => {
				// Show temporary feedback
				const copyBtn = codeElement.closest('.code-block-container')?.querySelector('.code-copy-btn') as HTMLElement;
				if (copyBtn) {
					const originalInnerHTML = copyBtn.innerHTML;
					copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
					copyBtn.style.color = '#4caf50';
					setTimeout(() => {
						copyBtn.innerHTML = originalInnerHTML;
						copyBtn.style.color = '';
					}, 1000);
				}
			}).catch(err => {
				console.error('Failed to copy code:', err);
			});
		}
	}
};

// Permissions management functions
function renderPermissions(permissions: any): void {
	const permissionsList = document.getElementById('permissionsList');
	if (!permissionsList) {return;}

	if (!permissions || !permissions.alwaysAllow || Object.keys(permissions.alwaysAllow).length === 0) {
		permissionsList.innerHTML = `
			<div class="permissions-empty">
				No always-allow permissions set
			</div>
		`;
		return;
	}

	let html = '';
	for (const [toolName, permission] of Object.entries(permissions.alwaysAllow)) {
		const perm = permission as any;
		if (perm === true || (Array.isArray(perm) && perm.length === 0)) {
			// Tool has blanket permission
			html += `
				<div class="permission-item">
					<div class="permission-info">
						<div class="permission-name">${toolName}</div>
						<div class="permission-description">All commands allowed</div>
					</div>
					<button class="permission-remove-btn" onclick="removePermission('${toolName}', null)">Remove</button>
				</div>
			`;
		} else if (Array.isArray(perm)) {
			// Tool has specific command permissions
			for (const command of perm) {
				html += `
					<div class="permission-item">
						<div class="permission-info">
							<div class="permission-name">${toolName}</div>
							<div class="permission-description">${escapeHtml(command)}</div>
						</div>
						<button class="permission-remove-btn" onclick="removePermission('${toolName}', '${escapeHtml(command)}')">Remove</button>
					</div>
				`;
			}
		}
	}

	permissionsList.innerHTML = html;
}

function removePermission(toolName: string, command: string | null): void {
	vscode.postMessage({
		type: 'removePermission',
		toolName,
		command
	});
};

function showAddPermissionForm(): void {
	const showBtn = document.getElementById('showAddPermissionBtn');
	const form = document.getElementById('addPermissionForm');
	if (showBtn) {showBtn.style.display = 'none';}
	if (form) {form.style.display = 'block';}

	// Focus the select element
	setTimeout(() => {
		const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
		if (toolSelect) {toolSelect.focus();}
	}, 100);
};

function hideAddPermissionForm(): void {
	const showBtn = document.getElementById('showAddPermissionBtn');
	const form = document.getElementById('addPermissionForm');
	if (showBtn) {showBtn.style.display = 'flex';}
	if (form) {form.style.display = 'none';}

	// Reset form
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	if (toolSelect) {toolSelect.value = '';}
	if (commandInput) {
		commandInput.value = '';
		commandInput.style.display = 'none';
	}
}

function toggleCommandInput(): void {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	const hintDiv = document.getElementById('permissionsFormHint');

	if (toolSelect && commandInput) {
		if (toolSelect.value === 'Bash') {
			commandInput.style.display = 'block';
			commandInput.placeholder = 'Command pattern (e.g., npm i *)';
			if (hintDiv) {hintDiv.textContent = 'Use * as wildcard. Example: npm i * allows any npm install command';}
		} else {
			commandInput.style.display = 'none';
			if (hintDiv) {hintDiv.textContent = '';}
		}
	}
};

function addPermission(): void {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	const addBtn = document.getElementById('addPermissionBtn') as HTMLButtonElement;

	if (!toolSelect || !addBtn) {return;}

	const toolName = toolSelect.value;
	if (!toolName) {return;}

	addBtn.disabled = true;
	addBtn.textContent = 'Adding...';

	const permissionData: any = { toolName };
	if (toolName === 'Bash' && commandInput && commandInput.value.trim()) {
		permissionData.command = commandInput.value.trim();
	}

	vscode.postMessage({
		type: 'addPermission',
		...permissionData
	});

	// Reset button after a delay
	setTimeout(() => {
		if (addBtn) {
			addBtn.disabled = false;
			addBtn.textContent = 'Add';
		}
	}, 1000);

	hideAddPermissionForm();
};

// Permission request handling functions
function addPermissionRequestMessage(data: any): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {return;}

	const shouldScroll = shouldAutoScroll(messagesDiv);

	// Generate unique ID for permission request
	messageCounter++;
	const messageId = `msg-permission-${messageCounter}`;

	const messageDiv = document.createElement('div');
	messageDiv.id = messageId;
	messageDiv.className = 'message permission-request';
	const toolName = data.tool || 'Unknown Tool';
	// Create always allow button text with command styling for Bash
	let alwaysAllowText = `Always allow ${toolName}`;
	let alwaysAllowTooltip = '';
	if (toolName === 'Bash' && data.pattern) {
		const pattern = data.pattern;
		// Remove the asterisk for display - show "npm i" instead of "npm i *"
		const displayPattern = pattern.replace(' *', '');
		const truncatedPattern = displayPattern.length > 30 ? displayPattern.substring(0, 30) + '...' : displayPattern;
		alwaysAllowText = `Always allow <code>${truncatedPattern}</code>`;
		alwaysAllowTooltip = displayPattern.length > 30 ? `title="${displayPattern}"` : '';
	}
	messageDiv.innerHTML = `
		<div class="permission-header">
			<span class="icon">🔐</span>
			<span>Permission Required</span>
			<div class="permission-menu">
				<button class="permission-menu-btn" onclick="togglePermissionMenu('${data.id}')" title="More options">⋮</button>
				<div class="permission-menu-dropdown" id="permissionMenu-${data.id}" style="display: none;">
					<button class="permission-menu-item" onclick="enableYoloMode('${data.id}')">
						<span class="menu-icon">⚡</span>
						<div class="menu-content">
							<span class="menu-title">Enable YOLO Mode</span>
							<span class="menu-subtitle">Auto-allow all permissions</span>
						</div>
					</button>
				</div>
			</div>
		</div>
		<div class="permission-content">
			<p>Allow <strong>${toolName}</strong> to execute the tool call above?</p>
			<div class="permission-buttons">
				<button class="btn deny" onclick="respondToPermission('${data.id}', false)">Deny</button>
				<button class="btn always-allow" onclick="respondToPermission('${data.id}', true, true)" ${alwaysAllowTooltip}>${alwaysAllowText}</button>
				<button class="btn allow" onclick="respondToPermission('${data.id}', true)">Allow</button>
			</div>
		</div>
	`;
	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

function respondToPermission(id: string, approved: boolean, alwaysAllow: boolean = false): void {
	vscode.postMessage({
		type: 'permissionResponse',
		id: id,
		approved: approved,
		alwaysAllow: alwaysAllow
	});

	// Remove the permission request message
	const messageDiv = document.querySelector(`[data-permission-id="${id}"]`);
	if (messageDiv) {
		messageDiv.remove();
	}

	// If always allow was selected, show feedback
	if (approved && alwaysAllow) {
		addMessage('✅ Permission added to always-allow list', 'system');
	}
};

function togglePermissionMenu(permissionId: string): void {
	const menu = document.getElementById(`menu-${permissionId}`);
	if (menu) {
		menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
	}
};

function enableYoloModeFromPermission(permissionId: string): void {
	// Hide the menu first
	togglePermissionMenu(permissionId);

	// Auto-approve this permission
	respondToPermission(permissionId, true);

	// Enable yolo mode
	enableYoloMode();
};

// Expose permissions functions to global scope
// Global scope assignments moved to end of file

// Modal close functionality
function initializeModals(): void {
	// Settings modal close functionality
	const settingsModal = document.getElementById('settingsModal');
	if (settingsModal) {
		settingsModal.addEventListener('click', (e) => {
			if (e.target === settingsModal) {
				hideSettingsModal();
			}
		});
	}

	// MCP modal close functionality
	const mcpModal = document.getElementById('mcpModal');
	if (mcpModal) {
		mcpModal.addEventListener('click', (e) => {
			if (e.target === mcpModal) {
				hideMCPModal();
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
				hideThinkingIntensityModal();
			}
		});
	}
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
	// Initialize DOM elements
	messagesDiv = document.getElementById('chatMessages') as HTMLElement;
	messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
	sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
	statusTextDiv = document.getElementById('statusText') as HTMLElement;
	filePickerModal = document.getElementById('filePickerModal') as HTMLElement;
	fileSearchInput = document.getElementById('fileSearchInput') as HTMLInputElement;
	fileList = document.getElementById('fileList') as HTMLElement;
	_imageBtn = document.getElementById('imageBtn') as HTMLButtonElement;
	console.log('UI initialized');
	console.log('Communication test - vscode API:', typeof vscode);
	console.log('Elements found:', {
		messageInput: !!messageInput,
		sendBtn: !!sendBtn,
		messagesDiv: !!messagesDiv
	});

	// Initialize modal close functionality
	initializeModals();

	// Initialize form states - ensure WSL options are hidden by default
	const wslOptions = document.getElementById('wslOptions');
	const wslEnabledCheckbox = document.getElementById('wsl-enabled') as HTMLInputElement;
	if (wslOptions && wslEnabledCheckbox) {
		// Hide WSL options by default if checkbox is unchecked
		if (!wslEnabledCheckbox.checked) {
			wslOptions.style.display = 'none';
		}
	}

	// Set up message input event listeners
	messageInput.addEventListener('input', adjustTextareaHeight);

	messageInput.addEventListener('input', () => {
		if (messageInput.value.length > 0) {
			sendBtn.style.opacity = '1';
			sendBtn.style.cursor = 'pointer';
		} else {
			sendBtn.style.opacity = '0.5';
			sendBtn.style.cursor = 'default';
		}
	});

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
				showFilePicker();
			}, 0);
		} else if (e.key === 'Escape' && filePickerModal.style.display === 'flex') {
			e.preventDefault();
			filePickerModal.style.display = 'none';
			fileSearchInput.value = '';
			selectedFileIndex = -1;
		}
	});

	messageInput.addEventListener('paste', async (e) => {
		e.preventDefault();

		try {
			// Try to get clipboard data from the event first
			const clipboardData = e.clipboardData;

			// Check for images first
			if (clipboardData && clipboardData.items) {
				let hasImage = false;
				for (let i = 0; i < clipboardData.items.length; i++) {
					const item = clipboardData.items[i];
					if (item.type.startsWith('image/')) {
						// Found an image, handle it
						console.log('Image detected in clipboard:', item.type);
						hasImage = true;
						const blob = item.getAsFile();
						if (blob) {
							console.log('Converting image blob to base64...');
							// Convert blob to base64
							const reader = new FileReader();
							reader.onload = function(event) {
								const base64Data = event.target?.result;
								console.log('Sending image to extension for file creation');
								// Send to extension to create file
								vscode.postMessage({
									type: 'createImageFile',
									imageData: base64Data,
									imageType: item.type
								});
							};
							reader.readAsDataURL(blob);
						}
						break; // Process only the first image found
					}
				}

				// If we found an image, don't process any text
				if (hasImage) {
					return;
				}
			}

			// No image found, handle text
			let text = '';

			if (clipboardData) {
				text = clipboardData.getData('text/plain');
			}

			// If no text from event, try navigator.clipboard API
			if (!text && navigator.clipboard && navigator.clipboard.readText) {
				try {
					text = await navigator.clipboard.readText();
				} catch (err) {
					console.log('Clipboard API failed:', err);
				}
			}

			// If still no text, request from VS Code extension
			if (!text) {
				vscode.postMessage({
					type: 'getClipboardText'
				});
				return;
			}

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

		} catch (error) {
			console.error('Paste error:', error);
			// Fallback: request clipboard from VS Code
			vscode.postMessage({
				type: 'getClipboardText'
			});
		}
	});

	messageInput.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		// Optional: show custom context menu or request clipboard
		vscode.postMessage({
			type: 'getClipboardText'
		});
	});

	// Document click handler to close permission menus
	document.addEventListener('click', function(event) {
		if (!(event.target as HTMLElement)?.closest('.permission-menu')) {
			document.querySelectorAll('.permission-menu-dropdown').forEach(dropdown => {
				(dropdown as HTMLElement).style.display = 'none';
			});
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
			hideFilePicker();
		}
	});

	// Close modal when clicking outside
	filePickerModal.addEventListener('click', (e) => {
		if (e.target === filePickerModal) {
			hideFilePicker();
		}
	});

	// Listen for messages from the extension
	// Global event delegation for dynamically created elements
	document.addEventListener('click', function(event: Event) {
		const target = event.target as HTMLElement;

		// Handle file path clicks
		if (target.classList.contains('diff-file-path') && target.dataset.filePath) {
			openFileInEditor(target.dataset.filePath);
			return;
		}

		// Handle expand buttons
		if (target.classList.contains('expand-btn')) {
			toggleExpand(target);
			return;
		}

		// Handle diff expansion buttons
		if (target.classList.contains('diff-expand-btn') && target.dataset.diffId) {
			toggleDiffExpansion(target.dataset.diffId);
			return;
		}

		// Handle result expansion buttons
		if (target.classList.contains('result-expand-btn') && target.dataset.resultId) {
			toggleResultExpansion(target.dataset.resultId);
			return;
		}
	});

	window.addEventListener('message', function(event: MessageEvent) {
		// console.log('Received message from extension:', event.data.type);
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
					// Check if this tool involves a file and add file info icon
					if (message.data.rawInput && message.data.rawInput.file_path) {
						const filePath = message.data.rawInput.file_path;
						addFileInfoToLastMessage(filePath);
					}
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
				if (message.data.sessionId) {
					showSessionInfo(message.data.sessionId);
					// Show detailed session information
					const _sessionDetails = [
						`🆔 Session ID: ${message.data.sessionId}`,
						`🔧 Tools Available: ${message.data.tools.length}`,
						`🖥️ MCP Servers: ${message.data.mcpServers ? message.data.mcpServers.length : 0}`
					];
					//addMessage(sessionDetails.join('\n'), 'system');
				}
				break;
			case 'updateTokens':
				console.log('Update tokens received');
				// Update token totals in real-time
				totalTokensInput = message.data.totalTokensInput || 0;
				totalTokensOutput = message.data.totalTokensOutput || 0;

				// Update status bar immediately
				updateStatusWithTotals();

				// Store token info for the last Claude message
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

					// Add token info icon to last Claude message instead of showing directly
					addTokenInfoToLastMessage(tokenBreakdown);
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
				showRestoreContainer(message.data);
				break;
			case 'restoreProgress':
				addMessage('🔄 ' + message.data, 'system');
				break;
			case 'restoreSuccess':
				//hideRestoreContainer(message.data.commitSha);
				addMessage('✅ ' + message.data.message, 'system');
				break;
			case 'restoreError':
				addMessage('❌ ' + message.data, 'error');
				break;
			case 'sessionResumed':
				console.log('Session resumed:', message.data);
				showSessionInfo(message.data.sessionId);
				addMessage(`📝 Resumed previous session\n🆔 Session ID: ${message.data.sessionId}\n💡 Your conversation history is preserved`, 'system');
				break;
			case 'sessionCleared':
				console.log('Session cleared');
				// Clear all messages from UI
				if (messagesDiv) {
					messagesDiv.innerHTML = '';
				}
				hideSessionInfo();
				addMessage('🆕 Started new session', 'system');
				// Reset totals
				totalCost = 0;
				totalTokensInput = 0;
				totalTokensOutput = 0;
				requestCount = 0;
				updateStatusWithTotals();
				break;
			case 'loginRequired':
				sendStats('Login required');
				addMessage('🔐 Login Required\n\nYour Claude API key is invalid or expired.\nA terminal has been opened - please run the login process there.\n\nAfter logging in, come back to this chat to continue.', 'error');
				updateStatus('Login Required', 'error');
				break;
			case 'conversationList':
				displayConversationList(message.data);
				break;
			case 'clipboardText':
				handleClipboardText(message.data);
				break;
			case 'modelSelected':
				// Update the UI with the current model
				currentModel = message.model;
				selectModel(message.model, true);
				break;
			case 'terminalOpened':
				// Display notification about checking the terminal
				addMessage(message.data, 'system');
				break;
			case 'mcpServers':
				displayMCPServers(message.data);
				break;
			case 'mcpServerSaved':
				loadMCPServers(); // Reload the servers list
				addMessage('✅ MCP server "' + message.data.name + '" saved successfully', 'system');
				break;
			case 'mcpServerDeleted':
				loadMCPServers(); // Reload the servers list
				addMessage('✅ MCP server "' + message.data.name + '" deleted successfully', 'system');
				break;
			case 'mcpServerError':
				addMessage('❌ Error with MCP server: ' + message.data.error, 'error');
				break;
			case 'restoreInputText':
				const inputField = document.getElementById('messageInput') as HTMLTextAreaElement;
				if (inputField && message.data) {
					inputField.value = message.data;
					// Auto-resize the textarea
					inputField.style.height = 'auto';
					inputField.style.height = Math.min(inputField.scrollHeight, 200) + 'px';
				}
				break;
			case 'imagePath':
				// Handle image file path response
				if (message.data.filePath) {
					// Get current cursor position and content
					const cursorPosition = messageInput.selectionStart || messageInput.value.length;
					const currentValue = messageInput.value || '';

					// Insert the file path at the current cursor position
					const textBefore = currentValue.substring(0, cursorPosition);
					const textAfter = currentValue.substring(cursorPosition);

					// Add a space before the path if there's text before and it doesn't end with whitespace
					const separator = (textBefore && !textBefore.endsWith(' ') && !textBefore.endsWith('\n')) ? ' ' : '';

					messageInput.value = textBefore + separator + message.data.filePath + textAfter;

					// Move cursor to end of inserted path
					const newCursorPosition = cursorPosition + separator.length + message.data.filePath.length;
					messageInput.setSelectionRange(newCursorPosition, newCursorPosition);

					// Focus back on textarea and adjust height
					messageInput.focus();
					adjustTextareaHeight();

					console.log('Inserted image path:', message.data.filePath);
					console.log('Full textarea value:', messageInput.value);
				} else if (message.path) {
					// Add the image path to the textarea (alternative format)
					const currentText = messageInput.value;
					const pathIndicator = `@${message.path} `;
					messageInput.value = currentText + pathIndicator;
					messageInput.focus();
					adjustTextareaHeight();
				}
				break;
			case 'permissionsData':
				console.log('Permissions data received');
				// Update permissions UI
				renderPermissions(message.data);
				break;
			case 'permissionRequest':
				console.log('Permission request received');
				addPermissionRequestMessage(message.data);
				break;
			case 'settingsData':
				// Update UI with current settings
				const thinkingIntensity = message.data['thinking.intensity'] || 'think';
				const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink'];
				const sliderValue = intensityValues.indexOf(thinkingIntensity);

				// Update thinking intensity modal if it exists
				const thinkingIntensitySlider = document.getElementById('thinkingIntensitySlider') as HTMLInputElement;
				if (thinkingIntensitySlider) {
					thinkingIntensitySlider.value = (sliderValue >= 0 ? sliderValue : 0).toString();
					updateThinkingIntensityDisplay(parseInt(thinkingIntensitySlider.value));
				} else {
					// Update toggle name even if modal isn't open
					updateThinkingModeToggleName(sliderValue >= 0 ? sliderValue : 0);
				}

				const wslEnabledElement = document.getElementById('wsl-enabled') as HTMLInputElement;
				const wslDistroElement = document.getElementById('wsl-distro') as HTMLInputElement;
				const wslNodePathElement = document.getElementById('wsl-node-path') as HTMLInputElement;
				const wslClaudePathElement = document.getElementById('wsl-claude-path') as HTMLInputElement;
				const yoloModeElement = document.getElementById('yolo-mode') as HTMLInputElement;

				if (wslEnabledElement) {wslEnabledElement.checked = message.data['wsl.enabled'] || false;}
				if (wslDistroElement) {wslDistroElement.value = message.data['wsl.distro'] || 'Ubuntu';}
				if (wslNodePathElement) {wslNodePathElement.value = message.data['wsl.nodePath'] || '/usr/bin/node';}
				if (wslClaudePathElement) {wslClaudePathElement.value = message.data['wsl.claudePath'] || '/usr/local/bin/claude';}
				if (yoloModeElement) {yoloModeElement.checked = message.data['permissions.yoloMode'] || false;}

				// Update yolo warning visibility
				updateYoloWarning();

				// Show/hide WSL options
				const wslOptionsElement = document.getElementById('wslOptions');
				if (wslOptionsElement) {
					wslOptionsElement.style.display = message.data['wsl.enabled'] ? 'block' : 'none';
				}
				break;
			case 'platformInfo':
				// Check if user is on Windows and show WSL alert if not dismissed and WSL not already enabled
				if (message.data.isWindows && !message.data.wslAlertDismissed && !message.data.wslEnabled) {
					// Small delay to ensure UI is ready
					setTimeout(() => {
						showWSLAlert();
					}, 1000);
				}
				break;
			case 'customSnippetsData':
				// Update global custom snippets data
				customSnippetsData = message.data || {};
				// Refresh the snippets display
				loadCustomSnippets(customSnippetsData);
				break;
			case 'customSnippetSaved':
				// Refresh snippets after saving
				vscode.postMessage({
					type: 'getCustomSnippets'
				});
				break;
			case 'customSnippetDeleted':
				// Refresh snippets after deletion
				vscode.postMessage({
					type: 'getCustomSnippets'
				});
				break;
			case 'showSettings':
				// Show settings modal (triggered from native title bar button)
				toggleSettings();
				break;
			case 'showHistory':
				// Show conversation history (triggered from native title bar button)
				toggleConversationHistory();
				break;
			case 'toggleStatusInfo':
				// Toggle status info popover (triggered from native title bar button)
				toggleStatusInfo();
				break;
			default:
				console.log('Unknown message type:', message.type);
		}
	});
});

// ============================================================================
// GLOBAL SCOPE EXPOSURE FOR HTML ONCLICK HANDLERS
// ============================================================================
// All functions exposed to global scope in one centralized location for maintainability


// Core UI functions
(window as any).sendMessage = sendMessage;
(window as any).togglePlanMode = togglePlanMode;
(window as any).toggleThinkingMode = toggleThinkingMode;
(window as any).enableYoloMode = enableYoloMode;

// File and image selection
(window as any).showFilePicker = showFilePicker;
(window as any).hideFilePicker = hideFilePicker;
(window as any).selectImage = selectImage;

// Session management
(window as any).newSession = newSession;
(window as any).toggleConversationHistory = toggleConversationHistory;
(window as any).restoreToCommit = restoreToCommit;
(window as any).requestConversationList = requestConversationList;
(window as any).loadConversation = loadConversation;

// Settings and modal management
(window as any).toggleSettings = toggleSettings;
(window as any).toggleStatusInfo = toggleStatusInfo;
(window as any).updateSettings = updateSettings;
(window as any).updateServerForm = updateServerForm;

// Modal control functions
(window as any).showModelSelector = showModelSelector;
(window as any).hideModelModal = hideModelModal;
(window as any).showSlashCommandsModal = showSlashCommandsModal;
(window as any).hideSlashCommandsModal = hideSlashCommandsModal;
(window as any).hideSettingsModal = hideSettingsModal;
(window as any).hideThinkingIntensityModal = hideThinkingIntensityModal;
(window as any).setThinkingIntensity = setThinkingIntensity;
(window as any).setThinkingIntensityValue = setThinkingIntensityValue;
(window as any).updateThinkingIntensityDisplay = updateThinkingIntensityDisplay;
(window as any).confirmThinkingIntensity = confirmThinkingIntensity;

// MCP Server management
(window as any).showMCPModal = showMCPModal;
(window as any).hideMCPModal = hideMCPModal;
(window as any).saveMCPServer = saveMCPServer;
(window as any).showAddServerForm = showAddServerForm;
(window as any).hideAddServerForm = hideAddServerForm;
(window as any).deleteMCPServer = deleteMCPServer;
(window as any).addPopularServer = addPopularServer;
(window as any).editMCPServer = editMCPServer;

// Content interaction functions (handled by event delegation, but keeping some for direct calls)
(window as any).copyMessageContent = copyMessageContent;
(window as any).copyCodeBlock = copyCodeBlock;

// Model and execution functions
(window as any).selectModel = selectModel;
(window as any).stopRequest = stopRequest;
(window as any).executeSlashCommand = executeSlashCommand;
(window as any).openModelTerminal = openModelTerminal;

// WSL functions
(window as any).showWSLAlert = showWSLAlert;
(window as any).dismissWSLAlert = dismissWSLAlert;
(window as any).openWSLSettings = openWSLSettings;

// Prompt snippet functions
(window as any).usePromptSnippet = usePromptSnippet;
(window as any).showAddSnippetForm = showAddSnippetForm;
(window as any).hideAddSnippetForm = hideAddSnippetForm;
(window as any).saveCustomSnippet = saveCustomSnippet;
(window as any).deleteCustomSnippet = deleteCustomSnippet;
(window as any).filterSlashCommands = filterSlashCommands;
(window as any).handleCustomCommandKeydown = handleCustomCommandKeydown;

// Permission management functions
(window as any).showAddPermissionForm = showAddPermissionForm;
(window as any).hideAddPermissionForm = hideAddPermissionForm;
(window as any).addPermission = addPermission;
(window as any).removePermission = removePermission;
(window as any).toggleCommandInput = toggleCommandInput;
(window as any).respondToPermission = respondToPermission;
(window as any).togglePermissionMenu = togglePermissionMenu;
(window as any).enableYoloModeFromPermission = enableYoloModeFromPermission;
