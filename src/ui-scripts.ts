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

function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function createExpandableInput(toolInput: string, rawInput: any): string {
	try {
		let html = toolInput.replace(/\[expand\]/g, '<span class="expand-btn" onclick="toggleExpand(this)">expand</span>');
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
				   '<button class="diff-expand-btn" onclick="toggleResultExpansion(\'' + inputId + '\')">Show more</button>' +
				   '</div>';
		}
		return str;
	}
	// Special handling for Read tool with file_path
	if (input.file_path && Object.keys(input).length === 1) {
		const formattedPath = formatFilePath(input.file_path);
		return '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>';
	}
	let result = '';
	let isFirst = true;
	for (const [key, value] of Object.entries(input)) {
		const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
		if (!isFirst) result += '\n';
		isFirst = false;
		// Special formatting for file_path in Read tool context
		if (key === 'file_path') {
			const formattedPath = formatFilePath(valueStr);
			result += '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(valueStr) + '\')">' + formattedPath + '</div>';
		} else if (valueStr.length > 100) {
			const truncated = valueStr.substring(0, 97) + '...';
			const escapedValue = valueStr.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
			result += '<span class="expandable-item"><strong>' + key + ':</strong> ' + truncated + ' <span class="expand-btn" data-key="' + key + '" data-value="' + escapedValue + '" onclick="toggleExpand(this)">expand</span></span>';
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
	let result = '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>\n';
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
		result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\'' + diffId + '\')">Show ' + hiddenLines.length + ' more lines</button>';
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
	let result = '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>\n';
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
		if (!edit.old_string || !edit.new_string) continue;
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
		if (i > 0) result += '<div class="diff-edit-separator"></div>';
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
		result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\'' + diffId + '\')">Show ' + hiddenEdits.length + ' more edit' + (hiddenEdits.length > 1 ? 's' : '') + '</button>';
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
	let result = '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>\n';
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
		result += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\'' + diffId + '\')">Show ' + hiddenLines.length + ' more lines</button>';
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

function hideEditorContext(): void {
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
	if (addServerBtn) addServerBtn.style.display = 'none';
	if (popularServers) popularServers.style.display = 'none';
	if (addServerForm) addServerForm.style.display = 'block';
}

function hideAddServerForm(): void {
	const addServerBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addServerForm = document.getElementById('addServerForm');
	if (addServerBtn) addServerBtn.style.display = 'block';
	if (popularServers) popularServers.style.display = 'block';
	if (addServerForm) addServerForm.style.display = 'none';
	// Reset form title and button
	const formTitle = document.querySelector('#addServerForm h5');
	if (formTitle) formTitle.remove();
	const submitBtn = document.querySelector('#addServerForm .btn');
	if (submitBtn) submitBtn.textContent = 'Add Server';
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

	vscode.postMessage({
		type: 'newSession'
	});
}

(window as any).togglePlanMode = togglePlanMode;

(window as any).toggleThinkingMode = toggleThinkingMode;

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

(window as any).sendMessage = sendMessage;

// Duplicate stopRequest removed - using properly typed version defined later

(window as any).enableYoloMode = enableYoloMode;

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

(window as any).showAddServerForm = showAddServerForm;
(window as any).hideAddServerForm = hideAddServerForm;

// Duplicate updateServerForm removed - using the one defined later with proper typing

function saveMCPServer(): void {
	const serverName = (document.getElementById('serverName') as HTMLInputElement)?.value;
	const serverType = (document.getElementById('serverType') as HTMLSelectElement)?.value;
	const serverCommand = (document.getElementById('serverCommand') as HTMLInputElement)?.value;
	const serverUrl = (document.getElementById('serverUrl') as HTMLInputElement)?.value;
	const serverArgs = (document.getElementById('serverArgs') as HTMLTextAreaElement)?.value;
	const serverEnv = (document.getElementById('serverEnv') as HTMLTextAreaElement)?.value;
	const serverHeaders = (document.getElementById('serverHeaders') as HTMLTextAreaElement)?.value;
	
	if (!serverName) {
		alert('Please enter a server name');
		return;
	}
	
	const config: any = { type: serverType };
	
	if (serverType === 'stdio') {
		if (!serverCommand) {
			alert('Please enter a command');
			return;
		}
		config.command = serverCommand;
		if (serverArgs) {
			config.args = serverArgs.split('\n').filter(arg => arg.trim());
		}
		if (serverEnv) {
			config.env = {};
			serverEnv.split('\n').forEach(line => {
				const [key, value] = line.split('=');
				if (key && value) config.env[key.trim()] = value.trim();
			});
		}
	} else {
		if (!serverUrl) {
			alert('Please enter a URL');
			return;
		}
		config.url = serverUrl;
		if (serverHeaders) {
			config.headers = {};
			serverHeaders.split('\n').forEach(line => {
				const [key, value] = line.split('=');
				if (key && value) config.headers[key.trim()] = value.trim();
			});
		}
	}
	
	vscode.postMessage({
		type: 'saveMCPServer',
		serverName,
		config
	});
	
	hideAddServerForm();
}

(window as any).deleteMCPServer = function(serverName: string) {
	if (confirm(`Delete MCP server "${serverName}"?`)) {
		vscode.postMessage({
			type: 'deleteMCPServer',
			serverName
		});
	}
};

(window as any).addPopularServer = function(name: string, config: any) {
	vscode.postMessage({
		type: 'saveMCPServer',
		serverName: name,
		config
	});
};

(window as any).toggleResultExpansion = function(resultId: string) {
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
};

(window as any).toggleExpand = function(button: HTMLElement) {
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
};

(window as any).toggleDiffExpansion = function(diffId: string) {
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
};

// Additional essential utility functions from original ui.ts

// Duplicate functions removed - using original implementations above

(window as any).hideThinkingIntensityModal = function() {
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) modal.style.display = 'none';
};

(window as any).setThinkingIntensity = function(intensity: string) {
	const toggleLabel = document.getElementById('thinkingModeLabel');
	if (toggleLabel) {
		toggleLabel.textContent = `Thinking Mode (${intensity})`;
	}
	
	vscode.postMessage({
		type: 'setThinkingIntensity',
		intensity: intensity
	});
	
	(window as any).hideThinkingIntensityModal();
};

// Plan mode and thinking mode toggles - expose to global scope
(window as any).togglePlanMode = function() {
	planModeEnabled = !planModeEnabled;
	const switchElement = document.getElementById('planModeSwitch');
	if (planModeEnabled) {
		switchElement?.classList.add('active');
	} else {
		switchElement?.classList.remove('active');
	}
};

(window as any).toggleThinkingMode = function() {
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
};

// Global sendMessage function
(window as any).sendMessage = sendMessage;

// Missing global variables for MCP server editing state
let editingServerName: string | null = null;

// Store custom snippets data globally
let customSnippetsData: any = {};

// Additional essential global functions - exposed to window for HTML onclick handlers
(window as any).enableYoloMode = function() {
	sendStats('YOLO mode enabled');

	// Update the checkbox
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	if (yoloModeCheckbox) {
		yoloModeCheckbox.checked = true;

		// Trigger the settings update
		(window as any).updateSettings();

		// Show confirmation message
		addMessage('✅ Yolo Mode enabled! All permission checks will be bypassed for future commands.', 'system');

		// Update the warning banner
		updateYoloWarning();
	}
};

// Settings update function
(window as any).updateSettings = function() {
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
	const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
	const wslEnabledCheckbox = document.getElementById('wsl-enabled') as HTMLInputElement;
	const wslDistroInput = document.getElementById('wsl-distro') as HTMLInputElement;
	const wslNodePathInput = document.getElementById('wsl-node-path') as HTMLInputElement;
	const wslClaudePathInput = document.getElementById('wsl-claude-path') as HTMLInputElement;

	const wslEnabled = wslEnabledCheckbox?.checked || false;
	const wslDistro = wslDistroInput?.value || 'Ubuntu';
	const wslNodePath = wslNodePathInput?.value || '/usr/bin/node';
	const wslClaudePath = wslClaudePathInput?.value || '/usr/local/bin/claude';

	// Update WSL options visibility
	const wslOptions = document.getElementById('wslOptions');
	if (wslOptions) {
		wslOptions.style.display = wslEnabled ? 'block' : 'none';
	}

	const settings = {
		'permissions.yoloMode': yoloModeCheckbox?.checked || false,
		'ui.theme': themeSelect?.value || 'auto',
		'model': modelSelect?.value || 'claude-3-5-sonnet-20241022',
		'wsl.enabled': wslEnabled,
		'wsl.distro': wslDistro,
		'wsl.nodePath': wslNodePath,
		'wsl.claudePath': wslClaudePath
	};

	vscode.postMessage({
		type: 'updateSettings',
		settings: settings
	});
};

// Modal management functions - exposed to global scope for HTML onclick handlers
(window as any).showModelSelector = function() {
	const modal = document.getElementById('modelModal');
	if (modal) modal.style.display = 'flex';
	// Select the current model radio button
	const currentModel = 'claude-3-5-sonnet-20241022'; // Default model
	const radioButton = document.getElementById('model-' + currentModel);
	if (radioButton) {
		(radioButton as HTMLInputElement).checked = true;
	}
};

// Duplicate modal functions removed - using properly typed versions defined later

(window as any).executeSlashCommand = function(command: string) {
	// Hide the modal
	hideSlashCommandsModal();
	
	// Clear the input since user selected a command
	messageInput.value = '';
	
	// Send command to VS Code to execute in terminal
	vscode.postMessage({
		type: 'executeSlashCommand',
		command: command
	});
};

// WSL Alert functions
(window as any).showWSLAlert = function() {
	const alert = document.getElementById('wslAlert');
	if (alert) alert.style.display = 'block';
};

(window as any).dismissWSLAlert = function() {
	const alert = document.getElementById('wslAlert');
	if (alert) alert.style.display = 'none';
	// Send dismiss message to extension to store in globalState
	vscode.postMessage({
		type: 'dismissWSLAlert'
	});
};

(window as any).openWSLSettings = function() {
	// Dismiss the alert
	(window as any).dismissWSLAlert();
	
	// Open settings modal
	(window as any).toggleSettings();
};

// MCP Server display and editing functions
function displayMCPServers(servers: any): void {
	const serversList = document.getElementById('mcpServersList');
	if (!serversList) return;
	
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

(window as any).editMCPServer = function(name: string, config: any) {
	// Set editing state
	editingServerName = name;

	// Hide add button and popular servers
	const addBtn = document.getElementById('addServerBtn');
	const popularServers = document.getElementById('popularServers');
	const addForm = document.getElementById('addServerForm');
	
	if (addBtn) addBtn.style.display = 'none';
	if (popularServers) popularServers.style.display = 'none';
	if (addForm) addForm.style.display = 'block';

	// Update form title and button
	if (!document.querySelector('#addServerForm h5')) {
		addForm?.insertAdjacentHTML('afterbegin', '<h5 style="margin: 0 0 20px 0; font-size: 14px; font-weight: 600;">Edit MCP Server</h5>');
	} else {
		const title = document.querySelector('#addServerForm h5');
		if (title) title.textContent = 'Edit MCP Server';
	}

	// Update save button text
	const saveBtn = document.querySelector('#addServerForm .btn:not(.outlined)');
	if (saveBtn) saveBtn.textContent = 'Update Server';

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

	if (serverType) serverType.value = config.type || 'stdio';

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
(window as any).usePromptSnippet = function(snippetType: string) {
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
		(window as any).hideSlashCommandsModal();

		// Insert the prompt into the message input
		messageInput.value = promptText;
		messageInput.focus();

		// Auto-resize the textarea
		adjustTextareaHeight();
	}
};

(window as any).showAddSnippetForm = function() {
	const form = document.getElementById('addSnippetForm');
	if (form) form.style.display = 'block';
	const nameInput = document.getElementById('snippetName') as HTMLInputElement;
	if (nameInput) nameInput.focus();
};

(window as any).hideAddSnippetForm = function() {
	const form = document.getElementById('addSnippetForm');
	if (form) form.style.display = 'none';
	// Clear form fields
	const nameInput = document.getElementById('snippetName') as HTMLInputElement;
	const promptInput = document.getElementById('snippetPrompt') as HTMLTextAreaElement;
	if (nameInput) nameInput.value = '';
	if (promptInput) promptInput.value = '';
};

(window as any).saveCustomSnippet = function() {
	const nameInput = document.getElementById('snippetName') as HTMLInputElement;
	const promptInput = document.getElementById('snippetPrompt') as HTMLTextAreaElement;
	
	const name = nameInput?.value.trim();
	const prompt = promptInput?.value.trim();

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
	(window as any).hideAddSnippetForm();
};

function loadCustomSnippets(snippetsData: any = {}): void {
	const snippetsList = document.getElementById('promptSnippetsList');
	if (!snippetsList) return;

	// Remove existing custom snippets
	const existingCustom = snippetsList.querySelectorAll('.custom-snippet-item');
	existingCustom.forEach(item => item.remove());

	// Add custom snippets after the add button and form
	const addForm = document.getElementById('addSnippetForm');
	if (!addForm) return;

	Object.values(snippetsData).forEach((snippet: any) => {
		const snippetElement = document.createElement('div');
		snippetElement.className = 'slash-command-item prompt-snippet-item custom-snippet-item';
		snippetElement.onclick = () => (window as any).usePromptSnippet(snippet.id);

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

(window as any).deleteCustomSnippet = function(snippetId: string) {
	vscode.postMessage({
		type: 'deleteCustomSnippet',
		snippetId: snippetId
	});
};

(window as any).filterSlashCommands = function() {
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

(window as any).handleCustomCommandKeydown = function(event: KeyboardEvent) {
	if (event.key === 'Enter') {
		event.preventDefault();
		const target = event.target as HTMLInputElement;
		const customCommand = target.value.trim();
		if (customCommand) {
			(window as any).executeSlashCommand(customCommand);
			// Clear the input for next use
			target.value = '';
		}
	}
};

(window as any).openModelTerminal = function() {
	vscode.postMessage({
		type: 'openModelTerminal'
	});
};

// updateServerForm function that was missing
function updateServerForm(): void {
	const serverType = (document.getElementById('serverType') as HTMLSelectElement)?.value;
	const commandGroup = document.getElementById('commandGroup');
	const urlGroup = document.getElementById('urlGroup');
	const argsGroup = document.getElementById('argsGroup');
	const envGroup = document.getElementById('envGroup');
	const headersGroup = document.getElementById('headersGroup');

	if (serverType === 'stdio') {
		if (commandGroup) commandGroup.style.display = 'block';
		if (urlGroup) urlGroup.style.display = 'none';
		if (argsGroup) argsGroup.style.display = 'block';
		if (envGroup) envGroup.style.display = 'block';
		if (headersGroup) headersGroup.style.display = 'none';
	} else if (serverType === 'http' || serverType === 'sse') {
		if (commandGroup) commandGroup.style.display = 'none';
		if (urlGroup) urlGroup.style.display = 'block';
		if (argsGroup) argsGroup.style.display = 'none';
		if (envGroup) envGroup.style.display = 'none';
		if (headersGroup) headersGroup.style.display = 'block';
	}
}

// Hide modal functions for close buttons (X)
function hideSettingsModal(): void {
	const modal = document.getElementById('settingsModal');
	if (modal) modal.style.display = 'none';
}

function hideModelModal(): void {
	const modal = document.getElementById('modelModal');
	if (modal) modal.style.display = 'none';
}

function hideSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) modal.style.display = 'none';
}

function hideThinkingIntensityModal(): void {
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) modal.style.display = 'none';
}

function showModelSelector(): void {
	const modal = document.getElementById('modelModal');
	if (modal) modal.style.display = 'flex';
	// Select the current model radio button
	const radioButton = document.getElementById('model-' + currentModel) as HTMLInputElement;
	if (radioButton) {
		radioButton.checked = true;
	}
}

function showSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) modal.style.display = 'flex';
	// Auto-focus the search input
	setTimeout(() => {
		const searchInput = document.getElementById('slashCommandsSearch') as HTMLInputElement;
		if (searchInput) searchInput.focus();
	}, 100);
}

// Expose essential functions to global scope for HTML onclick handlers
(window as any).updateServerForm = updateServerForm;
(window as any).toggleSettings = toggleSettings;
(window as any).toggleConversationHistory = toggleConversationHistory;
(window as any).newSession = newSession;
(window as any).showFilePicker = showFilePicker;
(window as any).selectImage = selectImage;
(window as any).showMCPModal = showMCPModal;
(window as any).hideMCPModal = hideMCPModal;
(window as any).saveMCPServer = saveMCPServer;

// Expose show/hide modal functions for UI interactions
(window as any).showModelSelector = showModelSelector;
(window as any).showSlashCommandsModal = showSlashCommandsModal;
(window as any).hideSettingsModal = hideSettingsModal;
(window as any).hideModelModal = hideModelModal;
(window as any).hideSlashCommandsModal = hideSlashCommandsModal;
(window as any).hideThinkingIntensityModal = hideThinkingIntensityModal;

// Model selection functions
let currentModel = 'claude-3-5-sonnet-20241022'; // Default model

(window as any).selectModel = function(model: string, fromBackend: boolean = false) {
	currentModel = model;

	// Update the display text
	const displayNames: { [key: string]: string } = {
		'claude-3-opus-20240229': 'Opus',
		'claude-3-5-sonnet-20241022': 'Sonnet',
		'claude-3-5-haiku-20241022': 'Haiku',
		'default': 'Model'
	};
	const selectedModelEl = document.getElementById('selectedModel');
	if (selectedModelEl) {
		selectedModelEl.textContent = displayNames[model] || model;
	}

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

	(window as any).hideModelModal();
};

// Stop request function
(window as any).stopRequest = function() {
	sendStats('Stop request');

	vscode.postMessage({
		type: 'stopRequest'
	});
	hideStopButton();
};

// Copy functions
(window as any).copyMessageContent = function(messageDiv: HTMLElement) {
	const contentDiv = messageDiv.querySelector('.message-content');
	if (contentDiv) {
		// Get text content, preserving line breaks
		const text = contentDiv.textContent || '';

		// Copy to clipboard
		navigator.clipboard.writeText(text).then(() => {
			// Show brief feedback
			const copyBtn = messageDiv.querySelector('.copy-btn') as HTMLElement;
			if (copyBtn) {
				const originalHtml = copyBtn.innerHTML;
				copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
				copyBtn.style.color = '#4caf50';

				setTimeout(() => {
					copyBtn.innerHTML = originalHtml;
					copyBtn.style.color = '';
				}, 1000);
			}
		}).catch(err => {
			console.error('Failed to copy message:', err);
		});
	}
};

(window as any).copyCodeBlock = function(codeId: string) {
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
	if (!permissionsList) return;

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

(window as any).removePermission = function(toolName: string, command: string | null) {
	vscode.postMessage({
		type: 'removePermission',
		toolName,
		command
	});
};

(window as any).showAddPermissionForm = function() {
	const showBtn = document.getElementById('showAddPermissionBtn');
	const form = document.getElementById('addPermissionForm');
	if (showBtn) showBtn.style.display = 'none';
	if (form) form.style.display = 'block';

	// Focus the select element
	setTimeout(() => {
		const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
		if (toolSelect) toolSelect.focus();
	}, 100);
};

function hideAddPermissionForm(): void {
	const showBtn = document.getElementById('showAddPermissionBtn');
	const form = document.getElementById('addPermissionForm');
	if (showBtn) showBtn.style.display = 'flex';
	if (form) form.style.display = 'none';

	// Reset form
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	if (toolSelect) toolSelect.value = '';
	if (commandInput) {
		commandInput.value = '';
		commandInput.style.display = 'none';
	}
}

(window as any).toggleCommandInput = function() {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	const hintDiv = document.getElementById('permissionsFormHint');

	if (toolSelect && commandInput) {
		if (toolSelect.value === 'Bash') {
			commandInput.style.display = 'block';
			commandInput.placeholder = 'Command pattern (e.g., npm i *)';
			if (hintDiv) hintDiv.textContent = 'Use * as wildcard. Example: npm i * allows any npm install command';
		} else {
			commandInput.style.display = 'none';
			if (hintDiv) hintDiv.textContent = '';
		}
	}
};

(window as any).addPermission = function() {
	const toolSelect = document.getElementById('addPermissionTool') as HTMLSelectElement;
	const commandInput = document.getElementById('addPermissionCommand') as HTMLInputElement;
	const addBtn = document.getElementById('addPermissionBtn') as HTMLButtonElement;

	if (!toolSelect || !addBtn) return;

	const toolName = toolSelect.value;
	if (!toolName) return;

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
	const messageDiv = document.createElement('div');
	messageDiv.className = 'message system permission-request';
	messageDiv.setAttribute('data-permission-id', data.id);

	const alwaysAllowDisabled = data.toolName === 'Bash' && !data.command;
	const alwaysAllowTooltip = alwaysAllowDisabled ? 'title="Cannot auto-allow all Bash commands for security"' : '';
	const alwaysAllowText = alwaysAllowDisabled ? 'Always Allow' : 'Always Allow';

	messageDiv.innerHTML = `
		<div class="message-content permission-content">
			<div class="permission-header">
				<div class="permission-title">
					<span>Permission Required</span>
				</div>
				<button class="permission-menu-btn" onclick="togglePermissionMenu('${data.id}')" title="More options">⋮</button>
				<div class="permission-menu" id="menu-${data.id}" style="display: none;">
					<div class="permission-menu-item" onclick="enableYoloModeFromPermission('${data.id}')">
						<span class="menu-title">Enable Yolo Mode</span>
						<span class="menu-subtitle">Auto-allow all permissions</span>
					</div>
				</div>
			</div>
			<div class="permission-details">
				<strong>${data.toolName}</strong> wants to ${data.command ? `run: <code>${escapeHtml(data.command)}</code>` : 'be used'}
			</div>
			<div class="permission-actions">
				<button class="btn deny" onclick="respondToPermission('${data.id}', false)">Deny</button>
				<button class="btn always-allow" onclick="respondToPermission('${data.id}', true, true)" ${alwaysAllowTooltip}>${alwaysAllowText}</button>
				<button class="btn allow" onclick="respondToPermission('${data.id}', true)">Allow</button>
			</div>
		</div>
	`;

	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, true);
}

(window as any).respondToPermission = function(id: string, approved: boolean, alwaysAllow: boolean = false) {
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

(window as any).togglePermissionMenu = function(permissionId: string) {
	const menu = document.getElementById(`menu-${permissionId}`);
	if (menu) {
		menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
	}
};

(window as any).enableYoloModeFromPermission = function(permissionId: string) {
	// Hide the menu first
	(window as any).togglePermissionMenu(permissionId);
	
	// Auto-approve this permission
	(window as any).respondToPermission(permissionId, true);
	
	// Enable yolo mode
	(window as any).enableYoloMode();
};

// Expose permissions functions to global scope
(window as any).showAddPermissionForm = (window as any).showAddPermissionForm;
(window as any).hideAddPermissionForm = hideAddPermissionForm;

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
				console.log('Settings data received');
				// Update settings form with received data
				const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
				const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
				const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
				const wslEnabledCheckbox = document.getElementById('wsl-enabled') as HTMLInputElement;
				const wslDistroInput = document.getElementById('wsl-distro') as HTMLInputElement;
				const wslNodePathInput = document.getElementById('wsl-node-path') as HTMLInputElement;
				const wslClaudePathInput = document.getElementById('wsl-claude-path') as HTMLInputElement;
				
				if (yoloModeCheckbox) yoloModeCheckbox.checked = message.data['permissions.yoloMode'] || false;
				if (themeSelect) themeSelect.value = message.data['ui.theme'] || 'auto';
				if (modelSelect) modelSelect.value = message.data['model'] || 'claude-3-5-sonnet-20241022';
				if (wslEnabledCheckbox) wslEnabledCheckbox.checked = message.data['wsl.enabled'] || false;
				if (wslDistroInput) wslDistroInput.value = message.data['wsl.distro'] || 'Ubuntu';
				if (wslNodePathInput) wslNodePathInput.value = message.data['wsl.nodePath'] || '/usr/bin/node';
				if (wslClaudePathInput) wslClaudePathInput.value = message.data['wsl.claudePath'] || '/usr/local/bin/claude';
				
				// Show/hide WSL options based on checkbox state
				const wslOptions = document.getElementById('wslOptions');
				if (wslOptions) {
					wslOptions.style.display = message.data['wsl.enabled'] ? 'block' : 'none';
				}
				
				// Update yolo warning
				updateYoloWarning();
				break;
			default:
				console.log('Unknown message type:', message.type);
		}
	});
});
