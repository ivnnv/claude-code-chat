import * as vscode from 'vscode';
import * as path from 'path';

export interface CustomSnippet {
	id: string;
	title: string;
	content: string;
}

export class SettingsManager {
	private _selectedModel: string = 'default';

	constructor(private _context: vscode.ExtensionContext) {
		// Load saved model preference
		this._selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');
	}

	public async sendCustomSnippets(postMessage: (msg: any) => void): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) {
				postMessage({
					type: 'customSnippets',
					data: []
				});
				return;
			}

			const snippetsPath = path.join(storagePath, 'custom-snippets.json');
			const snippetsUri = vscode.Uri.file(snippetsPath);

			try {
				const content = await vscode.workspace.fs.readFile(snippetsUri);
				const snippets = JSON.parse(new TextDecoder().decode(content));
				postMessage({
					type: 'customSnippets',
					data: Array.isArray(snippets) ? snippets : []
				});
			} catch {
				// File doesn't exist, return empty array
				postMessage({
					type: 'customSnippets',
					data: []
				});
			}
		} catch (error) {
			console.error('Error sending custom snippets:', error);
			postMessage({
				type: 'customSnippets',
				data: []
			});
		}
	}

	public async saveCustomSnippet(snippet: CustomSnippet, postMessage: (msg: any) => void): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) { return; }

			const snippetsPath = path.join(storagePath, 'custom-snippets.json');
			const snippetsUri = vscode.Uri.file(snippetsPath);

			let snippets: CustomSnippet[] = [];
			try {
				const content = await vscode.workspace.fs.readFile(snippetsUri);
				snippets = JSON.parse(new TextDecoder().decode(content));
				if (!Array.isArray(snippets)) {
					snippets = [];
				}
			} catch {
				// File doesn't exist, use empty array
			}

			// Update existing or add new
			const existingIndex = snippets.findIndex(s => s.id === snippet.id);
			if (existingIndex >= 0) {
				snippets[existingIndex] = snippet;
			} else {
				snippets.push(snippet);
			}

			// Save updated snippets
			const updatedContent = JSON.stringify(snippets, null, 2);
			await vscode.workspace.fs.writeFile(snippetsUri, Buffer.from(updatedContent));

			// Send updated snippets to UI
			await this.sendCustomSnippets(postMessage);

		} catch (error) {
			console.error('Error saving custom snippet:', error);
		}
	}

	public async deleteCustomSnippet(snippetId: string, postMessage: (msg: any) => void): Promise<void> {
		try {
			const storagePath = this._context.storageUri?.fsPath;
			if (!storagePath) { return; }

			const snippetsPath = path.join(storagePath, 'custom-snippets.json');
			const snippetsUri = vscode.Uri.file(snippetsPath);

			let snippets: CustomSnippet[] = [];
			try {
				const content = await vscode.workspace.fs.readFile(snippetsUri);
				snippets = JSON.parse(new TextDecoder().decode(content));
				if (!Array.isArray(snippets)) {
					snippets = [];
				}
			} catch {
				// File doesn't exist, nothing to delete
				return;
			}

			// Remove the snippet
			snippets = snippets.filter(s => s.id !== snippetId);

			// Save updated snippets
			const updatedContent = JSON.stringify(snippets, null, 2);
			await vscode.workspace.fs.writeFile(snippetsUri, Buffer.from(updatedContent));

			// Send updated snippets to UI
			await this.sendCustomSnippets(postMessage);

		} catch (error) {
			console.error('Error deleting custom snippet:', error);
		}
	}

	public sendCurrentSettings(postMessage: (msg: any) => void): void {
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
		const settings = {
			'thinking.intensity': config.get<string>('thinking.intensity', 'think'),
			'wsl.enabled': config.get<boolean>('wsl.enabled', false),
			'wsl.distro': config.get<string>('wsl.distro', 'Ubuntu'),
			'wsl.nodePath': config.get<string>('wsl.nodePath', '/usr/bin/node'),
			'wsl.claudePath': config.get<string>('wsl.claudePath', '/usr/local/bin/claude'),
			'permissions.yoloMode': config.get<boolean>('permissions.yoloMode', false)
		};

		postMessage({
			type: 'settingsData',
			data: settings
		});
	}

	public async enableYoloMode(postMessage: (msg: any) => void): Promise<void> {
		try {
			// Update VS Code configuration to enable YOLO mode
			const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');

			// Clear any global setting and set workspace setting
			await config.update('permissions.yoloMode', true, vscode.ConfigurationTarget.Workspace);

			console.log('YOLO Mode enabled - all future permissions will be skipped');

			// Send updated settings to UI
			this.sendCurrentSettings(postMessage);

		} catch (error) {
			console.error('Error enabling YOLO mode:', error);
		}
	}

	public async updateSettings(settings: { [key: string]: any }, _postMessage: (msg: any) => void): Promise<void> {
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');

		try {
			for (const [key, value] of Object.entries(settings)) {
				if (key === 'permissions.yoloMode') {
					// YOLO mode is workspace-specific
					await config.update(key, value, vscode.ConfigurationTarget.Workspace);
				} else {
					// Other settings are global (user-wide)
					await config.update(key, value, vscode.ConfigurationTarget.Global);
				}
			}

			console.log('Settings updated:', settings);
		} catch (error) {
			console.error('Failed to update settings:', error);
			vscode.window.showErrorMessage('Failed to update settings');
		}
	}

	public async getClipboardText(postMessage: (msg: any) => void): Promise<void> {
		try {
			const clipboardText = await vscode.env.clipboard.readText();
			postMessage({
				type: 'clipboardText',
				data: clipboardText
			});
		} catch (error) {
			console.error('Error getting clipboard text:', error);
			postMessage({
				type: 'clipboardText',
				data: ''
			});
		}
	}

	public setSelectedModel(model: string): void {
		// Validate model name to prevent issues mentioned in the GitHub issue
		const validModels = ['opus', 'sonnet', 'default'];
		if (validModels.includes(model)) {
			this._selectedModel = model;
			console.log('Model selected:', model);

			// Store the model preference in workspace state
			this._context.workspaceState.update('claude.selectedModel', model);

			// Show confirmation
			vscode.window.showInformationMessage(`Claude model switched to: ${model.charAt(0).toUpperCase() + model.slice(1)}`);
		} else {
			console.error('Invalid model selected:', model);
			vscode.window.showErrorMessage(`Invalid model: ${model}. Please select Opus, Sonnet, or Default.`);
		}
	}

	public getSelectedModel(): string {
		return this._selectedModel;
	}

	public openModelTerminal(postMessage: (msg: any) => void): void {
		try {
			// Create a new terminal
			const terminal = vscode.window.createTerminal('Claude Model Manager');
			terminal.show();

			// Send the claude model command
			terminal.sendText('claude model');

			postMessage({
				type: 'assistant',
				data: 'Opened terminal with Claude model command. You can now select a different model.'
			});
		} catch (error) {
			console.error('Error opening model terminal:', error);
			postMessage({
				type: 'error',
				data: 'Failed to open model terminal'
			});
		}
	}

	public executeSlashCommand(command: string, postMessage: (msg: any) => void): void {
		// Remove the leading slash
		const cmd = command.substring(1);

		try {
			let terminal = vscode.window.terminals.find(t => t.name === 'Claude Commands');
			if (!terminal) {
				terminal = vscode.window.createTerminal('Claude Commands');
			}

			terminal.show();
			terminal.sendText(cmd);

			postMessage({
				type: 'assistant',
				data: `Executing /${command} command in terminal. Check the terminal output and return when ready.`,
			});
		} catch (error) {
			console.error('Error executing slash command:', error);
			postMessage({
				type: 'error',
				data: `Failed to execute command: ${command}`
			});
		}
	}

	public sendPlatformInfo(postMessage: (msg: any) => void): void {
		const platform = process.platform;
		const dismissed = this._context.globalState.get<boolean>('wslAlertDismissed', false);

		// Get WSL configuration
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
		const wslEnabled = config.get<boolean>('wsl.enabled', false);

		postMessage({
			type: 'platformInfo',
			data: {
				platform: platform,
				isWindows: platform === 'win32',
				wslAlertDismissed: dismissed,
				wslEnabled: wslEnabled
			}
		});
	}

	public dismissWSLAlert(): void {
		this._context.globalState.update('wslAlertDismissed', true);
	}

	public async openFileInEditor(filePath: string): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			const document = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
			console.error('Error opening file:', error);
		}
	}

	public async createImageFile(imageData: string, imageType: string): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) { return; }

			// Extract base64 data from data URL
			const base64Data = imageData.split(',')[1];
			const buffer = Buffer.from(base64Data, 'base64');

			// Get file extension from image type
			const extension = imageType.split('/')[1] || 'png';

			// Generate filename with timestamp
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const filename = `claude-image-${timestamp}.${extension}`;
			const filePath = path.join(workspaceFolder.uri.fsPath, filename);

			// Write file
			await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), buffer);

			// Open the image file
			await this.openFileInEditor(filePath);

			vscode.window.showInformationMessage(`Image saved as: ${filename}`);
		} catch (error) {
			console.error('Error creating image file:', error);
			vscode.window.showErrorMessage('Failed to create image file');
		}
	}

	public async selectImageFile(postMessage: (msg: any) => void): Promise<void> {
		try {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Select Image',
				filters: {
					'Image files': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
				}
			};

			const fileUri = await vscode.window.showOpenDialog(options);

			if (fileUri && fileUri[0]) {
				const filePath = fileUri[0].fsPath;

				// Read the file and convert to base64
				const fileContent = await vscode.workspace.fs.readFile(fileUri[0]);
				const base64Content = Buffer.from(fileContent).toString('base64');

				// Get file extension to determine MIME type
				const extension = path.extname(filePath).toLowerCase().substring(1);
				const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
				const dataUrl = `data:${mimeType};base64,${base64Content}`;

				postMessage({
					type: 'imageSelected',
					data: {
						filePath: filePath,
						dataUrl: dataUrl
					}
				});
			}
		} catch (error) {
			console.error('Error selecting image file:', error);
			vscode.window.showErrorMessage('Failed to select image file');
		}
	}
}
