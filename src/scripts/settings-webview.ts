// Settings Webview - Settings UI functionality for webview (no Node.js dependencies)
import '../types/global';

// VS Code API will be provided by ui-scripts.ts
let vsCodeApi: any;

export function setVsCodeApi(api: any): void {
	vsCodeApi = api;
}

export function initialize(): void {
	// Settings initialization handled by UI management
}

export function showSettingsModal(): void {
	const modal = document.getElementById('settingsModal');
	if (modal) {
		modal.style.display = 'flex';
		// Request current settings from VS Code
		if (vsCodeApi) {
			vsCodeApi.postMessage({
				type: 'getSettings'
			});
			vsCodeApi.postMessage({
				type: 'getPermissions'
			});
		}
	}
}

export function hideSettingsModal(): void {
	const modal = document.getElementById('settingsModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

export function updateSettings(): void {
	const wslEnabled = (document.getElementById('wsl-enabled') as HTMLInputElement)?.checked || false;
	const wslDistro = (document.getElementById('wsl-distro') as HTMLInputElement)?.value || 'Ubuntu';
	const wslNodePath = (document.getElementById('wsl-node-path') as HTMLInputElement)?.value || '/usr/bin/node';
	const wslClaudePath = (document.getElementById('wsl-claude-path') as HTMLInputElement)?.value || '/usr/local/bin/claude';
	const yoloMode = (document.getElementById('yolo-mode') as HTMLInputElement)?.checked || false;

	// Show/hide WSL options based on enabled state
	const wslOptions = document.getElementById('wslOptions');
	if (wslOptions) {
		wslOptions.style.display = wslEnabled ? 'block' : 'none';
	}

	// Update yolo warning
	updateYoloWarning();

	// Send settings to VS Code
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'updateSettings',
			settings: {
				'wsl.enabled': wslEnabled,
				'wsl.distro': wslDistro,
				'wsl.nodePath': wslNodePath,
				'wsl.claudePath': wslClaudePath,
				'permissions.yoloMode': yoloMode
			}
		});
	}
}

export function updateYoloWarning(): void {
	const yoloMode = (document.getElementById('yolo-mode') as HTMLInputElement)?.checked || false;
	const yoloWarning = document.getElementById('yoloWarning');

	if (yoloWarning) {
		yoloWarning.style.display = yoloMode ? 'block' : 'none';
	}
}

export function openWSLSettings(): void {
	// Auto-enable WSL and show settings modal
	// Note: Platform checking will be done by the extension backend
	const wslEnabledCheckbox = document.getElementById('wsl-enabled') as HTMLInputElement;
	if (wslEnabledCheckbox) {
		wslEnabledCheckbox.checked = true;
		updateSettings();
	}

	showSettingsModal();
}

export function dismissWSLAlert(): void {
	const wslAlert = document.getElementById('wslAlert');
	if (wslAlert) {
		wslAlert.style.display = 'none';
	}

	// Send dismiss message to extension to store in globalState
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'dismissWSLAlert'
		});
	}
}

export function handleSettingsData(data: any): void {
	// Update settings form with data from extension
	if (data.wslEnabled !== undefined) {
		const wslEnabledCheckbox = document.getElementById('wsl-enabled') as HTMLInputElement;
		if (wslEnabledCheckbox) {
			wslEnabledCheckbox.checked = data.wslEnabled;
		}
	}

	if (data.wslDistro !== undefined) {
		const wslDistroInput = document.getElementById('wsl-distro') as HTMLInputElement;
		if (wslDistroInput) {
			wslDistroInput.value = data.wslDistro;
		}
	}

	if (data.wslNodePath !== undefined) {
		const wslNodePathInput = document.getElementById('wsl-node-path') as HTMLInputElement;
		if (wslNodePathInput) {
			wslNodePathInput.value = data.wslNodePath;
		}
	}

	if (data.wslClaudePath !== undefined) {
		const wslClaudePathInput = document.getElementById('wsl-claude-path') as HTMLInputElement;
		if (wslClaudePathInput) {
			wslClaudePathInput.value = data.wslClaudePath;
		}
	}

	if (data.yoloMode !== undefined) {
		const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
		if (yoloModeCheckbox) {
			yoloModeCheckbox.checked = data.yoloMode;
		}
	}

	// Update UI states
	updateSettings();
}

export function showThinkingIntensityModal(): void {
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) {
		modal.style.display = 'flex';
	}
}

export function hideThinkingIntensityModal(): void {
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

export function updateThinkingIntensityDisplay(value: string): void {
	// Remove active class from all labels
	for (let i = 0; i <= 3; i++) {
		const label = document.getElementById(`thinking-label-${i}`);
		if (label) {
			label.classList.remove('active');
		}
	}

	// Add active class to selected label
	const activeLabel = document.getElementById(`thinking-label-${value}`);
	if (activeLabel) {
		activeLabel.classList.add('active');
	}
}

export function setThinkingIntensityValue(value: number): void {
	const slider = document.getElementById('thinkingIntensitySlider') as HTMLInputElement;
	if (slider) {
		slider.value = value.toString();
		updateThinkingIntensityDisplay(value.toString());
	}
}

export function confirmThinkingIntensity(): void {
	const slider = document.getElementById('thinkingIntensitySlider') as HTMLInputElement;
	if (slider && vsCodeApi) {
		const intensityMap: { [key: string]: string } = {
			'0': 'think',
			'1': 'think-hard',
			'2': 'think-harder',
			'3': 'ultrathink'
		};

		const intensity = intensityMap[slider.value] || 'think';

		vsCodeApi.postMessage({
			type: 'setThinkingIntensity',
			intensity: intensity
		});

		hideThinkingIntensityModal();
	}
}

export function openFileInEditor(filePath: string): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'openFile',
			filePath: filePath
		});
	}
}

export function executeSlashCommand(command: string): void {
	// Send command to VS Code to execute in terminal
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'executeSlashCommand',
			command: command
		});
	}
}

export function openModelTerminal(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'openModelTerminal'
		});
	}
}

export function selectModel(model: string, fromBackend = false): void {
	// Update the UI immediately
	const radioButtons = document.querySelectorAll('input[name="model"]') as NodeListOf<HTMLInputElement>;
	radioButtons.forEach(radio => {
		radio.checked = radio.value === model;
	});

	// Update the model selector button text
	const selectedModelSpan = document.getElementById('selectedModel');
	if (selectedModelSpan) {
		const modelNames: { [key: string]: string } = {
			'opus': 'Opus',
			'sonnet': 'Sonnet',
			'default': 'Default'
		};
		selectedModelSpan.textContent = modelNames[model] || 'Default';
	}

	// Close the modal
	const modal = document.getElementById('modelModal');
	if (modal) {
		modal.style.display = 'none';
	}

	// Send to backend unless this was called from the backend
	if (!fromBackend && vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'selectModel',
			model: model
		});
	}
}

export function stopRequest(): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'stopRequest'
		});
	}
}

export function showAddSnippetForm(): void {
	const form = document.getElementById('addSnippetForm');
	const button = document.getElementById('addServerBtn');
	if (form && button) {
		form.style.display = 'block';
		button.style.display = 'none';
	}
}

export function hideAddSnippetForm(): void {
	const form = document.getElementById('addSnippetForm');
	const button = document.getElementById('addServerBtn');
	if (form && button) {
		form.style.display = 'none';
		button.style.display = 'block';
	}

	// Clear form
	const nameInput = document.getElementById('snippetName') as HTMLInputElement;
	const promptTextarea = document.getElementById('snippetPrompt') as HTMLTextAreaElement;
	if (nameInput) {nameInput.value = '';}
	if (promptTextarea) {promptTextarea.value = '';}
}

export function saveCustomSnippet(): void {
	const nameInput = document.getElementById('snippetName') as HTMLInputElement;
	const promptTextarea = document.getElementById('snippetPrompt') as HTMLTextAreaElement;

	if (!nameInput || !promptTextarea) {
		return;
	}

	const name = nameInput.value.trim();
	const prompt = promptTextarea.value.trim();

	if (!name || !prompt) {
		alert('Please fill in both name and prompt fields');
		return;
	}

	// Validate name (no special characters except hyphens and underscores)
	if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
		alert('Name can only contain letters, numbers, hyphens, and underscores');
		return;
	}

	const snippetData = {
		name: name,
		prompt: prompt
	};

	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'saveCustomSnippet',
			snippet: snippetData
		});
	}

	hideAddSnippetForm();
}

export function deleteCustomSnippet(snippetId: string): void {
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'deleteCustomSnippet',
			snippetId: snippetId
		});
	}
}

export function filterWorkspaceFiles(searchTerm: string): void {
	// Send search request to backend instead of filtering locally
	if (vsCodeApi) {
		vsCodeApi.postMessage({
			type: 'getWorkspaceFiles',
			searchTerm: searchTerm
		});
	}
}

export function usePromptSnippet(snippetId: string): void {
	const messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
	if (!messageInput) {
		return;
	}

	// Built-in snippets
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

	let snippetText = builtInSnippets[snippetId];

	if (!snippetText) {
		// Check custom snippets (would need to be loaded from backend)
		console.log('Custom snippet:', snippetId);
		return;
	}

	// Insert the snippet text
	messageInput.value = snippetText;
	messageInput.focus();

	// Close the modal
	const modal = document.getElementById('slashCommandsModal');
	if (modal) {
		modal.style.display = 'none';
	}

	// Auto-resize the textarea
	messageInput.style.height = 'auto';
	messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
}

export function handleCustomCommandKeydown(event: KeyboardEvent): void {
	if (event.key === 'Enter') {
		event.preventDefault();
		const input = event.target as HTMLInputElement;
		const command = input.value.trim();
		if (command) {
			executeSlashCommand(command);
			input.value = '';
			// Close modal
			const modal = document.getElementById('slashCommandsModal');
			if (modal) {
				modal.style.display = 'none';
			}
		}
	}
}

export function filterSlashCommands(): void {
	const searchInput = document.getElementById('slashCommandsSearch') as HTMLInputElement;
	if (!searchInput) {return;}

	const searchTerm = searchInput.value.toLowerCase().replace(/^\//, ''); // Remove leading slash
	const commandItems = document.querySelectorAll('.slash-command-item:not(.add-snippet-item)');

	commandItems.forEach((item) => {
		const titleElement = item.querySelector('.slash-command-title');
		const descElement = item.querySelector('.slash-command-description');

		if (titleElement && descElement) {
			const title = titleElement.textContent?.toLowerCase().replace(/^\//, '') || '';
			const description = descElement.textContent?.toLowerCase() || '';

			const matches = !searchTerm ||
				title.includes(searchTerm) ||
				description.includes(searchTerm);

			(item as HTMLElement).style.display = matches ? 'flex' : 'none';
		}
	});
}

// Plan Mode Toggle
export function togglePlanMode(): void {
	const planModeSwitch = document.getElementById('planModeSwitch');
	if (planModeSwitch) {
		const isEnabled = planModeSwitch.classList.contains('active');
		if (isEnabled) {
			planModeSwitch.classList.remove('active');
		} else {
			planModeSwitch.classList.add('active');
		}
	}
}

// Thinking Mode Toggle
export function toggleThinkingMode(): void {
	const thinkingModeSwitch = document.getElementById('thinkingModeSwitch');
	if (thinkingModeSwitch) {
		const isEnabled = thinkingModeSwitch.classList.contains('active');
		if (isEnabled) {
			thinkingModeSwitch.classList.remove('active');
		} else {
			// Show thinking intensity modal instead of just toggling
			showThinkingIntensityModal();
		}
	}
}

// Functions are defined in global.ts
