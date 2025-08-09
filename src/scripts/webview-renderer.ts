import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WebviewRenderer {
	constructor(private _extensionUri: vscode.Uri) {}

	public getHtmlForWebview(webview: vscode.Webview): string {
		// Read RSBuild's generated HTML and adapt it for webview URIs
		const htmlPath = path.join(__dirname, '..', 'webview', 'index.html');
		if (!fs.existsSync(htmlPath)) {
			throw new Error(`Webview HTML not found at ${htmlPath}. Run "pnpm run compile" to build the extension.`);
		}

		let html = fs.readFileSync(htmlPath, 'utf8');

		// Determine if we're in development mode
		const isDev = process.env.NODE_ENV === 'development';

		if (isDev) {
			// Development mode: use hot reload server
			html = html.replace(
				/<script defer src="\.\/static\/js\/index\.js"><\/script>/g,
				'<script defer src="http://localhost:3001/static/js/index.js"></script>'
			);
			html = html.replace(
				/<link href="\.\/static\/css\/index\.css" rel="stylesheet">/g,
				'<link href="http://localhost:3001/static/css/index.css" rel="stylesheet">'
			);
		} else {
			// Production mode: use webview URIs
			const jsUri = webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'static', 'js', 'index.js')
			);
			const cssUri = webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'static', 'css', 'index.css')
			);

			html = html.replace(
				/<script defer src="\.\/static\/js\/index\.js"><\/script>/g,
				`<script defer src="${jsUri}"></script>`
			);
			html = html.replace(
				/<link href="\.\/static\/css\/index\.css" rel="stylesheet">/g,
				`<link href="${cssUri}" rel="stylesheet">`
			);
		}

		// Add CSP
		const nonce = this.getNonce();
		const csp = isDev
			? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' http://localhost:3001; script-src 'nonce-${nonce}' http://localhost:3001; connect-src ws://localhost:3001; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">`
			: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">`;

		html = html.replace('<head>', `<head>\n${csp}`);
		html = html.replace('<script', `<script nonce="${nonce}"`);

		return html;
	}

	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	public setupHotReload(postMessage: (msg: any) => void): void {
		if (process.env.NODE_ENV !== 'development') {return;}

		// Watch for file changes in development
		const watcher = fs.watch(path.join(__dirname, '..', '..', 'src'), { recursive: true }, (eventType, filename) => {
			if (filename && (filename.endsWith('.ts') || filename.endsWith('.scss') || filename.endsWith('.html'))) {
				console.log('🔄 Hot reload triggered by:', filename);
				setTimeout(() => {
					this.recreateWebviewForHotReload(postMessage);
				}, 500);
			}
		});

		// Clean up watcher when extension deactivates
		process.on('exit', () => {
			watcher.close();
		});
	}

	private recreateWebviewForHotReload(postMessage: (msg: any) => void): void {
		try {
			const isCSSChange = true; // We could detect this more precisely

			postMessage({
				type: 'hotReload',
				data: {
					timestamp: Date.now(),
					reloadType: isCSSChange ? 'css' : 'full'
				}
			});
		} catch (error) {
			console.error('❌ Failed to recreate webview for hot reload:', error);
		}
	}
}
