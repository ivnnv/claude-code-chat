// UI Webview - Browser-side UI functions (no Node.js dependencies)
import '../types/global';
import { formatFilePath, escapeHtml } from './formatters';

// VS Code API will be provided by ui-scripts.ts
let vsCodeApi: any;

// Global variables needed for these functions
let messageInput: HTMLTextAreaElement;
let _currentEditorContext: any = null;
let _messageCounter = 0;

export function setVsCodeApi(api: any): void {
	vsCodeApi = api;
}

export function setMessageInput(input: HTMLTextAreaElement): void {
	messageInput = input;
}

export function setCurrentEditorContext(context: any): void {
	_currentEditorContext = context;
}

export function initialize(): void {
	// Initialize UI webview components
}

// Core messaging functions
export function sendMessage(): void {
	if (!messageInput || !messageInput.value.trim()) {return;}

	const message = messageInput.value.trim();
	messageInput.value = '';

	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'userInput',
			data: message
		});
	}
}

export function stopRequest(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'stopRequest' });
	}
}

export function addMessage(content: string, messageType: string = 'claude'): void {
	const messagesContainer = document.getElementById('chatMessages') || document.getElementById('messages');
	if (!messagesContainer) {return;}

	_messageCounter++;
	const messageId = `msg-${messageType}-${_messageCounter}`;

	// Handle system messages with proper structure
	if (messageType === 'system') {
		const messageDiv = document.createElement('div');
		messageDiv.className = 'systemMessage';
		messageDiv.id = messageId;

		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';
		contentDiv.innerHTML = content;
		messageDiv.appendChild(contentDiv);

		messagesContainer.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesContainer, true);
		return;
	}

	// Handle user messages with proper structure
	if (messageType === 'user') {
		const messageDiv = document.createElement('div');
		messageDiv.className = 'userMessage';
		messageDiv.id = messageId;

		const headerDiv = document.createElement('div');
		headerDiv.className = 'userMessage-header';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'userMessage-content';
		contentDiv.innerHTML = `<span>${content}</span>`;

		messageDiv.appendChild(headerDiv);
		messageDiv.appendChild(contentDiv);

		messagesContainer.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesContainer, true);
		return;
	}

	// Handle Claude messages with proper structure
	if (messageType === 'claude') {
		const messageDiv = document.createElement('div');
		messageDiv.className = 'claudeMessage';
		messageDiv.id = messageId;

		const contentDiv = document.createElement('div');
		contentDiv.className = 'claudeMessage-content';
		contentDiv.innerHTML = parseSimpleMarkdown(content);
		messageDiv.appendChild(contentDiv);

		messagesContainer.appendChild(messageDiv);
		scrollToBottomIfNeeded(messagesContainer, true);
		return;
	}

	// Fallback for any other message types
	const messageDiv = document.createElement('div');
	messageDiv.className = `message ${messageType}`;
	messageDiv.innerHTML = parseSimpleMarkdown(content);

	messagesContainer.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesContainer, true);
}

export function clearMessages(): void {
	const messagesContainer = document.getElementById('chatMessages') || document.getElementById('messages');
	if (messagesContainer) {
		messagesContainer.innerHTML = '';
	}
}

export function addToolUseMessage(data: any): void {
	const messagesContainer = document.getElementById('chatMessages') || document.getElementById('messages');
	if (!messagesContainer) {return;}
	const shouldScroll = shouldAutoScroll(messagesContainer);

	// Handle Read tools with special dimmed styling (toolUse has offset/limit, so we check for file_path)
	if (data.toolName === 'Read' && data.rawInput && data.rawInput.file_path) {
		const readMessageDiv = document.createElement('div');
		readMessageDiv.className = 'systemMessage claudeContext';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'systemMessage-content';
		contentDiv.innerHTML = `<span class="systemMessage-command">R: ${formatFilePath(data.rawInput.file_path)}</span>`;
		readMessageDiv.appendChild(contentDiv);

		messagesContainer.appendChild(readMessageDiv);
		scrollToBottomIfNeeded(messagesContainer, shouldScroll);
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

		messagesContainer.appendChild(bashMessageDiv);
		scrollToBottomIfNeeded(messagesContainer, shouldScroll);
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

		messagesContainer.appendChild(todoMessageDiv);
		scrollToBottomIfNeeded(messagesContainer, shouldScroll);
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

		messagesContainer.appendChild(pathMessageDiv);
		scrollToBottomIfNeeded(messagesContainer, shouldScroll);
		return;
	}

	// Fallback to original tool message format for other tools
	const messageDiv = document.createElement('div');
	messageDiv.className = 'message tool-use';
	messageDiv.innerHTML = `
		<div class="tool-header">
			🔧 Tool: ${escapeHtml(data.name || 'Unknown')}
		</div>
		<div class="tool-content">
			${escapeHtml(JSON.stringify(data.input || {}, null, 2))}
		</div>
	`;

	messagesContainer.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesContainer, shouldScroll);
}

export function addToolResultMessage(data: any): void {
	const messagesContainer = document.getElementById('chatMessages') || document.getElementById('messages');
	if (!messagesContainer) {return;}

	const messageDiv = document.createElement('div');
	messageDiv.className = 'message tool-result';
	messageDiv.innerHTML = `
		<div class="tool-result-header">
			✅ Tool Result
		</div>
		<div class="tool-result-content">
			${parseSimpleMarkdown(data.content || 'No content')}
		</div>
	`;

	messagesContainer.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesContainer, true);
}

export function parseSimpleMarkdown(text: string): string {
	if (!text) {return '';}

	// Simple markdown parsing
	return text
		.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.*?)\*/g, '<em>$1</em>')
		.replace(/`(.*?)`/g, '<code>$1</code>')
		.replace(/\n/g, '<br>');
}

export function copyMessageContent(messageDiv: HTMLElement): void {
	const textContent = messageDiv.textContent || '';
	navigator.clipboard.writeText(textContent);
}

export function copyCodeBlock(codeId: string): void {
	const codeElement = document.getElementById(codeId);
	if (codeElement) {
		const code = codeElement.textContent || '';
		navigator.clipboard.writeText(code);
	}
}

export function showFilePicker(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'showFilePicker' });
	}
}

export function selectImage(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'selectImage' });
	}
}

export function shouldAutoScroll(messagesDiv: HTMLElement): boolean {
	const threshold = 50; // pixels from bottom
	const scrollTop = messagesDiv.scrollTop;
	const scrollHeight = messagesDiv.scrollHeight;
	const clientHeight = messagesDiv.clientHeight;

	return (scrollTop + clientHeight >= scrollHeight - threshold);
}

export function scrollToBottomIfNeeded(messagesDiv: HTMLElement, shouldScroll: boolean | null = null): void {
	const doScroll = shouldScroll !== null ? shouldScroll : shouldAutoScroll(messagesDiv);
	if (doScroll) {
		messagesDiv.scrollTop = messagesDiv.scrollHeight;
	}
}

export function sendStats(eventName: string): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'stats',
			eventName
		});
	}
}

export function newSession(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({ type: 'newSession' });
	}
}

export function toggleConversationHistory(): void {
	const historyContainer = document.getElementById('conversationHistory');
	if (historyContainer) {
		historyContainer.style.display = historyContainer.style.display === 'none' ? 'block' : 'none';

		if (historyContainer.style.display === 'block' && vsCodeApi) {
			vsCodeApi.postMessage({ type: 'getConversationList' });
		}
	}
}

export function loadConversation(filename: string): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'loadConversation',
			filename
		});
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

export function toggleStatusPopover(): void {
	const popover = document.getElementById('statusPopover');
	if (popover) {
		popover.style.display = popover.style.display === 'none' ? 'block' : 'none';
	}
}

export function updateEditorContextDisplay(context: any): void {
	const contextDisplay = document.getElementById('editorContext');
	if (contextDisplay && context && context.hasActiveFile) {
		contextDisplay.innerHTML = `
			<div class="context-info">
				📁 ${escapeHtml(context.fileName)} (${escapeHtml(context.language)})
				${context.selectedText ? `<br>📝 Selected: ${escapeHtml(context.selectedText.substring(0, 50))}...` : ''}
			</div>
		`;
		contextDisplay.style.display = 'block';
	} else if (contextDisplay) {
		contextDisplay.style.display = 'none';
	}
}

export function enableButtons(): void {
	const sendBtn = document.getElementById('sendButton') as HTMLButtonElement;
	if (sendBtn) {sendBtn.disabled = false;}
}

export function disableButtons(): void {
	const sendBtn = document.getElementById('sendButton') as HTMLButtonElement;
	if (sendBtn) {sendBtn.disabled = true;}
}

export function showStopButton(): void {
	const stopBtn = document.getElementById('stopButton');
	if (stopBtn) {stopBtn.style.display = 'inline-block';}
}

export function hideStopButton(): void {
	const stopBtn = document.getElementById('stopButton');
	if (stopBtn) {stopBtn.style.display = 'none';}
}

export function showSessionInfo(sessionId: string): void {
	const sessionDisplay = document.getElementById('sessionInfo');
	if (sessionDisplay) {
		sessionDisplay.innerHTML = `Session: ${escapeHtml(sessionId)}`;
		sessionDisplay.style.display = 'block';
	}
}

export function displayConversationList(conversations: any[]): void {
	const listContainer = document.getElementById('conversationList');
	if (listContainer) {
		listContainer.innerHTML = '';
		conversations.forEach(conv => {
			const item = document.createElement('div');
			item.className = 'conversation-item';
			item.innerHTML = `
				<div class="conversation-title">${escapeHtml(conv.firstUserMessage || 'Conversation')}</div>
				<div class="conversation-meta">${escapeHtml(conv.startTime || '')}</div>
			`;
			item.onclick = () => loadConversation(conv.filename);
			listContainer.appendChild(item);
		});
	}
}

// Export functions to global scope for HTML handlers
declare global {
	interface _Window {
		sendMessage: () => void;
		stopRequest: () => void;
		addMessage: (content: string, type?: string) => void;
		copyMessageContent: (messageDiv: HTMLElement) => void;
		copyCodeBlock: (codeId: string) => void;
		showFilePicker: () => void;
		selectImage: () => void;
		newSession: () => void;
		toggleConversationHistory: () => void;
		loadConversation: (filename: string) => void;
		restoreToCommit: (commitSha: string) => void;
		toggleStatusPopover: () => void;
	}
}
