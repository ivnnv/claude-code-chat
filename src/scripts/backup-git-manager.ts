import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';

const exec = util.promisify(cp.exec);

export class BackupGitManager {
	constructor(
		private _context: vscode.ExtensionContext,
		private _postMessage: (msg: any) => void
	) {}

	public async initializeBackupRepo(): Promise<string | undefined> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return undefined;
		}

		const workspacePath = workspaceFolder.uri.fsPath;
		const globalStoragePath = this._context.globalStorageUri.fsPath;

		// Create a backup repo path based on workspace folder name
		const workspaceName = path.basename(workspacePath).replace(/[^a-zA-Z0-9-_]/g, '_');
		const backupRepoPath = path.join(globalStoragePath, 'backups', workspaceName);

		// Create backup directory if it doesn't exist
		if (!fs.existsSync(backupRepoPath)) {
			fs.mkdirSync(backupRepoPath, { recursive: true });
		}

		// Initialize git repo if it's not already initialized
		try {
			await exec('git status', { cwd: backupRepoPath });
		} catch {
			try {
				await exec('git init', { cwd: backupRepoPath });
				await exec('git config user.name "Claude Code VSC Panel"', { cwd: backupRepoPath });
				await exec('git config user.email "claude@vsc-panel.local"', { cwd: backupRepoPath });
			} catch (error) {
				console.error('Failed to initialize git repo:', error);
				return undefined;
			}
		}

		return backupRepoPath;
	}

	public async createBackupCommit(userMessage: string, backupRepoPath: string): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder || !backupRepoPath) {
			return;
		}

		const workspacePath = workspaceFolder.uri.fsPath;

		try {
			// Copy workspace files to backup repo (excluding git folders and node_modules)
			const rsyncCommand = process.platform === 'win32'
				? `robocopy "${workspacePath}" "${backupRepoPath}" /MIR /XD .git node_modules .vscode /XF *.log`
				: `rsync -av --delete --exclude='.git' --exclude='node_modules' --exclude='.vscode' --exclude='*.log' "${workspacePath}/" "${backupRepoPath}/"`;

			if (process.platform === 'win32') {
				try {
					await exec(rsyncCommand);
				} catch (error: any) {
					// robocopy exit codes 0-1 are success
					if (!error.code || error.code > 1) {
						throw error;
					}
				}
			} else {
				await exec(rsyncCommand);
			}

			// Stage and commit changes
			await exec('git add .', { cwd: backupRepoPath });

			try {
				const commitMessage = `Backup before: ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`;
				await exec(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: backupRepoPath });
			} catch {
				// No changes to commit, which is fine
			}

			// Update commits list
			await this.updateCommitsList(backupRepoPath);

		} catch (error) {
			console.error('Failed to create backup commit:', error);
		}
	}

	public async restoreToCommit(commitSha: string, backupRepoPath: string): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder || !backupRepoPath) {
			this._postMessage({ type: 'error', data: 'No workspace folder found' });
			return;
		}

		const workspacePath = workspaceFolder.uri.fsPath;

		try {
			// Reset to the specified commit
			await exec(`git reset --hard ${commitSha}`, { cwd: backupRepoPath });

			// Copy files back to workspace
			const rsyncCommand = process.platform === 'win32'
				? `robocopy "${backupRepoPath}" "${workspacePath}" /MIR /XD .git /XF *.log`
				: `rsync -av --delete --exclude='.git' --exclude='*.log' "${backupRepoPath}/" "${workspacePath}/"`;

			if (process.platform === 'win32') {
				try {
					await exec(rsyncCommand);
				} catch (error: any) {
					if (!error.code || error.code > 1) {
						throw error;
					}
				}
			} else {
				await exec(rsyncCommand);
			}

			this._postMessage({
				type: 'restored',
				data: `Successfully restored to commit ${commitSha.substring(0, 7)}`
			});

			// Update commits list after restore
			await this.updateCommitsList(backupRepoPath);

		} catch (error) {
			console.error('Failed to restore to commit:', error);
			this._postMessage({
				type: 'error',
				data: `Failed to restore to commit: ${error}`
			});
		}
	}

	private async updateCommitsList(backupRepoPath: string): Promise<Array<{ id: string, sha: string, message: string, timestamp: string }>> {
		try {
			const { stdout } = await exec('git log --oneline --pretty=format:"%H|%s|%ad" --date=iso -20', { cwd: backupRepoPath });

			const commits = stdout.split('\n')
				.filter(line => line.trim())
				.map((line, index) => {
					const [sha, message, timestamp] = line.split('|');
					return {
						id: `commit-${index}`,
						sha: sha?.trim() || '',
						message: message?.trim() || '',
						timestamp: timestamp?.trim() || ''
					};
				});

			this._postMessage({ type: 'commits', data: commits });
			return commits;

		} catch (error) {
			console.error('Failed to get commits list:', error);
			return [];
		}
	}

	public async getCommitsList(backupRepoPath?: string): Promise<Array<{ id: string, sha: string, message: string, timestamp: string }>> {
		if (!backupRepoPath) {
			return [];
		}
		return await this.updateCommitsList(backupRepoPath);
	}
}
