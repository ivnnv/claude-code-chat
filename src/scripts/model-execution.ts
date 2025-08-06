// Model and execution functionality

declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

// Note: These functions will be available at runtime through the main ui-scripts module
declare function sendStats(eventName: string): void;
declare function addMessage(content: string, type?: string): void;

// DOM element references
let _messagesDiv: HTMLElement;
let messageInput: HTMLTextAreaElement;
let sendBtn: HTMLButtonElement;
let statusDiv: HTMLElement;
let statusTextDiv: HTMLElement;

// State variables
let totalCost = 0;
let totalTokensInput = 0;
let totalTokensOutput = 0;
let requestCount = 0;
let isProcessing = false;
let requestStartTime: number | null = null;
let requestTimer: number | null = null;
let currentModel = 'opus'; // Default model

export function updateStatus(text: string, state = 'ready'): void {
	statusTextDiv.textContent = text;
	statusDiv.className = `status ${state}`;
}

export function updateStatusWithTotals(): void {
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

export function startRequestTimer(startTime?: number): void {
	requestStartTime = startTime || Date.now();
	// Update status every 100ms for smooth real-time display
	requestTimer = setInterval(() => {
		if (isProcessing) {
			updateStatusWithTotals();
		}
	}, 100) as unknown as number;
}

export function stopRequestTimer(): void {
	if (requestTimer) {
		clearInterval(requestTimer);
		requestTimer = null;
	}
	requestStartTime = null;
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

export function disableButtons(): void {
	if (sendBtn) {
		sendBtn.disabled = true;
	}
}

export function enableButtons(): void {
	if (sendBtn) {
		sendBtn.disabled = false;
	}
}

export function openFileInEditor(filePath: string): void {
	vscode.postMessage({
		type: 'openFile',
		filePath: filePath
	});
}

function hideSlashCommandsModal(): void {
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {modal.style.display = 'none';}
}

function hideModelModal(): void {
	const modal = document.getElementById('modelModal');
	if (modal) {modal.style.display = 'none';}
}

export function executeSlashCommand(command: string): void {
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

export function openModelTerminal(): void {
	vscode.postMessage({
		type: 'openModelTerminal'
	});
	hideModelModal();
}

export function selectModel(model: string, fromBackend = false): void {
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

export function stopRequest(): void {
	sendStats('Stop request');

	vscode.postMessage({
		type: 'stopRequest'
	});
	hideStopButton();
}

// Setters for global variables (to be called from ui-scripts.ts)
export function setMessagesDiv(div: HTMLElement): void {
	_messagesDiv = div;
}

export function setMessageInput(input: HTMLTextAreaElement): void {
	messageInput = input;
}

export function setSendBtn(btn: HTMLButtonElement): void {
	sendBtn = btn;
}

export function setStatusDiv(div: HTMLElement): void {
	statusDiv = div;
}

export function setStatusTextDiv(div: HTMLElement): void {
	statusTextDiv = div;
}

export function setTotalCost(cost: number): void {
	totalCost = cost;
}

export function setTotalTokensInput(tokens: number): void {
	totalTokensInput = tokens;
}

export function setTotalTokensOutput(tokens: number): void {
	totalTokensOutput = tokens;
}

export function setRequestCount(count: number): void {
	requestCount = count;
}

export function setIsProcessing(processing: boolean): void {
	isProcessing = processing;
}

export function setCurrentModel(model: string): void {
	currentModel = model;
}

// Getters for state variables
export function getTotalCost(): number {
	return totalCost;
}

export function getTotalTokensInput(): number {
	return totalTokensInput;
}

export function getTotalTokensOutput(): number {
	return totalTokensOutput;
}

export function getRequestCount(): number {
	return requestCount;
}

export function getIsProcessing(): boolean {
	return isProcessing;
}

export function getCurrentModel(): string {
	return currentModel;
}
