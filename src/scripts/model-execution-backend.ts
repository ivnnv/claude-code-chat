import * as cp from 'child_process';
import * as vscode from 'vscode';
import { ClaudeChatProvider } from '../claude-provider';

export async function processJsonStreamData(provider: ClaudeChatProvider, jsonData: any) {
	switch (jsonData.type) {
		case 'system':
			if (jsonData.subtype === 'init') {
				// System initialization message - session ID will be captured from final result
				provider._currentSessionId = jsonData.session_id;
				//provider._sendAndSaveMessage({ type: 'init', data: { sessionId: jsonData.session_id; } })

				// Show session info in UI
				provider._sendAndSaveMessage({
					type: 'sessionInfo',
					data: {
						sessionId: jsonData.session_id,
						tools: jsonData.tools || [],
						mcpServers: jsonData.mcp_servers || []
					}
				});
			}
			break;

		case 'assistant':
			if (jsonData.message && jsonData.message.content) {
				// Track token usage in real-time if available
				if (jsonData.message.usage) {
					const currentInputTokens = jsonData.message.usage.input_tokens || 0;
					const currentOutputTokens = jsonData.message.usage.output_tokens || 0;
					const cacheCreationTokens = jsonData.message.usage.cache_creation_input_tokens || 0;
					const cacheReadTokens = jsonData.message.usage.cache_read_input_tokens || 0;

					// Update cumulative token counts
					provider._totalTokensInput += currentInputTokens;
					provider._totalTokensOutput += currentOutputTokens;

					// Calculate cost for this request
					const requestCost = provider._calculateCost(currentInputTokens, currentOutputTokens, cacheCreationTokens, cacheReadTokens);
					provider._totalCost += requestCost;

					// Send real-time token update to webview
					provider._sendAndSaveMessage({
						type: 'updateTokens',
						data: {
							totalTokensInput: provider._totalTokensInput,
							totalTokensOutput: provider._totalTokensOutput,
							currentInputTokens: currentInputTokens,
							currentOutputTokens: currentOutputTokens,
							cacheCreationTokens: cacheCreationTokens,
							cacheReadTokens: cacheReadTokens
						}
					});
				}

				// Process each content item in the assistant message
				for (const content of jsonData.message.content) {
					if (content.type === 'text' && content.text.trim()) {
						// Show text content and save to conversation
						provider._sendAndSaveMessage({
							type: 'output',
							data: content.text.trim()
						});
					} else if (content.type === 'thinking' && content.thinking.trim()) {
						// Show thinking content and save to conversation
						provider._sendAndSaveMessage({
							type: 'thinking',
							data: content.thinking.trim()
						});
					} else if (content.type === 'tool_use') {
						// Show tool execution with better formatting
						const toolInfo = `🔧 Executing: ${content.name}`;
						let toolInput = '';

						if (content.input) {
							// Special formatting for TodoWrite to make it more readable
							if (content.name === 'TodoWrite' && content.input.todos) {
								toolInput = '\nTodo List Update:';
								for (const todo of content.input.todos) {
									const status = todo.status === 'completed' ? '✅' :
										todo.status === 'in_progress' ? '🔄' : '⏳';
									toolInput += `\n${status} ${todo.content}`;
								}
							} else {
								// Send raw input to UI for formatting
								toolInput = '';
							}
						}

						// Show tool use and save to conversation
						provider._sendAndSaveMessage({
							type: 'toolUse',
							data: {
								toolInfo: toolInfo,
								toolInput: toolInput,
								rawInput: content.input,
								toolName: content.name
							}
						});
					}
				}
			}
			break;

		case 'user':
			if (jsonData.message && jsonData.message.content) {
				// Process tool results from user messages
				for (const content of jsonData.message.content) {
					if (content.type === 'tool_result') {
						let resultContent = content.content || 'Tool executed successfully';

						// Stringify if content is an object or array
						if (typeof resultContent === 'object' && resultContent !== null) {
							resultContent = JSON.stringify(resultContent, null, 2);
						}

						const isError = content.is_error || false;

						// Find the last tool use to get the tool name
						const lastToolUse = provider._currentConversation[provider._currentConversation.length - 1];

						const toolName = lastToolUse?.data?.toolName;

						// Don't send tool result for Read and Edit tools unless there's an error
						if ((toolName === 'Read' || toolName === 'Edit' || toolName === 'TodoWrite' || toolName === 'MultiEdit') && !isError) {
							// Still send to UI to hide loading state, but mark it as hidden
							provider._sendAndSaveMessage({
								type: 'toolResult',
								data: {
									content: resultContent,
									isError: isError,
									toolUseId: content.tool_use_id,
									toolName: toolName,
									hidden: true
								}
							});
						} else {
							// Show tool result and save to conversation
							provider._sendAndSaveMessage({
								type: 'toolResult',
								data: {
									content: resultContent,
									isError: isError,
									toolUseId: content.tool_use_id,
									toolName: toolName
								}
							});
						}
					}
				}
			}
			break;

		case 'result':
			if (jsonData.subtype === 'success') {
				// Check for login errors
				if (jsonData.is_error && jsonData.result && jsonData.result.includes('Invalid API key')) {
					await handleLoginRequired(provider);
					return;
				}

				provider._isProcessing = false;

				// Capture session ID from final result
				if (jsonData.session_id) {
					provider._currentSessionId = jsonData.session_id;

					// Show session info in UI
					provider._sendAndSaveMessage({
						type: 'sessionInfo',
						data: {
							sessionId: jsonData.session_id,
							tools: jsonData.tools || [],
							mcpServers: jsonData.mcp_servers || []
						}
					});
				}

				// Clear processing state
				provider._postMessage({
					type: 'setProcessing',
					data: { isProcessing: false }
				});

				// Update cumulative tracking
				provider._requestCount++;

				// Process final usage information if available and not already processed
				if (jsonData.usage) {
					const finalInputTokens = jsonData.usage.input_tokens || 0;
					const finalOutputTokens = jsonData.usage.output_tokens || 0;
					const cacheCreationTokens = jsonData.usage.cache_creation_input_tokens || 0;
					const cacheReadTokens = jsonData.usage.cache_read_input_tokens || 0;

					// Check if our running totals match the final usage
					if (finalInputTokens !== provider._totalTokensInput || finalOutputTokens !== provider._totalTokensOutput) {
						// Update to final values and recalculate cost
						provider._totalTokensInput = finalInputTokens;
						provider._totalTokensOutput = finalOutputTokens;

						// Recalculate total cost based on final usage
						provider._totalCost = provider._calculateCost(finalInputTokens, finalOutputTokens, cacheCreationTokens, cacheReadTokens);
					}
				}

				// Use provided cost if available, otherwise rely on our calculated cost from token usage
				const providedCost = jsonData.total_cost_usd;
				if (providedCost && providedCost > 0) {
					// Compare CLI provided cost with our calculation

					// Use the provided cost since it's the authoritative source
					provider._totalCost = providedCost;
				}


				// Send updated totals to webview
				provider._postMessage({
					type: 'updateTotals',
					data: {
						totalCost: provider._totalCost, // Use our calculated cost
						totalTokensInput: provider._totalTokensInput,
						totalTokensOutput: provider._totalTokensOutput,
						requestCount: provider._requestCount,
						currentCost: providedCost || 0, // Show provided cost for comparison
						currentDuration: jsonData.duration_ms,
						currentTurns: jsonData.num_turns
					}
				});
			}
			break;
	}
}

export async function sendMessageToClaude(provider: ClaudeChatProvider, message: string, planMode?: boolean, thinkingMode?: boolean) {
	// Check if Claude is already processing and we can send additional messages
	if (provider._currentClaudeProcess && provider._currentClaudeProcess.stdin && !provider._currentClaudeProcess.stdin.destroyed) {

		// Prepare message with mode prefixes if enabled
		let actualMessage = message;
		if (planMode) {
			actualMessage = 'PLAN FIRST FOR THIS MESSAGE ONLY: Plan first before making any changes. Show me in detail what you will change and wait for my explicit approval in a separate message before proceeding. Do not implement anything until I confirm. This planning requirement applies ONLY to this current message. \n\n' + message;
		}
		if (thinkingMode) {
			const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
			const thinkingIntensity = config.get<string>('thinking.intensity', 'think');
			let thinkingPrompt = '';
			const thinkingMessage = ' THROUGH THIS STEP BY STEP: \n';
			switch (thinkingIntensity) {
				case 'think':
					thinkingPrompt = 'THINK';
					break;
				case 'think-hard':
					thinkingPrompt = 'THINK HARD';
					break;
				case 'think-harder':
					thinkingPrompt = 'THINK HARDER';
					break;
				case 'ultrathink':
					thinkingPrompt = 'ULTRATHINK';
					break;
				default:
					thinkingPrompt = 'THINK';
					break;
			}
			actualMessage = thinkingPrompt + thinkingMessage + message;
			console.log('Sending additional message in thinking mode:', actualMessage);
		}

		// Send the additional message to the existing process
		provider._postMessage({
			type: 'userInput',
			data: message
		});

		// For now, just acknowledge the additional message - stdin is closed after first message
		// TODO: Implement proper message queuing or session continuity
		return;
	}

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

	// Get thinking intensity setting
	const configThink = vscode.workspace.getConfiguration('claudeCodeVscPanel');
	const thinkingIntensity = configThink.get<string>('thinking.intensity', 'think');

	// Prepend mode instructions if enabled
	let actualMessage = message;
	if (planMode) {
		actualMessage = 'PLAN FIRST FOR THIS MESSAGE ONLY: Plan first before making any changes. Show me in detail what you will change and wait for my explicit approval in a separate message before proceeding. Do not implement anything until I confirm. This planning requirement applies ONLY to this current message. \n\n' + message;
	}
	if (thinkingMode) {
		let thinkingPrompt = '';
		const thinkingMessage = ' THROUGH THIS STEP BY STEP: \n';
		switch (thinkingIntensity) {
			case 'think':
				thinkingPrompt = 'THINK';
				break;
			case 'think-hard':
				thinkingPrompt = 'THINK HARD';
				break;
			case 'think-harder':
				thinkingPrompt = 'THINK HARDER';
				break;
			case 'ultrathink':
				thinkingPrompt = 'ULTRATHINK';
				break;
			default:
				thinkingPrompt = 'THINK';
		}
		actualMessage = thinkingPrompt + thinkingMessage + actualMessage;
	}

	provider._isProcessing = true;

	// Clear draft message since we're sending it
	provider._draftMessage = '';

	// Show original user input in chat and save to conversation (without mode prefixes)
	provider._sendAndSaveMessage({
		type: 'userInput',
		data: message
	});

	// Set processing state to true
	provider._postMessage({
		type: 'setProcessing',
		data: { isProcessing: true }
	});

	// Create backup commit before Claude makes changes
	try {
		await provider._createBackupCommit(message);
	}
	catch (e) {
		console.error('Error creating backup commit:', e);
	}

	// Show loading indicator
	provider._postMessage({
		type: 'loading',
		data: 'Claude is working...'
	});

	// Build command arguments with session management
	const args = [
		'-p',
		'--output-format', 'stream-json', '--verbose'
	];

	// Get configuration
	const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
	const yoloMode = config.get<boolean>('permissions.yoloMode', false);

	if (yoloMode) {
		// Yolo mode: skip all permissions regardless of MCP config
		args.push('--dangerously-skip-permissions');
	} else {
		// Add MCP configuration for permissions
		const mcpConfigPath = provider.getMCPConfigPath();
		if (mcpConfigPath) {
			const convertedPath = provider.convertToWSLPath(mcpConfigPath);
			// Escape path with quotes to handle spaces
			args.push('--mcp-config', `"${convertedPath}"`);
			args.push('--allowedTools', 'mcp__claude-code-vsc-panel-permissions__approval_prompt');
			args.push('--permission-prompt-tool', 'mcp__claude-code-vsc-panel-permissions__approval_prompt');
		} else {
			}
	}

	// Add model selection if not using default
	if (provider._selectedModel && provider._selectedModel !== 'default') {
		args.push('--model', provider._selectedModel);
	}

	// Add session resume if we have a current session
	if (provider._currentSessionId) {
		args.push('--resume', provider._currentSessionId);
	} else {
	}

	const wslEnabled = config.get<boolean>('wsl.enabled', false);
	const wslDistro = config.get<string>('wsl.distro', 'Ubuntu');
	const nodePath = config.get<string>('wsl.nodePath', '/usr/bin/node');
	const claudePath = config.get<string>('wsl.claudePath', '/usr/local/bin/claude');

	let claudeProcess: cp.ChildProcess;

	if (wslEnabled) {
		// Use WSL with bash -ic for proper environment loading
		const wslCommand = `"${nodePath}" --no-warnings --enable-source-maps "${claudePath}" ${args.join(' ')}`;

		claudeProcess = cp.spawn('wsl', ['-d', wslDistro, 'bash', '-ic', wslCommand], {
			cwd: cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				FORCE_COLOR: '0',
				NO_COLOR: '1'
			}
		});
	} else {
		// Use native claude command
		// console.log('Using native Claude command');
		// console.log('Spawning claude with args:', args);
		// console.log('Working directory:', cwd);
		// console.log('Current PATH:', process.env.PATH);

		claudeProcess = cp.spawn('claude', args, {
			shell: true,
			cwd: cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				FORCE_COLOR: '0',
				NO_COLOR: '1'
			}
		});
	}

	// Store process reference for potential termination
	provider._currentClaudeProcess = claudeProcess;

	// Handle spawn errors
	claudeProcess.on('error', (error) => {
		console.error('Failed to start Claude process:', error);
		provider._postMessage({
			type: 'error',
			data: `Failed to start Claude: ${error.message}. Make sure Claude CLI is installed and accessible.`
		});
		provider._isProcessing = false;
		return;
	});

	// Send the message to Claude's stdin (with mode prefixes if enabled)
	if (claudeProcess.stdin) {
		claudeProcess.stdin.write(actualMessage + '\n');
		// Close stdin to signal end of input - Claude CLI needs this to start processing
		claudeProcess.stdin.end();
	} else {
	}

	let rawOutput = '';
	let errorOutput = '';

	if (claudeProcess.stdout) {
		claudeProcess.stdout.on('data', (data) => {
			rawOutput += data.toString();

			// Process JSON stream line by line
			const lines = rawOutput.split('\n');
			rawOutput = lines.pop() || ''; // Keep incomplete line for next chunk

			for (const line of lines) {
				if (line.trim()) {
					try {
						const jsonData = JSON.parse(line.trim());
						processJsonStreamData(provider, jsonData);
					} catch {
						// Skip invalid JSON lines
					}
				}
			}
		});
	}

	if (claudeProcess.stderr) {
		claudeProcess.stderr.on('data', (data) => {
			errorOutput += data.toString();
		});
	}

	claudeProcess.on('close', (code) => {

		if (!provider._currentClaudeProcess) {
			return;
		}

		// End stdin if it's still open
		if (provider._currentClaudeProcess.stdin && !provider._currentClaudeProcess.stdin.destroyed) {
			provider._currentClaudeProcess.stdin.end();
		}

		// Clear process reference
		provider._currentClaudeProcess = undefined;

		// Clear loading indicator and set processing to false
		provider._postMessage({
			type: 'clearLoading'
		});

		// Reset processing state
		provider._isProcessing = false;

		// Clear processing state
		provider._postMessage({
			type: 'setProcessing',
			data: { isProcessing: false }
		});

		if (code !== 0 && errorOutput.trim()) {
			// Error with output
			provider._sendAndSaveMessage({
				type: 'error',
				data: errorOutput.trim()
			});
		}
	});

	claudeProcess.on('error', (error) => {

		if (!provider._currentClaudeProcess) {
			return;
		}

		// Clear process reference
		provider._currentClaudeProcess = undefined;

		provider._postMessage({
			type: 'clearLoading'
		});

		provider._isProcessing = false;

		// Clear processing state
		provider._postMessage({
			type: 'setProcessing',
			data: { isProcessing: false }
		});

		// Check if claude command is not installed
		if (error.message.includes('ENOENT') || error.message.includes('command not found')) {
			provider._sendAndSaveMessage({
				type: 'error',
				data: 'Install claude code first: https://www.anthropic.com/claude-code'
			});
		} else {
			provider._sendAndSaveMessage({
				type: 'error',
				data: `Error running Claude: ${error.message}`
			});
		}
	});
}

export async function stopClaudeProcess(provider: ClaudeChatProvider): Promise<void> {

	provider._isProcessing = false;

	// Update UI state
	provider._postMessage({
		type: 'setProcessing',
		data: { isProcessing: false }
	});

	if (provider._currentClaudeProcess) {

		// Try graceful termination first
		provider._currentClaudeProcess.kill('SIGTERM');

		// Force kill after 2 seconds if still running
		setTimeout(() => {
			if (provider._currentClaudeProcess && !provider._currentClaudeProcess.killed) {
				provider._currentClaudeProcess.kill('SIGKILL');
			}
		}, 2000);

		// Clear process reference
		provider._currentClaudeProcess = undefined;

		provider._postMessage({
			type: 'clearLoading'
		});

		// Send stop confirmation message directly to UI and save
		provider._sendAndSaveMessage({
			type: 'error',
			data: '⏹️ Claude code was stopped.'
		});

	} else {
	}
}

export async function handleLoginRequired(provider: ClaudeChatProvider): Promise<void> {

	provider._isProcessing = false;

	// Clear processing state
	provider._postMessage({
		type: 'setProcessing',
		data: { isProcessing: false }
	});

	// Show login required message
	provider._postMessage({
		type: 'loginRequired'
	});

	// Get configuration to check if WSL is enabled
	const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
	const wslEnabled = config.get<boolean>('wsl.enabled', false);
	const wslDistro = config.get<string>('wsl.distro', 'Ubuntu');
	const nodePath = config.get<string>('wsl.nodePath', '/usr/bin/node');
	const claudePath = config.get<string>('wsl.claudePath', '/usr/local/bin/claude');

	// Open terminal and run claude login
	const terminal = vscode.window.createTerminal('Claude Login');
	if (wslEnabled) {
		terminal.sendText(`wsl -d ${wslDistro} ${nodePath} --no-warnings --enable-source-maps ${claudePath}`);
	} else {
		terminal.sendText('claude');
	}
	terminal.show();

	// Show info message
	vscode.window.showInformationMessage(
		'Please login to Claude in the terminal, then come back to this chat to continue.',
		'OK'
	);

	// Send message to UI about terminal
	provider._postMessage({
		type: 'terminalOpened',
		data: `Please login to Claude in the terminal, then come back to this chat to continue.`,
	});
}

export async function openModelTerminal(provider: ClaudeChatProvider): Promise<void> {
	const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
	const wslEnabled = config.get<boolean>('wsl.enabled', false);
	const wslDistro = config.get<string>('wsl.distro', 'Ubuntu');
	const nodePath = config.get<string>('wsl.nodePath', '/usr/bin/node');
	const claudePath = config.get<string>('wsl.claudePath', '/usr/local/bin/claude');

	// Build command arguments
	const args = ['/model'];

	// Add session resume if we have a current session
	if (provider._currentSessionId) {
		args.push('--resume', provider._currentSessionId);
	}

	// Create terminal with the claude /model command
	const terminal = vscode.window.createTerminal('Claude Model Selection');
	if (wslEnabled) {
		terminal.sendText(`wsl -d ${wslDistro} ${nodePath} --no-warnings --enable-source-maps ${claudePath} ${args.join(' ')}`);
	} else {
		terminal.sendText(`claude ${args.join(' ')}`);
	}
	terminal.show();

	// Show info message
	vscode.window.showInformationMessage(
		'Check the terminal to update your default model configuration. Come back to this chat here after making changes.',
		'OK'
	);

	// Send message to UI about terminal
	provider._postMessage({
		type: 'terminalOpened',
		data: 'Check the terminal to update your default model configuration. Come back to this chat here after making changes.'
	});
}

export async function executeSlashCommand(provider: ClaudeChatProvider, command: string): Promise<void> {
	const config = vscode.workspace.getConfiguration('claudeCodeVscPanel');
	const wslEnabled = config.get<boolean>('wsl.enabled', false);
	const wslDistro = config.get<string>('wsl.distro', 'Ubuntu');
	const nodePath = config.get<string>('wsl.nodePath', '/usr/bin/node');
	const claudePath = config.get<string>('wsl.claudePath', '/usr/local/bin/claude');

	// Build command arguments
	const args = [`/${command}`];

	// Add session resume if we have a current session
	if (provider._currentSessionId) {
		args.push('--resume', provider._currentSessionId);
	}

	// Create terminal with the claude command
	const terminal = vscode.window.createTerminal(`Claude /${command}`);
	if (wslEnabled) {
		terminal.sendText(`wsl -d ${wslDistro} ${nodePath} --no-warnings --enable-source-maps ${claudePath} ${args.join(' ')}`);
	} else {
		terminal.sendText(`claude ${args.join(' ')}`);
	}
	terminal.show();

	// Show info message
	vscode.window.showInformationMessage(
		`Executing /${command} command in terminal. Check the terminal output and return when ready.`,
		'OK'
	);

	// Send message to UI about terminal
	provider._postMessage({
		type: 'terminalOpened',
		data: `Executing /${command} command in terminal. Check the terminal output and return when ready.`,
	});
}
