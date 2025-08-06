// Settings and modal management functionality

// VS Code API will be provided by ui-scripts.ts
let vscode: any;

// Note: This function will be available at runtime through the main ui-scripts module
declare function sendStats(eventName: string): void;

// Global variables needed for these functions
let planModeEnabled = false;
let thinkingModeEnabled = false;

export function togglePlanMode(): void {
	planModeEnabled = !planModeEnabled;
	const switchElement = document.getElementById('planModeSwitch');
	if (planModeEnabled) {
		switchElement?.classList.add('active');
	} else {
		switchElement?.classList.remove('active');
	}
}

export function toggleThinkingMode(): void {
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

export function showThinkingIntensityModal(): void {
	// Request current settings from VS Code first
	vscode.postMessage({
		type: 'getSettings'
	});
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) {
		modal.style.display = 'flex';
	}
}

export function hideThinkingIntensityModal(): void {
	const modal = document.getElementById('thinkingIntensityModal');
	if (modal) {modal.style.display = 'none';}
}

export function setThinkingIntensity(intensity: string): void {
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

export function setThinkingIntensityValue(value: number): void {
	// Set slider value for thinking intensity modal
	const thinkingIntensitySlider = document.getElementById('thinkingIntensitySlider') as HTMLInputElement;
	if (thinkingIntensitySlider) {
		thinkingIntensitySlider.value = value.toString();
	}

	// Update visual state
	updateThinkingIntensityDisplay(value);
}

export function updateThinkingIntensityDisplay(value: number): void {
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

export function confirmThinkingIntensity(): void {
	// Get the current slider value
	const currentValue = (document.getElementById('thinkingIntensitySlider') as HTMLInputElement).value;
	// Update the toggle name with confirmed selection
	updateThinkingModeToggleName(parseInt(currentValue));
	// Save the current intensity setting
	saveThinkingIntensity();
	// Close the modal
	hideThinkingIntensityModal();
}

function updateThinkingModeToggleName(intensityValue: number): void {
	const intensityNames = ['Thinking', 'Think Hard', 'Think Harder', 'Ultrathink'];
	const modeName = intensityNames[intensityValue] || 'Thinking';
	const toggleLabel = document.getElementById('thinkingModeLabel');
	if (toggleLabel) {
		toggleLabel.textContent = modeName + ' Mode';
	}
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

export function updateSettings(): void {
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

export function updateYoloWarning(): void {
	const yoloModeCheckbox = document.getElementById('yolo-mode') as HTMLInputElement;
	const warning = document.getElementById('yoloWarning');

	if (!yoloModeCheckbox || !warning) {
		return; // Elements not ready yet
	}

	const yoloMode = yoloModeCheckbox.checked;
	warning.style.display = yoloMode ? 'block' : 'none';
}

export function showSettingsModal(): void {
	const settingsModal = document.getElementById('settingsModal');
	if (settingsModal) {
		// Request current settings from VS Code
		vscode.postMessage({
			type: 'getSettings'
		});
		// Request current permissions
		vscode.postMessage({
			type: 'getPermissions'
		});
		settingsModal.style.display = 'flex';
	}
}

export function hideSettingsModal(): void {
	const modal = document.getElementById('settingsModal');
	if (modal) {modal.style.display = 'none';}
}

// Setters for global variables (to be called from ui-scripts.ts)
export function setPlanModeEnabled(enabled: boolean): void {
	planModeEnabled = enabled;
}

export function setThinkingModeEnabled(enabled: boolean): void {
	thinkingModeEnabled = enabled;
}

export function getPlanModeEnabled(): boolean {
	return planModeEnabled;
}

export function getThinkingModeEnabled(): boolean {
	return thinkingModeEnabled;
}

export function initialize(): void {
	// Expose functions to global scope for HTML onclick handlers
	Object.assign(window, {
		togglePlanMode,
		toggleThinkingMode,
		showThinkingIntensityModal,
		hideThinkingIntensityModal,
		setThinkingIntensityValue,
		updateThinkingIntensityDisplay,
		confirmThinkingIntensity,
		updateSettings,
		updateYoloWarning,
		showSettingsModal,
		hideSettingsModal
	});
}

// Set VS Code API (called from ui-scripts.ts)
export function setVsCodeApi(api: any): void {
	vscode = api;
}
