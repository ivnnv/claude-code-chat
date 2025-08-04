// Chat and message handling functionality

declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

// Note: These functions will be available at runtime through the main ui-scripts module
declare function isPermissionError(content: string): boolean;
declare function _enableYoloMode(): void;

// Global variables needed for these functions
let messageInput: HTMLTextAreaElement;
let planModeEnabled = false;
let thinkingModeEnabled = false;
let currentEditorContext: any = null;

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
	const messagesDiv = document.getElementById('messages')!;
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

export function addToolUseMessage(data: any): void {
	const messagesDiv = document.getElementById('messages');
	if (!messagesDiv) {return;}
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

	if (data.rawInput) {
		const inputElement = document.createElement('div');
		inputElement.className = 'tool-input';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'tool-input-content';

		// Handle TodoWrite specially or format raw input
		if (data.toolName === 'TodoWrite' && data.rawInput.todos) {
			let todoHtml = 'Todo List Update:';
			for (const todo of data.rawInput.todos) {
				const status = todo.status === 'completed' ? '✅' :
					todo.status === 'in_progress' ? '🔄' : '⏳';
				todoHtml += '\n' + status + ' ' + todo.content + ' <span class="priority-badge ' + todo.priority + '">' + todo.priority + '</span>';
			}
			contentDiv.innerHTML = todoHtml;
		} else {
			// Format raw input with expandable content for long values
			// Use diff format for Edit, MultiEdit, and Write tools, regular format for others
			if (data.toolName === 'Edit') {
				contentDiv.innerHTML = formatEditToolDiff(data.rawInput);
			} else if (data.toolName === 'MultiEdit') {
				contentDiv.innerHTML = formatMultiEditToolDiff(data.rawInput);
			} else if (data.toolName === 'Write') {
				contentDiv.innerHTML = formatWriteToolDiff(data.rawInput);
			} else {
				contentDiv.innerHTML = formatToolInputUI(data.rawInput);
			}
		}

		inputElement.appendChild(contentDiv);
		messageDiv.appendChild(inputElement);
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
	const text = messageInput.value.trim();

	if (text) {
		// Enhance message with editor context if available
		let enhancedText = text;
		const contextInfo = getEditorContextInfo();
		if (contextInfo) {
			enhancedText = contextInfo + '\n\n' + text;
		}
		sendStats('Send message');

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

export function getEditorContextInfo(): string | null {
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

export function sendStats(eventName: string): void {
	try {
		if (typeof (window as any).umami !== 'undefined' && (window as any).umami.track) {
			(window as any).umami.track(eventName);
		}
	} catch (error) {
		console.error('Error sending stats:', error);
	}
}

export function copyMessageContent(messageDiv: HTMLElement): void {
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

export function copyCodeBlock(codeId: string): void {
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
	return markdown
		.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.*?)\*/g, '<em>$1</em>')
		.replace(/`(.*?)`/g, '<code>$1</code>')
		.replace(/\n/g, '<br>');
}

export function formatFilePath(filePath: string): string {
	const parts = filePath.split('/');
	if (parts.length > 3) {
		return '.../' + parts.slice(-2).join('/');
	}
	return filePath;
}

export function formatSingleEdit(edit: any, editNumber: number): string {
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
	let result = '<div class="diff-file-path" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer;">' + formattedPath + '</div>\n';
	// Create diff view
	const oldLines = input.old_string.split('\n');
	const newLines = input.new_string.split('\n');
	const allLines = [...oldLines.map((line: string) => ({type: 'removed', content: line})),
					 ...newLines.map((line: string) => ({type: 'added', content: line}))];
	const maxLines = 6;
	const shouldTruncate = allLines.length > maxLines;
	const visibleLines = shouldTruncate ? allLines.slice(0, maxLines) : allLines;
	const hiddenLines = shouldTruncate ? allLines.slice(maxLines) : [];
	result += '<div class="diff-container">';
	result += '<div class="diff-header">Changes:</div>';
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
	let result = '<div class="diff-file-path" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer;">' + formattedPath + '</div>\n';
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
	result += '<div class="diff-container">';
	result += '<div class="diff-header">Changes (' + input.edits.length + ' edit' + (input.edits.length > 1 ? 's' : '') + '):</div>';
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
	let result = '<div class="diff-file-path" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer;">' + formattedPath + '</div>\n';
	// Create diff view showing all content as additions
	const contentLines = input.content.split('\n');
	const maxLines = 6;
	const shouldTruncate = contentLines.length > maxLines;
	const visibleLines = shouldTruncate ? contentLines.slice(0, maxLines) : contentLines;
	const hiddenLines = shouldTruncate ? contentLines.slice(maxLines) : [];
	result += '<div class="diff-container">';
	result += '<div class="diff-header">New file content:</div>';
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
