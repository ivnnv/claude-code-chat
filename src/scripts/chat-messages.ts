// Chat and message handling functionality
import '../types/global';

// Module references that will be set at runtime
let uiCoreRef: any;
let settingsModalsRef: any;

// VS Code API will be provided by ui-scripts.ts
let vscode: any;

// Note: These functions will be available at runtime through the main ui-scripts module
declare function isPermissionError(content: string): boolean;
declare function _enableYoloMode(): void;

// Global variables needed for these functions
let messageInput: HTMLTextAreaElement;
let planModeEnabled = false;
let thinkingModeEnabled = false;
let currentEditorContext: any = null;
let messageCounter = 0;

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

		// Add copy button
		// const copyBtn = document.createElement('button');
		// copyBtn.className = 'copy-btn';
		// copyBtn.title = 'Copy message';
		// copyBtn.onclick = () => copyMessageContent(contentDiv);
		// copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

		// // Position copy button absolutely in content area
		// copyBtn.style.position = 'absolute';
		// copyBtn.style.top = '8px';
		// copyBtn.style.right = '8px';
		// copyBtn.style.opacity = '0';
		// copyBtn.style.transition = 'opacity 0.2s ease';

		// contentDiv.appendChild(copyBtn);

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

		// Add copy button for Claude messages
		// const copyBtn = document.createElement('button');
		// copyBtn.className = 'copy-btn';
		// copyBtn.title = 'Copy message';
		// copyBtn.onclick = () => copyMessageContent(messageDiv);
		// copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

		// Position copy button absolutely in top-right
		// copyBtn.style.position = 'absolute';
		// copyBtn.style.top = '8px';
		// copyBtn.style.right = '8px';
		// copyBtn.style.opacity = '0';
		// copyBtn.style.transition = 'opacity 0.2s ease';

		// messageDiv.appendChild(copyBtn);

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
		// Add copy button directly to message div
		// const copyBtn = document.createElement('button');
		// copyBtn.className = 'copy-btn';
		// copyBtn.title = 'Copy message';
		// copyBtn.onclick = () => copyMessageContent(messageDiv);
		// copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

		// Position copy button absolutely in top-right
		// copyBtn.style.position = 'absolute';
		// copyBtn.style.top = '8px';
		// copyBtn.style.right = '8px';
		// copyBtn.style.opacity = '0';
		// copyBtn.style.transition = 'opacity 0.2s ease';

		// messageDiv.appendChild(copyBtn);
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
		window.lastPathToolMessage = pathMessageDiv;

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
	if (!window.isProcessing) {
		console.log('📤 Starting new processing session');
		window.isProcessing = true;
		if (uiCoreRef) {
			uiCoreRef.disableButtons();
			uiCoreRef.showStopButton();
		}
	} else {
		console.log('📤 Sending additional message while processing');
	}

	sendStats('Send message');

	// Send to VS Code
	vscode.postMessage({
		type: 'sendMessage',
		text: enhancedText,
		planMode: settingsModalsRef?.getPlanModeEnabled() || planModeEnabled,
		thinkingMode: settingsModalsRef?.getThinkingModeEnabled() || thinkingModeEnabled,
		editorContext: window.currentEditorContext || currentEditorContext
	});
}

export function stopRequest(): void {
	vscode.postMessage({ type: 'stopRequest' });
	window.isProcessing = false;
	if (uiCoreRef) {
		uiCoreRef.enableButtons();
		uiCoreRef.hideStopButton();
	}
}

export function clearMessages(): void {
	const messagesDiv = document.getElementById('chatMessages');
	if (messagesDiv) {
		messagesDiv.innerHTML = '';
	}
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

export function sendStats(eventName: string): void {
	// No user tracking - privacy first approach
	console.debug('Stats event (not tracked):', eventName);
}

export function copyMessageContent(messageDiv: HTMLElement): void {
	const contentDiv = messageDiv.querySelector('.message-content, .claudeMessage-content, .userMessage-content, .systemMessage-content');
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

export function copyCodeBlock(codeId: string): void {
	const codeElement = document.getElementById(codeId);
	if (codeElement) {
		const rawCode = codeElement.getAttribute('data-raw-code');
		if (rawCode) {
			// Decode HTML entities
			const decodedCode = (rawCode || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
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
}

// Utility functions for formatting
export function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
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

export function formatFilePath(filePath: string): string {
	const parts = filePath.split('/');
	if (parts.length > 3) {
		return '.../' + parts.slice(-2).join('/');
	}
	return filePath;
}

export function formatSingleEdit(edit: any, _editNumber: number): string {
	let result = '<div class="single-edit">';
	// Remove edit number since context is now in user message header
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

export function formatToolInputUI(input: any): string {
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
	// Special handling for Read tool with file_path
	if (input.file_path && Object.keys(input).length === 1) {
		const formattedPath = formatFilePath(input.file_path);
		return '<div class="diff-file-path" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer;">' + formattedPath + '</div>';
	}
	let result = '';
	let isFirst = true;
	for (const [key, value] of Object.entries(input)) {
		// Skip internal parameters that don't need to be shown
		if (key === 'offset' || key === 'limit') {
			continue;
		}

		const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
		if (!isFirst) {result += '\n';}
		isFirst = false;
		// Special formatting for file_path in Read tool context
		if (key === 'file_path') {
			const formattedPath = formatFilePath(valueStr);
			result += '<div class="diff-file-path" data-file-path="' + escapeHtml(valueStr) + '" style="cursor: pointer;">' + formattedPath + '</div>';
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

export function formatEditToolDiff(input: any): string {
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

	// Create header with proper row structure and checkpoint support like monolithic version
	let changesRow = '<div class="diff-changes-row">';
	changesRow += '<span class="diff-changes-label">Changes:</span>';
	const currentCheckpoint = window.currentCheckpoint;
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

export function formatMultiEditToolDiff(input: any): string {
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

	// Create header with proper layout: number + timestamp + button on first row, file path on second row
	let headerContent = '<div class="diff-header-row" style="display: flex; justify-content: space-between; align-items: center;">';
	headerContent += '<span class="diff-changes-count">Changes (' + input.edits.length + ')</span>';

	// Add checkpoint timestamp and restore button if available
	const currentCheckpoint = window.currentCheckpoint;
	if (currentCheckpoint) {
		const timeAgo = new Date(currentCheckpoint.timestamp).toLocaleTimeString();
		headerContent += '<div class="diff-timestamp-group">';
		headerContent += '<span class="diff-timestamp">(' + timeAgo + ')</span>';
		headerContent += '<button class="diff-restore-btn" onclick="restoreToCommit(\'' + currentCheckpoint.sha + '\')" title="Restore checkpoint" style="margin-left: 5px;">↶</button>';
		headerContent += '</div>';
	}
	headerContent += '</div>';

	// Add file path on second row
	headerContent += '<div class="diff-file-path-row" style="margin-top: 4px;">';
	headerContent += '<span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer; font-size: 11px; opacity: 0.8;">' + formattedPath + '</span>';
	headerContent += '</div>';

	result += '<div class="diff-header">' + headerContent + '</div>';
	// Create a unique ID for this diff
	const diffId = 'multiEdit_' + Math.random().toString(36).substr(2, 9);
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

export function formatWriteToolDiff(input: any): string {
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

	// Create header with file path inline and checkpoint info
	let headerContent = 'New file content: <span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer; font-size: 10px; opacity: 0.7; font-weight: normal;">' + formattedPath + '</span>';

	// Add checkpoint timestamp and restore button if available
	const currentCheckpoint = window.currentCheckpoint;
	if (currentCheckpoint) {
		const timeAgo = new Date(currentCheckpoint.timestamp).toLocaleTimeString();
		headerContent += '<div class="diff-timestamp-group" style="float: right;">';
		headerContent += '<span class="diff-timestamp">(' + timeAgo + ')</span>';
		headerContent += '<button class="diff-restore-btn" onclick="restoreToCommit(\'' + currentCheckpoint.sha + '\')" title="Restore checkpoint" style="margin-left: 5px;">↶</button>';
		headerContent += '</div>';
	}

	result += '<div class="diff-header">' + headerContent + '</div>';
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

export function _createExpandableInput(toolInput: string, rawInput: any): string {
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

// Setters for global variables (to be called from ui-scripts.ts)
export function setMessageInput(input: HTMLTextAreaElement): void {
	messageInput = input;
}

export function setPlanModeEnabled(enabled: boolean): void {
	planModeEnabled = enabled;
}

export function setThinkingModeEnabled(enabled: boolean): void {
	thinkingModeEnabled = enabled;
}

export function setCurrentEditorContext(context: any): void {
	currentEditorContext = context;
}

// Set module references (called from ui-scripts.ts)
export function setModuleReferences(uiCore: any, settingsModals: any): void {
	uiCoreRef = uiCore;
	settingsModalsRef = settingsModals;
}

// Set VS Code API (called from ui-scripts.ts)
export function setVsCodeApi(api: any): void {
	vscode = api;
}
