// WSL, prompt snippets, and utility functions

declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

// Note: These functions will be available at runtime through the main ui-scripts module
declare function executeSlashCommand(command: string): void;
declare function showSettingsModal(): void;

// Global variables needed for these functions
let messageInput: HTMLTextAreaElement;
let filePickerModal: HTMLElement;
let fileSearchInput: HTMLInputElement;
let fileList: HTMLElement;
let filteredFiles: any[] = [];
let selectedFileIndex = -1;
let currentEditorContext: any = null;
let customSnippetsData: { [key: string]: any } = {};

// WSL Functions
export function showWSLAlert(): void {
	const alert = document.getElementById('wslAlert');
	if (alert) {alert.style.display = 'block';}
}

export function dismissWSLAlert(): void {
	const alert = document.getElementById('wslAlert');
	if (alert) {alert.style.display = 'none';}
	// Send dismiss message to extension to store in globalState
	vscode.postMessage({
		type: 'dismissWSLAlert'
	});
}

export function openWSLSettings(): void {
	// Dismiss the alert
	dismissWSLAlert();

	// Open settings modal
	showSettingsModal();
}

// Prompt Snippet Functions
function hideSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {modal.style.display = 'none';}
}

export function usePromptSnippet(snippetType: string): void {
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
}

export function showAddSnippetForm(): void {
	document.getElementById('addSnippetForm')!.style.display = 'block';
	document.getElementById('snippetName')!.focus();
}

export function hideAddSnippetForm(): void {
	document.getElementById('addSnippetForm')!.style.display = 'none';
	// Clear form fields
	(document.getElementById('snippetName') as HTMLInputElement).value = '';
	(document.getElementById('snippetPrompt') as HTMLTextAreaElement).value = '';
}

export function saveCustomSnippet(): void {
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
}

export function deleteCustomSnippet(snippetId: string): void {
	vscode.postMessage({
		type: 'deleteCustomSnippet',
		snippetId: snippetId
	});
}

export function filterSlashCommands(): void {
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
}

export function handleCustomCommandKeydown(event: KeyboardEvent): void {
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
}

// File Picker and Utility Functions
export function getFileIcon(filename: string): string {
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

export function renderFileList(): void {
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

export function selectFile(file: any): void {
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

export function filterFiles(searchTerm: string): void {
	// Send search request to backend instead of filtering locally
	vscode.postMessage({
		type: 'getWorkspaceFiles',
		searchTerm: searchTerm
	});
	selectedFileIndex = -1;
}

export function updateEditorContext(contextData: any): void {
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

export function _hideEditorContext(): void {
	const editorContextLine = document.getElementById('editorContextLine');
	if (editorContextLine) {
		editorContextLine.style.display = 'none';
	}
}

export function adjustTextareaHeight(): void {
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

// Setters for global variables (to be called from ui-scripts.ts)
export function setMessageInput(input: HTMLTextAreaElement): void {
	messageInput = input;
}

export function setFilePickerModal(modal: HTMLElement): void {
	filePickerModal = modal;
}

export function setFileSearchInput(input: HTMLInputElement): void {
	fileSearchInput = input;
}

export function setFileList(list: HTMLElement): void {
	fileList = list;
}

export function setFilteredFiles(files: any[]): void {
	filteredFiles = files;
}

export function setSelectedFileIndex(index: number): void {
	selectedFileIndex = index;
}

export function setCurrentEditorContext(context: any): void {
	currentEditorContext = context;
}

export function setCustomSnippetsData(data: { [key: string]: any }): void {
	customSnippetsData = data;
}

// Getters for state variables
export function getFilteredFiles(): any[] {
	return filteredFiles;
}

export function getSelectedFileIndex(): number {
	return selectedFileIndex;
}

export function getCurrentEditorContext(): any {
	return currentEditorContext;
}

export function getCustomSnippetsData(): { [key: string]: any } {
	return customSnippetsData;
}
