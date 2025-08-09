// UI Core for Webview - Contains all webview-safe UI functions without Node.js/vscode dependencies
// Adapted from original ui-core.ts and chat-messages.ts from master.backup
import '../types/global';
import { formatFilePath, formatEditToolDiff, formatMultiEditToolDiff, formatWriteToolDiff, formatToolInputUI, escapeHtml } from './formatters';

// Module references that will be set at runtime
let _uiCoreRef: any;
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
let currentModel = 'opus';

export function setVsCodeApi(api: any): void {
	vsCodeApi = api;
}

export function setModuleReferences(uiCore: any, settingsModals: any): void {
	_uiCoreRef = uiCore;
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
	if (type === 'error' && isPermissionError && isPermissionError(content)) {
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
	}
	// Reset message counter
	messageCounter = 0;
}

export function sendMessage(): void {
	if (!messageInput || !vsCodeApi) {
		return;
	}

	const messageText = messageInput.value.trim();
	if (!messageText) {
		return;
	}

	// Clear the input
	messageInput.value = '';
	messageInput.style.height = 'auto';

	// Add user message immediately to UI
	addMessage(messageText, 'user');

	// Send to extension
	vsCodeApi.postMessage({
		type: 'sendMessage',
		text: messageText,
		planMode: _planModeEnabled,
		thinkingMode: _thinkingModeEnabled,
		editorContext: currentEditorContext
	});
}

export function stopRequest(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'stopRequest' });
	}
}

export function addToolResultMessage(data: any): void {
	if (!data) {
		return;
	}
	const messagesDiv = document.getElementById('chatMessages');
	if (!messagesDiv) {
		return;
	}
	const shouldScroll = shouldAutoScroll(messagesDiv);

	// Read tools skip showing toolResult - visual context shows it's a read operation

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

	if (isPathTool && !data.isError && (window as any).lastPathToolMessage) {
		// Append result as systemMessage-content to existing pathTool message
		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';

		let content = data.content || '';
		if (content.length > 200) {
			const truncateAt = 197;
			content = content.substring(0, truncateAt) + '...';
		}
		contentDiv.innerHTML = `<pre>${content}</pre>`;

		(window as any).lastPathToolMessage.appendChild(contentDiv);
		(window as any).lastPathToolMessage = undefined; // Clear reference

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
		const resultId = 'result_' + Math.random().toString(36).substring(2, 11);
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
	if (data.isError && isPermissionError && isPermissionError(content)) {
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

// Rest of the ui-core functions adapted for webview usage
export function sendStats(action: string): void {
	// Send usage stats to extension for tracking
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'stats', action: action });
	}
}

export function getEditorContextInfo(): string | null {
	if (!currentEditorContext) {
		return null;
	}

	const { filePath, language, selectedText, lineNumber } = currentEditorContext;

	if (selectedText && selectedText.trim()) {
		return `in ${filePath} (${language}) - Selected text on line ${lineNumber}`;
	} else if (filePath) {
		return `in ${filePath} (${language})`;
	}

	return null;
}

// Modal management functions
export function initializeModals(): void {
	// Initialize modal behaviors
	const modals = document.querySelectorAll('.modal');
	modals.forEach(modal => {
		// Close modal when clicking outside of it
		modal.addEventListener('click', (e) => {
			if (e.target === modal) {
				(modal as HTMLElement).style.display = 'none';
			}
		});
	});

	// Initialize file picker modal functionality
	const fileSearchInput = document.getElementById('fileSearchInput') as HTMLInputElement;
	if (fileSearchInput) {
		fileSearchInput.addEventListener('input', (e) => {
			const searchTerm = (e.target as HTMLInputElement).value;
			if (vsCodeApi) {
				vsCodeApi.postMessage({
					type: 'searchFiles',
					searchTerm: searchTerm
				});
			}
		});
	}
}

export function initialize(): void {
	initializeModals();
}

// Additional functions needed by ui-scripts.ts
export function copyMessageContent(messageDiv: HTMLElement): void {
	const contentDiv = messageDiv.querySelector('.message-content, .claudeMessage-content, .userMessage-content, .systemMessage-content');
	if (contentDiv) {
		// Get text content, preserving line breaks
		const text = contentDiv.textContent || '';

		// Copy to clipboard
		navigator.clipboard.writeText(text).then(() => {
			// Show brief feedback - removed since no copy buttons in current implementation
		}).catch(err => {
			console.error('Failed to copy message:', err);
		});
	}
}

export function copyCodeBlock(codeId: string): void {
	const codeElement = document.getElementById(codeId);
	if (codeElement) {
		const rawCode = codeElement.getAttribute('data-raw-code');
		if (rawCode) {
			// Decode HTML entities
			const decodedCode = (rawCode || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
			navigator.clipboard.writeText(decodedCode).then(() => {
				// Show temporary feedback
			}).catch(err => {
				console.error('Failed to copy code:', err);
			});
		}
	}
}

export function showFilePicker(): void {
	const modal = document.getElementById('filePickerModal');
	if (modal) {
		modal.style.display = 'flex';
		// Focus on search input
		const searchInput = document.getElementById('fileSearchInput') as HTMLInputElement;
		if (searchInput) {
			searchInput.focus();
			searchInput.value = '';
		}
		// Request file list from extension
		if (vsCodeApi) {
			vsCodeApi.postMessage({ type: 'getFileList' });
		}
	}
}

export function selectImage(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'selectImage' });
	}
}

export function showModelSelector(): void {
	const modal = document.getElementById('modelModal');
	if (modal) {
		modal.style.display = 'flex';
		// Request current model from extension
		if (vsCodeApi) {
			vsCodeApi.postMessage({ type: 'getCurrentModel' });
		}
	}
}

export function hideModelModal(): void {
	const modal = document.getElementById('modelModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

export function showSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {
		modal.style.display = 'flex';
		// Focus on search input
		const searchInput = document.getElementById('slashCommandsSearch') as HTMLInputElement;
		if (searchInput) {
			searchInput.focus();
		}
	}
}

export function hideSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

export function newSession(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'newSession' });
	}
	// Clear UI immediately
	clearMessages();
}

export function toggleConversationHistory(): void {
	const modal = document.getElementById('conversationHistoryModal');
	if (modal) {
		if (modal.style.display === 'flex') {
			modal.style.display = 'none';
		} else {
			modal.style.display = 'flex';
			// Request conversation list from extension
			if (vsCodeApi) {
				vsCodeApi.postMessage({ type: 'getConversationList' });
			}
		}
	}
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
	const content = button.parentElement?.querySelector('.expandable-content');
	if (!content) {return;}

	const isExpanded = content.classList.contains('expanded');
	if (isExpanded) {
		content.classList.remove('expanded');
		button.textContent = 'Show more';
	} else {
		content.classList.add('expanded');
		button.textContent = 'Show less';
	}

	// Auto-scroll if expanding and user is near the bottom
	const messagesDiv = document.getElementById('chatMessages');
	if (messagesDiv && !isExpanded && shouldAutoScroll(messagesDiv)) {
		setTimeout(() => scrollToBottomIfNeeded(messagesDiv), 100);
	}
}

export function toggleDiffExpansion(diffId: string): void {
	const diffElement = document.getElementById(diffId);
	if (!diffElement) {return;}

	const content = diffElement.querySelector('.diff-content');
	const toggleBtn = diffElement.querySelector('.expand-toggle');

	if (content && toggleBtn) {
		const isExpanded = content.classList.contains('expanded');
		if (isExpanded) {
			content.classList.remove('expanded');
			toggleBtn.textContent = 'Show more';
		} else {
			content.classList.add('expanded');
			toggleBtn.textContent = 'Show less';
		}
	}
}

export function restoreToCommit(commitSha: string): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'restoreToCommit',
			sha: commitSha
		});
	}
}

export function loadConversation(filename: string): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'loadConversation',
			filename: filename
		});
	}

	// Hide the conversation history modal
	const modal = document.getElementById('conversationHistoryModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

export function showRestoreContainer(data: any): void {
	// This function shows the restore option for git commits
	// Implementation depends on the specific data structure
	console.log('Show restore container:', data);
}

export function showSessionInfo(sessionId: string): void {
	// Show session information modal or notification
	const sessionInfoDiv = document.getElementById('sessionInfo');
	if (sessionInfoDiv) {
		sessionInfoDiv.style.display = 'block';
		sessionInfoDiv.innerHTML = `
			<div class="session-info-content">
				<h3>Session Information</h3>
				<p><strong>Session ID:</strong> ${escapeHtml(sessionId)}</p>
				<button class="session-close-btn">Close</button>
				<button class="session-copy-btn" data-session-id="${escapeHtml(sessionId)}">Copy ID</button>
			</div>
		`;
	}
}

export function hideSessionInfo(): void {
	const sessionInfoDiv = document.getElementById('sessionInfo');
	if (sessionInfoDiv) {
		sessionInfoDiv.style.display = 'none';
	}
}

export function _copySessionId(sessionId: string): void {
	navigator.clipboard.writeText(sessionId).then(() => {
		// Visual feedback
		const copyBtn = document.querySelector('.copy-session-btn');
		if (copyBtn) {
			copyBtn.innerHTML = '✅ Copied';
			setTimeout(() => {
				copyBtn.innerHTML = '📋 Copy ID';
			}, 1000);
		}
	}).catch(err => {
		console.error('Failed to copy session ID:', err);
	});
}

export function toggleStatusPopover(): void {
	const statusPopover = document.getElementById('statusPopover');
	const statusButton = document.getElementById('statusButton');

	if (statusPopover && statusButton) {
		const isVisible = statusPopover.style.display === 'block';
		statusPopover.style.display = isVisible ? 'none' : 'block';

		if (!isVisible) {
			// Update content when showing
			updateStatusPopoverContent();

			// Position the popover relative to the status button
			const buttonRect = statusButton.getBoundingClientRect();
			statusPopover.style.top = `${buttonRect.bottom + 5}px`;
			statusPopover.style.right = '10px';
		}
	}
}

export function updateStatusPopoverContent(): void {
	const statusContent = document.getElementById('statusPopoverContent');
	if (!statusContent) {return;}

	// Get current totals from global window variables
	const totalCost = (window as any).totalCost || 0;
	const totalTokensInput = (window as any).totalTokensInput || 0;
	const totalTokensOutput = (window as any).totalTokensOutput || 0;
	const lastRequestCost = (window as any).lastRequestCost || 0;
	const lastRequestTokens = (window as any).lastRequestTokens || 0;

	const totalTokens = totalTokensInput + totalTokensOutput;

	statusContent.innerHTML = `
		<div class="status-row">
			<span class="status-label">Session Cost:</span>
			<span class="status-value">$${totalCost.toFixed(4)}</span>
		</div>
		<div class="status-row">
			<span class="status-label">Session Tokens:</span>
			<span class="status-value">${totalTokens.toLocaleString()}</span>
		</div>
		<div class="status-divider"></div>
		<div class="status-row">
			<span class="status-label">Last Request:</span>
			<span class="status-value">$${lastRequestCost.toFixed(4)}</span>
		</div>
		<div class="status-row">
			<span class="status-label">Last Tokens:</span>
			<span class="status-value">${lastRequestTokens.toLocaleString()}</span>
		</div>
		<div class="status-divider"></div>
		<div class="status-row">
			<span class="status-label">Model:</span>
			<span class="status-value">${currentModel}</span>
		</div>
	`;
}

export function updateInputStatusIndicator(): void {
	// Simple status indicator update
	const statusElement = document.getElementById('statusIndicator');
	if (statusElement) {
		const currentStatus = (window as any).currentStatus || 'ready';
		statusElement.textContent = currentStatus === 'processing' ? '🔄' : '✅';
	}
}

export function updateEditorContextDisplay(contextData: any): void {
	// Update the editor context display in the UI
	const contextDisplay = document.getElementById('editorContextDisplay');
	if (!contextDisplay) {return;}

	if (!contextData || !contextData.filePath) {
		contextDisplay.style.display = 'none';
		return;
	}

	const { filePath, language, selectedText, lineNumber } = contextData;

	let contextText = '';
	if (selectedText && selectedText.trim()) {
		contextText = `📄 ${formatFilePath(filePath)} (${language}) - Line ${lineNumber}`;
	} else if (filePath) {
		contextText = `📄 ${formatFilePath(filePath)} (${language})`;
	}

	if (contextText) {
		contextDisplay.innerHTML = `
			<span class="context-text">${escapeHtml(contextText)}</span>
			<button class="context-clear" title="Clear context">×</button>
		`;
		contextDisplay.style.display = 'flex';
	} else {
		contextDisplay.style.display = 'none';
	}
}

export function enableButtons(): void {
	const sendButton = document.getElementById('sendButton') as HTMLButtonElement;
	if (sendButton) {
		sendButton.disabled = false;
	}

	if (messageInput) {
		messageInput.disabled = false;
	}
}

export function disableButtons(): void {
	const sendButton = document.getElementById('sendButton') as HTMLButtonElement;
	if (sendButton) {
		sendButton.disabled = true;
	}

	if (messageInput) {
		messageInput.disabled = true;
	}
}

export function showStopButton(): void {
	const stopButton = document.getElementById('stopButton');
	const sendButton = document.getElementById('sendButton');

	if (stopButton && sendButton) {
		stopButton.style.display = 'inline-block';
		sendButton.style.display = 'none';
	}
}

export function hideStopButton(): void {
	const stopButton = document.getElementById('stopButton');
	const sendButton = document.getElementById('sendButton');

	if (stopButton && sendButton) {
		stopButton.style.display = 'none';
		sendButton.style.display = 'inline-block';
	}
}

export function displayConversationList(conversations: any[]): void {
	const conversationList = document.getElementById('conversationList');
	if (!conversationList || !Array.isArray(conversations)) {
		return;
	}

	if (conversations.length === 0) {
		conversationList.innerHTML = '<div class="no-conversations">No saved conversations found</div>';
		return;
	}

	conversationList.innerHTML = conversations.map(conv => `
		<div class="conversation-item" data-filename="${escapeHtml(conv.filename)}">
			<div class="conversation-name">${escapeHtml(conv.name || conv.filename)}</div>
			<div class="conversation-date">${escapeHtml(conv.lastModified || '')}</div>
		</div>
	`).join('');
}

export function reloadCSS(): void {
	const links = document.querySelectorAll('link[rel="stylesheet"]');
	links.forEach(link => {
		const href = link.getAttribute('href');
		if (href) {
			link.setAttribute('href', href + '?t=' + Date.now());
		}
	});
}
