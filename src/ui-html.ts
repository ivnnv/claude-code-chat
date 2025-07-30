import * as fs from 'fs';
import * as path from 'path';

// Read the compiled JS from the compiled ui-scripts.js in out/
const getCompiledScripts = (): string => {
	try {
		// In development, read from the compiled output
		const compiledPath = path.join(__dirname, 'ui-scripts.js');
		if (fs.existsSync(compiledPath)) {
			return fs.readFileSync(compiledPath, 'utf8');
		}
	} catch {
		console.warn('Could not read compiled scripts, using fallback');
	}
	
	// Fallback - basic functionality
	return `
		console.log('UI loaded with fallback scripts');
		const vscode = acquireVsCodeApi();
		document.addEventListener('DOMContentLoaded', function() {
			console.log('Fallback UI initialized');
		});
	`;
};

// Read the separate files and combine them
const htmlContent = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, 'ui.css'), 'utf8');
const jsContent = getCompiledScripts();

// Combine into a single HTML string
const html = htmlContent
  .replace('<link rel="stylesheet" href="ui.css">', `<style>${cssContent}</style>`)
  .replace('<script src="ui.js"></script>', `<script>${jsContent}</script>`);

export default html;