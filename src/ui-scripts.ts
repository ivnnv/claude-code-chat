// Entry point for webview - imports SCSS and modular scripts
import './index.scss';
import './types/global';

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
let currentStatus: 'ready' | 'processing' | 'error' = 'ready';
let currentCheckpoint: {sha: string, timestamp: string} | null = null;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI);
} else {
    initializeUI();
}

// Development mode indicator (removed console.log for production)


function initializeUI() {
    // JS reload detection
    console.log(`📦 JS reloaded: ${new Date().toLocaleTimeString()}`);

    // Get DOM elements
    messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;

    // Set VS Code API for all modules
    chatMessages.setVsCodeApi(vscode);
    chatMessages.setModuleReferences(uiCore, settingsModals);
    uiCore.setVsCodeApi(vscode);
    settingsModals.setVsCodeApi(vscode);
    mcpServers.setVsCodeApi(vscode);
    permissions.setVsCodeApi(vscode);

    // Set up message input handling
    uiCore.setupMessageInput();

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
        sendMessage: chatMessages.sendMessage,
        copyMessageContent: chatMessages.copyMessageContent,
        copyCodeBlock: chatMessages.copyCodeBlock,

        // File and image functions
        showFilePicker: uiCore.showFilePicker,
        selectImage: uiCore.selectImage,

        // Modal functions
        stopRequest: chatMessages.stopRequest,

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
        toggleStatusPopover: uiCore.toggleStatusPopover,

        // Placeholder for extension functions
        _enableYoloMode: function() {
            permissions.enableYoloMode();
        }
    });


    // Initialize status indicator
    uiCore.updateInputStatusIndicator();

    // Expose global state variables for modular functions to access
    Object.assign(window, {
        totalCost,
        totalTokensInput,
        totalTokensOutput,
        lastRequestCost,
        lastRequestTokens,
        currentStatus,
        currentEditorContext,
        isProcessing,
        uiCore,
        settingsModals
    });

    // Request initial editor context
    vscode.postMessage({ type: 'getEditorContext' });
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
                window.currentEditorContext = currentEditorContext;
                // Also update the chat messages module context
                chatMessages.setCurrentEditorContext(message.data);
                uiCore.updateEditorContextDisplay(message.data);
                break;

            case 'userInput':
                if (message.data.trim()) {
                    chatMessages.addMessage(chatMessages.parseSimpleMarkdown(message.data), 'user');
                }
                break;

            case 'processingComplete':
                isProcessing = false;
                window.isProcessing = isProcessing;
                uiCore.enableButtons();
                uiCore.hideStopButton();

                // Processing completed
                break;

            case 'sessionCleared':
                // Clear any existing checkpoint since we're starting fresh
                currentCheckpoint = null;
                window.currentCheckpoint = null;
                // Clear all messages from UI
                chatMessages.clearMessages();
                chatMessages.addMessage('🆕 Started new session', 'system');
                break;

            case 'sessionLoading':
                // Clear any existing checkpoint when loading previous session
                currentCheckpoint = null;
                window.currentCheckpoint = null;
                // Clear all messages from UI
                chatMessages.clearMessages();
                chatMessages.addMessage('📝 Loaded last session', 'system');
                break;

            case 'configChanged':
            case 'settingsData':
                settingsModals.handleSettingsData(message.data);
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
                    window.currentCheckpoint = currentCheckpoint;
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
                    window.lastRequestTokens = lastRequestTokens;
                }
                // Update token totals in real-time
                totalTokensInput = updatedTokensInput;
                totalTokensOutput = updatedTokensOutput;
                window.totalTokensInput = totalTokensInput;
                window.totalTokensOutput = totalTokensOutput;
                break;

            case 'updateTotals':
                // Calculate last request cost (difference from previous total)
                const newTotalCost = message.data.totalCost || 0;
                const newTotalTokensInput = message.data.totalTokensInput || 0;
                const newTotalTokensOutput = message.data.totalTokensOutput || 0;

                if (newTotalCost > totalCost) {
                    lastRequestCost = newTotalCost - totalCost;
                    window.lastRequestCost = lastRequestCost;
                }

                // Update local tracking variables
                if (newTotalCost > 0) {
                    totalCost = newTotalCost;
                    window.totalCost = totalCost;
                } // Only update if extension provides real cost
                totalTokensInput = newTotalTokensInput;
                totalTokensOutput = newTotalTokensOutput;
                window.totalTokensInput = totalTokensInput;
                window.totalTokensOutput = totalTokensOutput;
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
                window.currentStatus = currentStatus;
                uiCore.updateInputStatusIndicator();
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
                window.isProcessing = isProcessing;
                window.currentStatus = currentStatus;
                uiCore.updateInputStatusIndicator();
                uiCore.enableButtons();
                uiCore.hideStopButton();
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
                    window.isProcessing = isProcessing;
                    window.currentStatus = currentStatus;
                    uiCore.updateInputStatusIndicator();
                    if (isProcessing) {
                        uiCore.disableButtons();
                        uiCore.showStopButton();
                    } else {
                        uiCore.enableButtons();
                        uiCore.hideStopButton();
                    }
                }
                break;

            case 'platformInfo':
                // Platform info - could be used for WSL detection
                break;

            case 'showHistory':
                uiCore.toggleConversationHistory();
                break;

            case 'showSettings':
                settingsModals.showSettingsModal();
                break;

            case 'toggleStatusInfo':
                uiCore.toggleStatusPopover();
                break;

            case 'permissionsData':
                permissions.handlePermissionsData(message.data);
                break;

            case 'conversationList':
                uiCore.displayConversationList(message.data);
                break;

            case 'conversationHistory':
                if (message.messages && Array.isArray(message.messages)) {
                    // Clear existing messages first
                    chatMessages.clearMessages();
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
                    chatMessages.clearMessages();
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

            case 'hotReload':
                // Handle hot reload - for JS changes, request webview recreation; for CSS, just refresh CSS
                if (message.reloadType === 'full') {
                    console.log('📦 JS modified, reloading webview');
                    vscode.postMessage({
                        type: 'recreateWebview',
                        reason: 'jsHotReload',
                        timestamp: message.timestamp
                    });
                } else if (message.reloadType === 'css') {
                    console.log('🎨 CSS modified, reloading styles');
                    uiCore.reloadCSS();
                } else {
                    vscode.postMessage({
                        type: 'recreateWebview',
                        reason: 'unknownHotReload',
                        timestamp: message.timestamp
                    });
                }
                break;

            default:
                break;
        }
    });
}
