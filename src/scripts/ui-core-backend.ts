import * as vscode from 'vscode';
import * as path from 'path';
import { ClaudeChatProvider } from '../claude-provider';

export function sendPlatformInfo(provider: ClaudeChatProvider): void {
	const platform = process.platform;
	const dismissed = provider._context.globalState.get<boolean>('wslAlertDismissed', false);

	provider._postMessage({
		type: 'platformInfo',
		data: {
			platform,
			wslAlertDismissed: dismissed
		}
	});

	// If Windows and not dismissed, show WSL suggestion
	if (platform === 'win32' && !dismissed) {
		provider._postMessage({
			type: 'showWSLSuggestion'
		});
	}
}

export async function getClipboardText(provider: ClaudeChatProvider): Promise<void> {
	try {
		const text = await vscode.env.clipboard.readText();
		provider._postMessage({
			type: 'clipboardText',
			data: text
		});
	} catch (error) {
		console.error('Failed to read clipboard:', error);
		provider._postMessage({
			type: 'clipboardText',
			data: ''
		});
	}
}

export async function openFileInEditor(provider: ClaudeChatProvider, filePath: string): Promise<void> {
	try {
		const uri = vscode.Uri.file(filePath);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document, { preview: false });
	} catch (error) {
		console.error('Failed to open file:', error);
		vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
	}
}

export async function createImageFile(provider: ClaudeChatProvider, imageData: string, imageType: string): Promise<void> {
	try {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) { return; }

		// Generate unique filename with timestamp
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const extension = imageType === 'image/png' ? 'png' :
						 imageType === 'image/jpeg' ? 'jpg' :
						 imageType === 'image/gif' ? 'gif' : 'png';
		const filename = `claude-image-${timestamp}.${extension}`;

		// Create images directory if it doesn't exist
		const imagesDir = path.join(workspaceFolder.uri.fsPath, 'claude-images');
		const imagesDirUri = vscode.Uri.file(imagesDir);

		try {
			await vscode.workspace.fs.stat(imagesDirUri);
		} catch {
			await vscode.workspace.fs.createDirectory(imagesDirUri);
		}

		// Write image file
		const filePath = path.join(imagesDir, filename);
		const fileUri = vscode.Uri.file(filePath);

		// Convert base64 to buffer
		const base64Data = imageData.split(',')[1]; // Remove data:image/png;base64, prefix
		const buffer = Buffer.from(base64Data, 'base64');

		await vscode.workspace.fs.writeFile(fileUri, buffer);

		// Open the created image file
		const document = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(document, { preview: false });

		vscode.window.showInformationMessage(`Image saved as ${filename}`);

	} catch (error) {
		console.error('Failed to create image file:', error);
		vscode.window.showErrorMessage('Failed to save image file');
	}
}

export async function sendWorkspaceFiles(provider: ClaudeChatProvider, searchTerm?: string): Promise<void> {
	try {
		// Always get all files and filter on the backend for better search results
		const files = await vscode.workspace.findFiles(
			'**/*',
			'**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/.nuxt/**,**/coverage/**,**/.vscode/**,**/.history/**,**/tmp/**,**/temp/**',
			1000
		);

		let fileList = files.map(file => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (workspaceFolder) {
				return path.relative(workspaceFolder.uri.fsPath, file.fsPath);
			}
			return file.fsPath;
		});

		// Filter results if search term provided
		if (searchTerm && searchTerm.trim()) {
			const searchLower = searchTerm.toLowerCase().trim();
			fileList = fileList.filter(file =>
				file.toLowerCase().includes(searchLower)
			);
		}

		// Sort files alphabetically
		fileList.sort();

		provider._postMessage({
			type: 'workspaceFiles',
			data: fileList.slice(0, 100) // Limit to 100 files for UI performance
		});

	} catch (error) {
		console.error('Failed to get workspace files:', error);
		provider._postMessage({
			type: 'workspaceFiles',
			data: []
		});
	}
}

export async function selectImageFile(provider: ClaudeChatProvider): Promise<void> {
	try {
		// Show VS Code's native file picker for images
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectMany: false,
			openLabel: 'Select Image',
			filters: {
				'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
			}
		});

		if (result && result.length > 0) {
			const filePath = result[0].fsPath;

			// Check if file still exists
			try {
				await vscode.workspace.fs.stat(result[0]);
			} catch {
				vscode.window.showErrorMessage('Selected file no longer exists');
				return;
			}

			provider._postMessage({
				type: 'imageFileSelected',
				data: filePath
			});
		}

	} catch (error) {
		console.error('Failed to select image file:', error);
		vscode.window.showErrorMessage('Failed to select image file');
	}
}

export function sendEditorContext(provider: ClaudeChatProvider): void {
	const activeEditor = vscode.window.activeTextEditor;

	if (!activeEditor) {
		provider._postMessage({
			type: 'editorContext',
			data: null
		});
		return;
	}

	const document = activeEditor.document;
	const selection = activeEditor.selection;

	// Get selected text if any
	let selectedText = '';
	if (!selection.isEmpty) {
		selectedText = document.getText(selection);
	}

	const editorContext = {
		fileName: path.basename(document.fileName),
		filePath: document.fileName,
		language: document.languageId,
		selection: {
			start: { line: selection.start.line, character: selection.start.character },
			end: { line: selection.end.line, character: selection.end.character }
		},
		selectedText: selectedText
	};

	provider._postMessage({
		type: 'editorContext',
		data: editorContext
	});
}

export function getEditorContext(_provider: ClaudeChatProvider): any {
	const activeEditor = vscode.window.activeTextEditor;

	if (!activeEditor) {
		return null;
	}

	const document = activeEditor.document;
	const selection = activeEditor.selection;

	// Get selected text if any
	let selectedText = '';
	if (!selection.isEmpty) {
		selectedText = document.getText(selection);
	}

	return {
		fileName: path.basename(document.fileName),
		filePath: document.fileName,
		language: document.languageId,
		selection: {
			start: { line: selection.start.line, character: selection.start.character },
			end: { line: selection.end.line, character: selection.end.character }
		},
		selectedText: selectedText
	};
}
