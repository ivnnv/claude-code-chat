import * as vscode from 'vscode';
import { ClaudeChatProvider } from '../claude-provider';

export function sendCurrentSettings(provider: ClaudeChatProvider): void {
	const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
	const settings = {
		'thinking.intensity': config.get<string>('thinking.intensity', 'think'),
		'wsl.enabled': config.get<boolean>('wsl.enabled', false),
		'wsl.distro': config.get<string>('wsl.distro', 'Ubuntu'),
		'wsl.nodePath': config.get<string>('wsl.nodePath', '/usr/bin/node'),
		'wsl.claudePath': config.get<string>('wsl.claudePath', '/usr/local/bin/claude'),
		'permissions.yoloMode': config.get<boolean>('permissions.yoloMode', false)
	};

	provider._postMessage({
		type: 'settingsData',
		data: settings
	});
}

export async function updateSettings(provider: ClaudeChatProvider, settings: { [key: string]: any }): Promise<void> {
	const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');

	try {
		for (const [key, value] of Object.entries(settings)) {
			if (key === 'permissions.yoloMode') {
				// Handle yolo mode with proper value update
				// Clear any global setting that might interfere
				await config.update('permissions.yoloMode', undefined, vscode.ConfigurationTarget.Global);

				// Update workspace setting to the new value
				await config.update('permissions.yoloMode', value, vscode.ConfigurationTarget.Workspace);

				if (value) {
					// If enabling YOLO mode, show warning
					const result = await vscode.window.showWarningMessage(
						'YOLO mode enabled. This will allow all tool permissions without prompting. This can be risky.',
						'I understand'
					);
					if (!result) {
						// User dismissed warning, revert setting
						await config.update('permissions.yoloMode', false, vscode.ConfigurationTarget.Workspace);
						return;
					}
				}
			} else {
				// Regular setting update
				await config.update(key, value, vscode.ConfigurationTarget.Workspace);
			}
		}

		// Send updated settings back to UI
		sendCurrentSettings(provider);

	} catch (error: any) {
		console.error('Error updating settings:', error.message);
		vscode.window.showErrorMessage(`Failed to update settings: ${error.message}`);
	}
}

export async function enableYoloMode(provider: ClaudeChatProvider): Promise<void> {
	try {
		// Update VS Code configuration to enable YOLO mode
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');

		// Clear any global setting and set workspace setting
		await config.update('permissions.yoloMode', undefined, vscode.ConfigurationTarget.Global);
		await config.update('permissions.yoloMode', true, vscode.ConfigurationTarget.Workspace);

		// Send updated settings to UI
		sendCurrentSettings(provider);

	} catch (error) {
		console.error('Error enabling YOLO mode:', error);
	}
}
