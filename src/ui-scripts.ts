// Entry point for webview - imports SCSS and modular scripts
import './index.scss';

// Import all modular script files
import * as chatMessages from './scripts/chat-messages';
import * as mcpServers from './scripts/mcp-servers';
import * as permissions from './scripts/permissions';
import * as settingsModals from './scripts/settings-modals';
import * as uiCore from './scripts/ui-core';

// Initialize and expose functions to global scope for HTML onclick handlers
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

// Core state variables
let messageInput: HTMLTextAreaElement;
let isProcessing = false;
let currentEditorContext: any = null;

// Global totals tracking
let totalCost = 0;
let totalTokensInput = 0;
let totalTokensOutput = 0;
let _requestCount = 0;
let lastRequestCost = 0;
let lastRequestTokens = 0;
let currentStatus = 'ready'; // 'ready', 'processing', 'error'
let currentCheckpoint: {sha: string, timestamp: string} | null = null;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI);
} else {
    initializeUI();
}

function initializeUI() {
    // Get DOM elements
    messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;

    // Set VS Code API for all modules
    chatMessages.setVsCodeApi(vscode);
    uiCore.setVsCodeApi(vscode);
    settingsModals.setVsCodeApi(vscode);
    mcpServers.setVsCodeApi(vscode);
    permissions.setVsCodeApi(vscode);

    // Set up message input handling
    setupMessageInput();

    // Initialize core UI functionality
    uiCore.initialize();

    // Initialize other modules
    settingsModals.initialize();
    mcpServers.initialize();
    permissions.initialize();

    // Set up message handler
    setupMessageHandler();

    // Expose core functions to global scope for HTML handlers
    Object.assign(window, {
        // Core messaging functions
        sendMessage,
        copyMessageContent: chatMessages.copyMessageContent,
        copyCodeBlock: chatMessages.copyCodeBlock,

        // File and image functions
        showFilePicker: uiCore.showFilePicker,
        selectImage: uiCore.selectImage,

        // Modal functions
        stopRequest,

        // Chat message functions
        addMessage: chatMessages.addMessage,

        // Utility functions
        escapeHtml: chatMessages.escapeHtml,
        shouldAutoScroll: chatMessages.shouldAutoScroll,
        scrollToBottomIfNeeded: chatMessages.scrollToBottomIfNeeded,
        sendStats: chatMessages.sendStats,

        // Permission functions
        isPermissionError: permissions.isPermissionError,
        enableYoloMode: permissions.enableYoloMode,
        respondToPermission: permissions.respondToPermission,
        addPermission: permissions.addPermission,
        removePermission: permissions.removePermission,
        toggleCommandInput: permissions.toggleCommandInput,
        showAddPermissionForm: permissions.showAddPermissionForm,
        hideAddPermissionForm: permissions.hideAddPermissionForm,

        // Settings modal functions
        showSettingsModal: settingsModals.showSettingsModal,
        hideSettingsModal: settingsModals.hideSettingsModal,
        updateSettings: settingsModals.updateSettings,
        updateYoloWarning: settingsModals.updateYoloWarning,
        togglePlanMode: settingsModals.togglePlanMode,
        toggleThinkingMode: settingsModals.toggleThinkingMode,

        // MCP functions
        showMCPModal: mcpServers.showMCPModal,
        hideMCPModal: mcpServers.hideMCPModal,
        showAddServerForm: mcpServers.showAddServerForm,
        hideAddServerForm: mcpServers.hideAddServerForm,
        updateServerForm: mcpServers.updateServerForm,
        saveMCPServer: mcpServers.saveMCPServer,
        deleteMCPServer: mcpServers.deleteMCPServer,
        addPopularServer: mcpServers.addPopularServer,
        editMCPServer: mcpServers.editMCPServer,

        // UI Core functions
        showModelSelector: uiCore.showModelSelector,
        hideModelModal: uiCore.hideModelModal,
        showSlashCommandsModal: uiCore.showSlashCommandsModal,
        hideSlashCommandsModal: uiCore.hideSlashCommandsModal,
        newSession: uiCore.newSession,
        toggleConversationHistory: uiCore.toggleConversationHistory,
        toggleResultExpansion: uiCore.toggleResultExpansion,
        toggleExpand: uiCore.toggleExpand,
        toggleDiffExpansion: uiCore.toggleDiffExpansion,
        restoreToCommit: uiCore.restoreToCommit,
        loadConversation: uiCore.loadConversation,
        addToolResultMessage: uiCore.addToolResultMessage,
        showRestoreContainer: uiCore.showRestoreContainer,
        showSessionInfo: uiCore.showSessionInfo,
        hideThinkingIntensityModal: settingsModals.hideThinkingIntensityModal,

        // Snippet functions
        usePromptSnippet: function() {},
        _deleteCustomSnippet: function() {},
        executeSlashCommand: function() {},

        // Status functions
        toggleStatusPopover,

        // Placeholder for extension functions
        _enableYoloMode: function() {
            permissions.enableYoloMode();
        }
    });


    // Initialize status indicator
    updateInputStatusIndicator();

    // Request initial editor context
    vscode.postMessage({ type: 'getEditorContext' });
}

function setupMessageInput() {
    if (!messageInput) {return;}

    // Handle enter key
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
    });

    // Save input text as user types (debounced)
    let saveInputTimeout: NodeJS.Timeout;
    messageInput.addEventListener('input', () => {
        clearTimeout(saveInputTimeout);
        saveInputTimeout = setTimeout(() => {
            vscode.postMessage({
                type: 'saveInputText',
                text: messageInput.value
            });
        }, 500); // Save after 500ms of no typing
    });
}

function setupMessageHandler() {
    window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
            case 'addMessage':
                chatMessages.addMessage(message.content, message.messageType);
                break;

            case 'toolUse':
                if (typeof message.data === 'object') {
                    chatMessages.addToolUseMessage(message.data);
                    // Check if this tool involves a file and add file info icon
                    if (message.data.rawInput && message.data.rawInput.file_path) {
                        // const filePath = message.data.rawInput.file_path;
                        // addFileInfoToLastMessage(filePath); // TODO: implement if needed
                    }
                } else if (message.data && message.data.trim()) {
                    chatMessages.addMessage(message.data, 'tool');
                }
                break;

            case 'addToolUse':
                chatMessages.addToolUseMessage(message.data);
                break;

            case 'toolResult':
                uiCore.addToolResultMessage(message.data);
                break;

            case 'editorContext':
                currentEditorContext = message.data;
                // Also update the chat messages module context
                chatMessages.setCurrentEditorContext(message.data);
                updateEditorContextDisplay(message.data);
                break;

            case 'userInput':
                if (message.data.trim()) {
                    chatMessages.addMessage(chatMessages.parseSimpleMarkdown(message.data), 'user');
                }
                break;

            case 'processingComplete':
                isProcessing = false;
                enableButtons();
                hideStopButton();

                // Processing completed
                break;

            case 'sessionCleared':
                // Clear any existing checkpoint since we're starting fresh
                currentCheckpoint = null;
                (window as any).currentCheckpoint = null;
                // Clear all messages from UI
                clearMessages();
                chatMessages.addMessage('🆕 Started new session', 'system');
                break;

            case 'sessionLoading':
                // Clear any existing checkpoint when loading previous session
                currentCheckpoint = null;
                (window as any).currentCheckpoint = null;
                // Clear all messages from UI
                clearMessages();
                chatMessages.addMessage('📝 Loaded last session', 'system');
                break;

            case 'configChanged':
            case 'settingsData':
                // Handle settings updates
                break;

            case 'showRestoreOption':
                // Check if sha is in message.data instead of message directly
                const sha = message.sha || (message.data && message.data.sha);
                const timestamp = message.timestamp || (message.data && message.data.timestamp);
                if (sha) {
                    // Update currentCheckpoint for Changes boxes
                    currentCheckpoint = {
                        sha: sha,
                        timestamp: timestamp || new Date().toISOString()
                    };
                    (window as any).currentCheckpoint = currentCheckpoint;
                    // No longer need to show a separate restore container
                    // The restore button will appear in diff headers
                }
                break;

            case 'sessionInfo':
                if (message.sessionId) {
                    uiCore.showSessionInfo(message.sessionId);
                }
                break;

            case 'updateTokens':
                // Calculate last request tokens (difference from previous total)
                const updatedTokensInput = message.data.totalTokensInput || 0;
                const updatedTokensOutput = message.data.totalTokensOutput || 0;
                const updatedTotalTokens = updatedTokensInput + updatedTokensOutput;
                const currentTotalTokens = totalTokensInput + totalTokensOutput;
                if (updatedTotalTokens > currentTotalTokens) {
                    lastRequestTokens = updatedTotalTokens - currentTotalTokens;
                }
                // Update token totals in real-time
                totalTokensInput = updatedTokensInput;
                totalTokensOutput = updatedTokensOutput;
                break;

            case 'updateTotals':
                // Calculate last request cost (difference from previous total)
                const newTotalCost = message.data.totalCost || 0;
                const newTotalTokensInput = message.data.totalTokensInput || 0;
                const newTotalTokensOutput = message.data.totalTokensOutput || 0;

                if (newTotalCost > totalCost) {
                    lastRequestCost = newTotalCost - totalCost;
                }

                // Update local tracking variables
                if (newTotalCost > 0) {totalCost = newTotalCost;} // Only update if extension provides real cost
                totalTokensInput = newTotalTokensInput;
                totalTokensOutput = newTotalTokensOutput;
                _requestCount = message.data.requestCount || 0;
                break;

            case 'restoreInputText':
                if (messageInput && message.data) {
                    messageInput.value = message.data;
                    // Auto-resize the textarea
                    messageInput.style.height = 'auto';
                    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
                }
                break;

            case 'output':
                if (message.data && message.data.trim()) {
                    let displayData = message.data;

                    // Check if this is a usage limit message with Unix timestamp
                    const usageLimitMatch = displayData.match(/Claude AI usage limit reached\\|(\\d+)/);
                    if (usageLimitMatch) {
                        const timestamp = parseInt(usageLimitMatch[1]);
                        const date = new Date(timestamp * 1000);
                        const readableDate = date.toLocaleString(
                            undefined,
                            {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true,
                                timeZoneName: 'short',
                                year: 'numeric'
                            }
                        );
                        displayData = displayData.replace(usageLimitMatch[0], `Claude AI usage limit reached: ${readableDate}`);
                    }

                    // Skip standalone file reference outputs (they'll be shown in tool diffs)
                    const filePathPattern = /^\s*\.\.\..*\.(ts|js|json|py|css|scss|html|md)$/;
                    const trimmedData = displayData.trim();
                    if (!filePathPattern.test(trimmedData)) {
                        // This is actual Claude response text - use addMessage to ensure proper ID assignment
                        chatMessages.addMessage(displayData, 'claude');
                    }
                    // File paths are skipped - they'll appear in Changes diffs instead

                    // Auto-scroll if needed
                    const messagesDiv = document.getElementById('chatMessages');
                    if (messagesDiv) {
                        chatMessages.scrollToBottomIfNeeded(messagesDiv, true);
                    }
                }
                break;

            case 'loading':
                if (message.data) {
                    // Create system message using the same approach as "Started new session"
                    chatMessages.addMessage('🔄 Claude is working...', 'system');
                }
                break;

            case 'clearLoading':
                // Remove the last loading message
                const messages = document.getElementById('chatMessages');
                if (messages && messages.children.length > 0) {
                    const lastMessage = messages.children[messages.children.length - 1];
                    if (lastMessage.classList.contains('system')) {
                        lastMessage.remove();
                    }
                }
                break;

            case 'error':
                currentStatus = 'error';
                updateInputStatusIndicator();
                if (message.data && message.data.trim()) {
                    // Check if this is an install required error
                    if (message.data.includes('Install claude code first') ||
                        message.data.includes('command not found') ||
                        message.data.includes('ENOENT')) {
                        chatMessages.sendStats('Install required');
                    }
                    chatMessages.addMessage(message.data, 'error');
                }
                break;

            case 'thinking':
                if (message.data && message.data.trim()) {
                    chatMessages.addMessage('💭 Thinking...' + chatMessages.parseSimpleMarkdown(message.data), 'thinking');
                }
                break;

            case 'sessionInfo':
                if (message.data && message.data.sessionId) {
                    uiCore.showSessionInfo(message.data.sessionId);
                }
                break;

            case 'sessionResumed':
                if (message.data && message.data.sessionId) {
                    uiCore.showSessionInfo(message.data.sessionId);
                    chatMessages.addMessage(`📝 Resumed previous session\n🆔 Session ID: ${message.data.sessionId}\n💡 Your conversation history is preserved`, 'system');
                }
                break;

            case 'conversationStarted':
                if (message.data) {
                    const startMessage = `🚀 **Started conversation**\n\n📅 **${new Date().toLocaleString()}**\n\n💬 Ready to help with your coding tasks!`;
                    chatMessages.addMessage(startMessage, 'system');
                }
                break;

            case 'ready':
                isProcessing = false;
                currentStatus = 'ready';
                updateInputStatusIndicator();
                enableButtons();
                hideStopButton();
                break;

            case 'modelSelected':
                if (message.model) {
                    uiCore.setCurrentModel(message.model);
                }
                break;

            case 'newSession':
                // Reset totals
                totalCost = 0;
                totalTokensInput = 0;
                totalTokensOutput = 0;
                _requestCount = 0;
                lastRequestCost = 0;
                lastRequestTokens = 0;
                uiCore.newSession();
                break;

            case 'setProcessing':
                if (message.data && message.data.isProcessing !== undefined) {
                    isProcessing = message.data.isProcessing;
                    currentStatus = isProcessing ? 'processing' : 'ready';
                    updateInputStatusIndicator();
                    if (isProcessing) {
                        disableButtons();
                        showStopButton();
                    } else {
                        enableButtons();
                        hideStopButton();
                    }
                }
                break;

            case 'platformInfo':
                // Platform info - could be used for WSL detection
                break;

            case 'showHistory':
                uiCore.toggleConversationHistory();
                break;

            case 'toggleStatusInfo':
                toggleStatusPopover();
                break;

            case 'conversationList':
                displayConversationList(message.data);
                break;

            case 'conversationHistory':
                if (message.messages && Array.isArray(message.messages)) {
                    // Clear existing messages first
                    clearMessages();
                    // Add each message from history
                    message.messages.forEach((msg: any) => {
                        if (msg.type === 'user' && msg.content) {
                            chatMessages.addMessage(msg.content, 'user');
                        } else if (msg.type === 'claude' || msg.type === 'assistant') {
                            chatMessages.addMessage(msg.content, 'claude');
                        } else if (msg.type === 'tool' && msg.toolInfo) {
                            chatMessages.addToolUseMessage(msg);
                        } else if (msg.type === 'toolResult' && msg.data) {
                            uiCore.addToolResultMessage(msg);
                        }
                    });
                }
                break;

            case 'restoreConversation':
                // Handle conversation restoration
                if (message.conversation) {
                    clearMessages();
                    // Process the conversation data
                    if (message.conversation.messages) {
                        message.conversation.messages.forEach((msg: any) => {
                            switch (msg.role || msg.type) {
                                case 'user':
                                    if (msg.content) {
                                        chatMessages.addMessage(msg.content, 'user');
                                    }
                                    break;
                                case 'assistant':
                                case 'claude':
                                    if (msg.content) {
                                        chatMessages.addMessage(msg.content, 'claude');
                                    }
                                    break;
                                case 'tool':
                                    if (msg.toolInfo) {
                                        chatMessages.addToolUseMessage(msg);
                                    }
                                    break;
                                case 'toolResult':
                                    if (msg.data) {
                                        uiCore.addToolResultMessage(msg);
                                    }
                                    break;
                            }
                        });
                    }
                }
                break;

            default:
                break;
        }
    });
}

function sendMessage(): void {
    if (!messageInput || isProcessing) {return;}

    const text = messageInput.value.trim();
    if (!text) {return;}

    // Enhance message with editor context if available
    let enhancedText = text;
    const contextInfo = chatMessages.getEditorContextInfo();
    if (contextInfo) {
        enhancedText = contextInfo + '\n\n' + text;
    }

    // Don't add user message here - let extension handle it via userInput message

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Set processing state
    isProcessing = true;
    disableButtons();
    showStopButton();

    chatMessages.sendStats('Send message');

    // Send to VS Code
    vscode.postMessage({
        type: 'sendMessage',
        text: enhancedText,
        planMode: settingsModals.getPlanModeEnabled(),
        thinkingMode: settingsModals.getThinkingModeEnabled(),
        editorContext: currentEditorContext
    });
}

function stopRequest(): void {
    vscode.postMessage({ type: 'stopRequest' });
    isProcessing = false;
    enableButtons();
    hideStopButton();
}

function clearMessages(): void {
    const messagesDiv = document.getElementById('chatMessages');
    if (messagesDiv) {
        messagesDiv.innerHTML = '';
    }
}

function displayConversationList(conversations: any[]): void {
    const listDiv = document.getElementById('conversationList');
    if (!listDiv) {return;}
    listDiv.innerHTML = '';
    if (conversations.length === 0) {
        listDiv.innerHTML = '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No conversations found</p>';
        return;
    }
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.onclick = () => loadConversation(conv.filename);
        const date = new Date(conv.startTime).toLocaleDateString();
        const time = new Date(conv.startTime).toLocaleTimeString();
        item.innerHTML = `
            <div class="conversation-title">${conv.firstUserMessage.substring(0, 60)}${conv.firstUserMessage.length > 60 ? '...' : ''}</div>
            <div class="conversation-meta">${date} at ${time} • ${conv.messageCount} messages • $${conv.totalCost.toFixed(2)}</div>
            <div class="conversation-preview">Last: ${conv.lastUserMessage.substring(0, 80)}${conv.lastUserMessage.length > 80 ? '...' : ''}</div>
        `;
        listDiv.appendChild(item);
    });
}

function loadConversation(filename: string): void {
    vscode.postMessage({
        type: 'loadConversation',
        filename: filename
    });
    // Hide conversation history and show chat
    uiCore.toggleConversationHistory();
}

function toggleStatusPopover(): void {
    const statusPopover = document.getElementById('statusPopover');
    if (!statusPopover) {return;}

    if (statusPopover.style.display === 'none' || !statusPopover.style.display) {
        // Show popover with current status info
        updateStatusPopoverContent();
        statusPopover.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusPopover.style.display = 'none';
        }, 5000);
    } else {
        statusPopover.style.display = 'none';
    }
}

function updateStatusPopoverContent(): void {
    const statusPopover = document.getElementById('statusPopover');
    if (!statusPopover) {return;}

    const totalTokens = totalTokensInput + totalTokensOutput;
    const statusText = currentStatus === 'ready' ? 'Ready' : currentStatus === 'processing' ? 'Processing' : 'Error';

    // Format costs with 2 decimals and pad to align with total tokens
    const lastCostStr = lastRequestCost > 0 ? lastRequestCost.toFixed(2) : '0.00';
    const totalCostStr = totalCost > 0 ? totalCost.toFixed(2) : '0.00';
    const totalTokensStr = totalTokens.toLocaleString();

    statusPopover.innerHTML = `
        <div class="status-popover-content">
            <table class="status-table">
                <tr>
                    <td>${statusText}:</td>
                    <td>$${lastCostStr}</td>
                    <td>${lastRequestTokens.toLocaleString()} tk</td>
                </tr>
                <tr>
                    <td>Session total:</td>
                    <td>$${totalCostStr}</td>
                    <td>${totalTokensStr} tk</td>
                </tr>
            </table>
        </div>
    `;
}

function updateEditorContextDisplay(contextData: any): void {
    const editorContextLine = document.getElementById('editorContextLine');
    if (!editorContextLine) {
        return;
    }

    currentEditorContext = contextData;

    if (!contextData || !contextData.hasActiveFile) {
        editorContextLine.style.display = 'none';
        return;
    }

    // Build simple context line
    let contextText = 'in ' + contextData.fileName;

    if (contextData.selection && contextData.selectedText) {
        // VS Code already provides 1-based line numbers
        const startLine = contextData.selection.start.line;
        const endLine = contextData.selection.end.line;
        contextText += ':' + startLine + '-' + endLine;
    } else if (contextData.cursorPosition) {
        // VS Code already provides 1-based line numbers
        const cursorLine = contextData.cursorPosition.line;
        contextText += ':' + cursorLine;
    }

    editorContextLine.textContent = contextText;
    editorContextLine.style.display = 'block';
}

function disableButtons(): void {
    const buttons = document.querySelectorAll('button:not(#stopBtn)');
    buttons.forEach(btn => {
        (btn as HTMLButtonElement).disabled = true;
    });
}

function enableButtons(): void {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        (btn as HTMLButtonElement).disabled = false;
    });
}

function showStopButton(): void {
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.style.display = 'flex';
    }
}

function hideStopButton(): void {
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.style.display = 'none';
    }
}

function updateInputStatusIndicator(): void {
    const inputIndicator = document.getElementById('inputStatusIndicator');
    if (!inputIndicator) {return;}

    // Remove all status classes
    inputIndicator.classList.remove('ready', 'processing', 'error');

    // Add current status class
    inputIndicator.classList.add(currentStatus);
}
