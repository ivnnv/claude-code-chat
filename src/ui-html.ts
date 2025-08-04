import * as fs from 'fs';
import * as path from 'path';

// Read the compiled JS from the compiled ui-scripts.js in out/
const getCompiledScripts = (): string => {
	// Read from the same directory (out/) where this compiled file is located
	const compiledPath = path.join(__dirname, 'ui-scripts.js');

	if (!fs.existsSync(compiledPath)) {
		throw new Error(`ui-scripts.js not found at ${compiledPath}. Run "npm run compile" to build the extension.`);
	}

	try {
		const content = fs.readFileSync(compiledPath, 'utf8');
		console.log(`Successfully loaded ui-scripts.js (${content.length} characters)`);
		return content;
	} catch (error) {
		throw new Error(`Failed to read ui-scripts.js: ${error}. Run "npm run compile" to rebuild.`);
	}
};

// Read the separate files and combine them
const htmlContent = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, 'ui.css'), 'utf8');
const jsContent = getCompiledScripts();

// Combine into a single HTML string
const html = htmlContent
  .replace('<link rel="stylesheet" href="ui.css">', `<style>${cssContent}</style>`)
  .replace('<script src="ui-scripts.js"></script>', `<script>${jsContent}</script>`);

export default html;
