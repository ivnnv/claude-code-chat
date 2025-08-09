import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as util from 'util';

const _exec = util.promisify(cp.exec);

export class EditorFileManager {
	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public async sendWorkspaceFiles(searchTerm?: string): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			this._postMessage({ type: 'workspaceFiles', data: [] });
			return;
		}

		try {
			const exclude = [
				'node_modules/**',
				'.git/**',
				'out/**',
				'dist/**',
				'build/**',
				'*.log',
				'*.tmp',
				'.DS_Store',
				'Thumbs.db'
			];

			// Get all files in workspace
			const files = await vscode.workspace.findFiles(
				searchTerm ? `**/*${searchTerm}*` : '**/*',
				`{${exclude.join(',')}}`,
				1000 // Limit to 1000 files for performance
			);

			const fileList = files.map(uri => ({
				path: vscode.workspace.asRelativePath(uri),
				fullPath: uri.fsPath,
				name: path.basename(uri.fsPath),
				isDirectory: false
			}));

			this._postMessage({ type: 'workspaceFiles', data: fileList });

		} catch (error) {
			console.error('Failed to get workspace files:', error);
			this._postMessage({ type: 'workspaceFiles', data: [] });
		}
	}

	public async selectImageFile(): Promise<void> {
		try {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Select Image',
				filters: {
					'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
				}
			};

			const fileUri = await vscode.window.showOpenDialog(options);
			if (fileUri && fileUri[0]) {
				const filePath = fileUri[0].fsPath;
				const fileName = path.basename(filePath);

				// Read image file and convert to base64
				const imageData = await fs.promises.readFile(filePath);
				const base64Data = imageData.toString('base64');
				const extension = path.extname(fileName).toLowerCase().replace('.', '');
				const mimeType = this.getMimeType(extension);

				this._postMessage({
					type: 'imageSelected',
					data: {
						name: fileName,
						path: filePath,
						data: `data:${mimeType};base64,${base64Data}`
					}
				});
			}
		} catch (error) {
			console.error('Failed to select image file:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to select image: ${error}`
			});
		}
	}

	public async openFileInEditor(filePath: string): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			const document = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(document);
		} catch (error) {
			console.error('Failed to open file in editor:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to open file: ${error}`
			});
		}
	}

	public async createImageFile(imageData: string, _imageType: string): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				this._postMessage({
					type: 'error',
					data: 'No workspace folder found'
				});
				return;
			}

			// Extract base64 data from data URL
			const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
			if (!matches) {
				this._postMessage({
					type: 'error',
					data: 'Invalid image data format'
				});
				return;
			}

			const extension = matches[1];
			const base64Data = matches[2];

			// Generate filename
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const filename = `claude-generated-${timestamp}.${extension}`;

			// Create images directory if it doesn't exist
			const imagesDir = path.join(workspaceFolder.uri.fsPath, 'images');
			if (!fs.existsSync(imagesDir)) {
				fs.mkdirSync(imagesDir, { recursive: true });
			}

			const filePath = path.join(imagesDir, filename);

			// Convert base64 to buffer and save
			const buffer = Buffer.from(base64Data, 'base64');
			await fs.promises.writeFile(filePath, buffer);

			this._postMessage({
				type: 'imageFileSaved',
				data: {
					filename,
					path: filePath,
					relativePath: path.relative(workspaceFolder.uri.fsPath, filePath)
				}
			});

		} catch (error) {
			console.error('Failed to create image file:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to create image file: ${error}`
			});
		}
	}

	public async getClipboardText(): Promise<void> {
		try {
			const text = await vscode.env.clipboard.readText();
			this._postMessage({ type: 'clipboardText', data: text });
		} catch (error) {
			console.error('Failed to get clipboard text:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to get clipboard text: ${error}`
			});
		}
	}

	public initializeEditorListeners(): void {
		// Listen for active editor changes
		vscode.window.onDidChangeActiveTextEditor(() => {
			this.sendEditorContext();
		}, null, this._context.subscriptions);

		// Listen for text selection changes
		vscode.window.onDidChangeTextEditorSelection(() => {
			this.sendEditorContext();
		}, null, this._context.subscriptions);

		// Listen for document changes
		vscode.workspace.onDidChangeTextDocument(() => {
			// Debounce this event to avoid excessive updates
			clearTimeout(this.editorContextDebounce);
			this.editorContextDebounce = setTimeout(() => {
				this.sendEditorContext();
			}, 500);
		}, null, this._context.subscriptions);

		// Send initial context
		this.sendEditorContext();
	}

	private editorContextDebounce: NodeJS.Timeout | undefined;

	private sendEditorContext(): void {
		const context = this.getEditorContext();
		this._postMessage({ type: 'editorContext', data: context });
	}

	private getEditorContext(): any {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return {
				hasActiveEditor: false,
				workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null
			};
		}

		const selection = editor.selection;
		const selectedText = editor.document.getText(selection);

		return {
			hasActiveEditor: true,
			fileName: path.basename(editor.document.fileName),
			filePath: editor.document.fileName,
			relativePath: vscode.workspace.asRelativePath(editor.document.fileName),
			language: editor.document.languageId,
			lineCount: editor.document.lineCount,
			hasSelection: !selection.isEmpty,
			selectedText: selectedText.length > 1000 ? selectedText.substring(0, 1000) + '...' : selectedText,
			cursorPosition: {
				line: selection.active.line + 1,
				character: selection.active.character + 1
			},
			workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null
		};
	}

	private getMimeType(extension: string): string {
		const mimeTypes: { [key: string]: string } = {
			'png': 'image/png',
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'gif': 'image/gif',
			'bmp': 'image/bmp',
			'webp': 'image/webp',
			'svg': 'image/svg+xml'
		};
		return mimeTypes[extension] || 'image/png';
	}
}
