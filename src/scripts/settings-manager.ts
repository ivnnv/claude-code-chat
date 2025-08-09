import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class SettingsManager {
	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public sendCurrentSettings(): void {
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
		const settings = {
			'thinking.intensity': config.get<string>('thinking.intensity', 'think'),
			'wsl.enabled': config.get<boolean>('wsl.enabled', false),
			'wsl.distro': config.get<string>('wsl.distro', 'Ubuntu'),
			'wsl.nodePath': config.get<string>('wsl.nodePath', '/usr/bin/node'),
			'wsl.claudePath': config.get<string>('wsl.claudePath', '/usr/local/bin/claude'),
			'yolo.enabled': config.get<boolean>('yolo.enabled', false)
		};

		this._postMessage({ type: 'currentSettings', data: settings });
	}

	public async updateSettings(settings: { [key: string]: any }): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');

			for (const [key, value] of Object.entries(settings)) {
				await config.update(key, value, vscode.ConfigurationTarget.Global);
			}

			this._postMessage({
				type: 'settingsUpdated',
				data: { success: true, settings }
			});

			// Send updated settings back
			this.sendCurrentSettings();

		} catch (error) {
			console.error('Failed to update settings:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to update settings: ${error}`
			});
		}
	}

	public async enableYoloMode(): Promise<void> {
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');

		const confirmation = await vscode.window.showWarningMessage(
			'YOLO Mode bypasses all permission checks and allows Claude to run any command without asking. This can be dangerous. Are you sure you want to enable it?',
			{ modal: true },
			'Yes, Enable YOLO Mode',
			'Cancel'
		);

		if (confirmation === 'Yes, Enable YOLO Mode') {
			await config.update('yolo.enabled', true, vscode.ConfigurationTarget.Global);
			this._postMessage({
				type: 'yoloModeEnabled',
				data: 'YOLO mode enabled. Claude can now run commands without permission checks.'
			});
		}
	}

	public async sendCustomSnippets(): Promise<void> {
		try {
			const globalStoragePath = this._context.globalStorageUri.fsPath;
			const snippetsPath = path.join(globalStoragePath, 'custom-snippets.json');

			let snippets: any[] = [];
			if (fs.existsSync(snippetsPath)) {
				const data = await fs.promises.readFile(snippetsPath, 'utf8');
				snippets = JSON.parse(data) || [];
			}

			this._postMessage({ type: 'customSnippets', data: snippets });
		} catch (error) {
			console.error('Failed to load custom snippets:', error);
			this._postMessage({ type: 'customSnippets', data: [] });
		}
	}

	public async saveCustomSnippet(snippet: any): Promise<void> {
		try {
			const globalStoragePath = this._context.globalStorageUri.fsPath;
			const snippetsPath = path.join(globalStoragePath, 'custom-snippets.json');

			let snippets: any[] = [];
			if (fs.existsSync(snippetsPath)) {
				const data = await fs.promises.readFile(snippetsPath, 'utf8');
				snippets = JSON.parse(data) || [];
			}

			// Add or update snippet
			const existingIndex = snippets.findIndex(s => s.id === snippet.id);
			if (existingIndex >= 0) {
				snippets[existingIndex] = snippet;
			} else {
				snippet.id = snippet.id || `snippet-${Date.now()}`;
				snippets.push(snippet);
			}

			// Ensure directory exists
			if (!fs.existsSync(globalStoragePath)) {
				fs.mkdirSync(globalStoragePath, { recursive: true });
			}

			await fs.promises.writeFile(snippetsPath, JSON.stringify(snippets, null, 2));

			this._postMessage({
				type: 'snippetSaved',
				data: { success: true, snippet }
			});

			// Refresh snippets list
			await this.sendCustomSnippets();

		} catch (error) {
			console.error('Failed to save custom snippet:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to save snippet: ${error}`
			});
		}
	}

	public async deleteCustomSnippet(snippetId: string): Promise<void> {
		try {
			const globalStoragePath = this._context.globalStorageUri.fsPath;
			const snippetsPath = path.join(globalStoragePath, 'custom-snippets.json');

			if (!fs.existsSync(snippetsPath)) {
				return;
			}

			const data = await fs.promises.readFile(snippetsPath, 'utf8');
			let snippets: any[] = JSON.parse(data) || [];

			snippets = snippets.filter(s => s.id !== snippetId);

			await fs.promises.writeFile(snippetsPath, JSON.stringify(snippets, null, 2));

			this._postMessage({
				type: 'snippetDeleted',
				data: { success: true, snippetId }
			});

			// Refresh snippets list
			await this.sendCustomSnippets();

		} catch (error) {
			console.error('Failed to delete custom snippet:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to delete snippet: ${error}`
			});
		}
	}

	public convertToWSLPath(windowsPath: string): string {
		if (process.platform !== 'win32') {
			return windowsPath;
		}

		// Convert Windows path to WSL path
		// C:\Users\... -> /mnt/c/Users/...
		return windowsPath.replace(/^([A-Za-z]):/, '/mnt/$1').replace(/\\/g, '/').toLowerCase();
	}

	public sendPlatformInfo(): void {
		const wslEnabled = vscode.workspace.getConfiguration('claudeCodeVscPanel').get<boolean>('wsl.enabled', false);

		this._postMessage({
			type: 'platformInfo',
			data: {
				platform: process.platform,
				wslEnabled,
				isWindows: process.platform === 'win32'
			}
		});
	}

	public dismissWSLAlert(): void {
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
		config.update('wsl.alertDismissed', true, vscode.ConfigurationTarget.Global);
		this._postMessage({ type: 'wslAlertDismissed' });
	}
}
