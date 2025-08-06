import * as fs from 'fs';
import * as path from 'path';

// Simply serve the RSBuild-generated HTML directly
const htmlPath = path.join(__dirname, 'webview', 'index.html');

if (!fs.existsSync(htmlPath)) {
	throw new Error(`Webview HTML not found at ${htmlPath}. Run "pnpm run compile" to build the extension.`);
}

const html = fs.readFileSync(htmlPath, 'utf8');

export default html;
