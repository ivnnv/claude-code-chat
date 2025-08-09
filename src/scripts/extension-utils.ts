import * as vscode from 'vscode';
import * as cp from 'child_process';

// Types and interfaces
export interface ConversationData {
	sessionId: string;
	startTime: string | undefined;
	endTime: string;
	messageCount: number;
	totalCost: number;
	totalTokens: {
		input: number;
		output: number;
	};
	messages: Array<{ timestamp: string, messageType: string, data: any }>;
	filename: string;
}

export interface PricingModel {
	input: number;
	output: number;
}

// 2025 Claude API Pricing (per million tokens)
export const PRICING_MODEL: Record<string, PricingModel> = {
	'sonnet': {
		input: 3.00,    // $3 per million input tokens
		output: 15.00   // $15 per million output tokens
	},
	'opus': {
		input: 15.00,   // $15 per million input tokens
		output: 75.00   // $75 per million output tokens
	},
	'haiku': {
		input: 0.80,    // $0.80 per million input tokens (3.5 Haiku)
		output: 4.00    // $4.00 per million output tokens (3.5 Haiku)
	},
	'default': {
		input: 3.00,    // Assume Sonnet pricing for default
		output: 15.00
	}
};

// Cost calculation utility
export function calculateCost(
	inputTokens: number,
	outputTokens: number,
	model: string,
	cacheCreationTokens: number = 0,
	cacheReadTokens: number = 0
): number {
	const pricing = PRICING_MODEL[model] || PRICING_MODEL.default;

	// Convert tokens to millions and calculate cost
	const inputCost = (inputTokens / 1_000_000) * pricing.input;
	const outputCost = (outputTokens / 1_000_000) * pricing.output;

	// Cache tokens are typically priced at a fraction of input tokens (25% for creation, 10% for reads)
	const cacheCreationCost = (cacheCreationTokens / 1_000_000) * pricing.input * 0.25;
	const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.input * 0.10;

	const totalCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;

	return totalCost;
}

// WSL path conversion utility
export function convertToWSLPath(windowsPath: string, wslEnabled?: boolean): string {
	// Get WSL configuration if not provided
	if (wslEnabled === undefined) {
		const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
		wslEnabled = config.get<boolean>('wsl.enabled', false);
	}

	if (wslEnabled && windowsPath.match(/^[a-zA-Z]:/)) {
		// Convert C:\Users\... to /mnt/c/Users/...
		return windowsPath.replace(/^([a-zA-Z]):/, '/mnt/$1').toLowerCase().replace(/\\/g, '/');
	}

	return windowsPath;
}

// Command pattern utility for permission matching
export function getCommandPattern(command: string): string {
	const parts = command.trim().split(/\s+/);
	if (parts.length === 0) { return command; }

	const baseCmd = parts[0];
	const subCmd = parts.length > 1 ? parts[1] : '';

	// Common patterns that should use wildcards
	const patterns = [
		// Package managers
		['npm', 'install', 'npm install *'],
		['npm', 'i', 'npm i *'],
		['npm', 'add', 'npm add *'],
		['npm', 'remove', 'npm remove *'],
		['npm', 'uninstall', 'npm uninstall *'],
		['npm', 'update', 'npm update *'],
		['npm', 'run', 'npm run *'],
		['yarn', 'add', 'yarn add *'],
		['yarn', 'remove', 'yarn remove *'],
		['yarn', 'install', 'yarn install *'],
		['pnpm', 'install', 'pnpm install *'],
		['pnpm', 'add', 'pnpm add *'],
		['pnpm', 'remove', 'pnpm remove *'],

		// Git commands
		['git', 'add', 'git add *'],
		['git', 'commit', 'git commit *'],
		['git', 'push', 'git push *'],
		['git', 'pull', 'git pull *'],
		['git', 'checkout', 'git checkout *'],
		['git', 'branch', 'git branch *'],
		['git', 'merge', 'git merge *'],
		['git', 'clone', 'git clone *'],
		['git', 'reset', 'git reset *'],
		['git', 'rebase', 'git rebase *'],
		['git', 'tag', 'git tag *'],

		// Docker commands
		['docker', 'run', 'docker run *'],
		['docker', 'build', 'docker build *'],
		['docker', 'exec', 'docker exec *'],
		['docker', 'logs', 'docker logs *'],
		['docker', 'stop', 'docker stop *'],
		['docker', 'start', 'docker start *'],
		['docker', 'rm', 'docker rm *'],
		['docker', 'rmi', 'docker rmi *'],
		['docker', 'pull', 'docker pull *'],
		['docker', 'push', 'docker push *'],

		// Build tools
		['make', '', 'make *'],
		['cargo', 'build', 'cargo build *'],
		['cargo', 'run', 'cargo run *'],
		['cargo', 'test', 'cargo test *'],
		['cargo', 'install', 'cargo install *'],
		['mvn', 'compile', 'mvn compile *'],
		['mvn', 'test', 'mvn test *'],
		['mvn', 'package', 'mvn package *'],
		['gradle', 'build', 'gradle build *'],
		['gradle', 'test', 'gradle test *'],

		// System commands
		['curl', '', 'curl *'],
		['wget', '', 'wget *'],
		['ssh', '', 'ssh *'],
		['scp', '', 'scp *'],
		['rsync', '', 'rsync *'],
		['tar', '', 'tar *'],
		['zip', '', 'zip *'],
		['unzip', '', 'unzip *'],

		// Development tools
		['node', '', 'node *'],
		['python', '', 'python *'],
		['python3', '', 'python3 *'],
		['pip', 'install', 'pip install *'],
		['pip3', 'install', 'pip3 install *'],
		['composer', 'install', 'composer install *'],
		['composer', 'require', 'composer require *'],
		['bundle', 'install', 'bundle install *'],
		['gem', 'install', 'gem install *'],
	];

	// Find matching pattern
	for (const [cmd, sub, pattern] of patterns) {
		if (baseCmd === cmd && (sub === '' || subCmd === sub)) {
			return pattern;
		}
	}

	// Default: return exact command
	return command;
}

// Platform info utility
export function getPlatformInfo() {
	return {
		platform: process.platform,
		architecture: process.arch,
		nodeVersion: process.version,
		isWindows: process.platform === 'win32',
		isMac: process.platform === 'darwin',
		isLinux: process.platform === 'linux'
	};
}

// File system utilities
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
	try {
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
	} catch (error) {
		// Directory might already exist, which is fine
		if (error && typeof error === 'object' && 'code' in error && error.code !== 'FileExists') {
			throw error;
		}
	}
}

// Process utilities
export function killProcess(process: cp.ChildProcess | undefined): void {
	if (process && !process.killed) {
		try {
			if (process.pid) {
				if (getPlatformInfo().isWindows) {
					cp.exec(`taskkill /pid ${process.pid} /T /F`);
				} else {
					process.kill('SIGTERM');
					setTimeout(() => {
						if (process && !process.killed && process.pid) {
							process.kill('SIGKILL');
						}
					}, 5000);
				}
			}
		} catch (error) {
			console.error('Error killing process:', error);
		}
	}
}

// Editor context utilities
export function getEditorContext(): any {
	const activeEditor = vscode.window.activeTextEditor;

	if (!activeEditor) {
		return {
			hasActiveFile: false,
			fileName: null,
			filePath: null,
			language: null,
			selection: null,
			selectedText: null,
			cursorPosition: null,
			totalLines: 0
		};
	}

	const document = activeEditor.document;
	const selection = activeEditor.selection;
	const selectedText = document.getText(selection);

	// Get cursor position (line and character are 0-based, so add 1 for display)
	const cursorPosition = {
		line: selection.active.line + 1,
		character: selection.active.character + 1
	};

	// Get selection info
	const selectionInfo = selection.isEmpty ? null : {
		start: {
			line: selection.start.line + 1,
			character: selection.start.character + 1
		},
		end: {
			line: selection.end.line + 1,
			character: selection.end.character + 1
		},
		text: selectedText
	};

	return {
		hasActiveFile: true,
		fileName: document.fileName.split('/').pop() || document.fileName,
		filePath: document.fileName,
		language: document.languageId,
		selection: selectionInfo,
		selectedText: selectedText || null,
		cursorPosition: cursorPosition,
		totalLines: document.lineCount,
		isDirty: document.isDirty,
		isUntitled: document.isUntitled
	};
}

// Message formatting utilities
export function formatReadyMessage(isProcessing: boolean | undefined): string {
	return isProcessing ? 'Claude is working...' : 'Ready to chat with Claude Code! Type your message below.';
}

// Validation utilities
export function isValidModel(model: string): boolean {
	return Object.keys(PRICING_MODEL).includes(model);
}

// Timestamp utilities
export function getCurrentTimestamp(): string {
	return new Date().toISOString();
}

// Session utilities
export function generateSessionId(): string {
	return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
