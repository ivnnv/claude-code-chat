// Entry point for webview - imports SCSS and modular scripts
import './index.scss';
import './types/global';

// Import webview-only script files (no Node.js dependencies)
import * as uiWebview from './scripts/ui-webview';
import * as permissionsWebview from './scripts/permissions-webview';
import { escapeHtml } from './scripts/formatters';

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

    // Set VS Code API for webview modules
    uiWebview.setVsCodeApi(vscode);
    uiWebview.setMessageInput(messageInput);
    permissionsWebview.setVsCodeApi(vscode);

    // Initialize webview modules
    uiWebview.initialize();
    permissionsWebview.initialize();

    // Set up message handler
    setupMessageHandler();

    // Set up keyboard event handling for textarea
    setupKeyboardHandlers();


    // Expose core functions to global scope for HTML handlers
    Object.assign(window, {
        // Core messaging functions
        sendMessage: uiWebview.sendMessage,
        copyMessageContent: uiWebview.copyMessageContent,
        copyCodeBlock: uiWebview.copyCodeBlock,

        // File and image functions
        showFilePicker: uiWebview.showFilePicker,
        selectImage: uiWebview.selectImage,

        // Modal functions
        stopRequest: uiWebview.stopRequest,

        // Chat message functions
        addMessage: uiWebview.addMessage,

        // Utility functions
        escapeHtml: escapeHtml,
        shouldAutoScroll: uiWebview.shouldAutoScroll,
        scrollToBottomIfNeeded: uiWebview.scrollToBottomIfNeeded,
        sendStats: uiWebview.sendStats,

        // Permission functions
        isPermissionError: permissionsWebview.isPermissionError,
        enableYoloMode: permissionsWebview.enableYoloMode,
        respondToPermission: permissionsWebview.respondToPermission,
        addPermission: permissionsWebview.addPermission,
        removePermission: permissionsWebview.removePermission,
        toggleCommandInput: permissionsWebview.toggleCommandInput,
        showAddPermissionForm: permissionsWebview.showAddPermissionForm,
        hideAddPermissionForm: permissionsWebview.hideAddPermissionForm,

        // Settings modal functions - placeholder for now
        showSettingsModal: () => { /* Not implemented in webview */ },
        hideSettingsModal: () => { /* Not implemented in webview */ },
        updateSettings: () => { /* Not implemented in webview */ },
        updateYoloWarning: () => { /* Not implemented in webview */ },
        togglePlanMode: () => { /* Not implemented in webview */ },
        toggleThinkingMode: () => { /* Not implemented in webview */ },

        // MCP functions - placeholder for now
        showMCPModal: () => { /* Not implemented in webview */ },
        hideMCPModal: () => { /* Not implemented in webview */ },
        showAddServerForm: () => { /* Not implemented in webview */ },
        hideAddServerForm: () => { /* Not implemented in webview */ },
        updateServerForm: () => { /* Not implemented in webview */ },
        saveMCPServer: () => { /* Not implemented in webview */ },
        deleteMCPServer: () => { /* Not implemented in webview */ },
        addPopularServer: () => { /* Not implemented in webview */ },
        editMCPServer: () => { /* Not implemented in webview */ },

        // UI Core functions - placeholder for now
        showModelSelector: () => { /* Not implemented in webview */ },
        hideModelModal: () => { /* Not implemented in webview */ },
        showSlashCommandsModal: () => { /* Not implemented in webview */ },
        hideSlashCommandsModal: () => { /* Not implemented in webview */ },
        newSession: uiWebview.newSession,
        toggleConversationHistory: uiWebview.toggleConversationHistory,
        toggleResultExpansion: () => { /* Not implemented in webview */ },
        toggleExpand: () => { /* Not implemented in webview */ },
        toggleDiffExpansion: () => { /* Not implemented in webview */ },
        restoreToCommit: uiWebview.restoreToCommit,
        loadConversation: uiWebview.loadConversation,
        addToolResultMessage: uiWebview.addToolResultMessage,
        showRestoreContainer: () => { /* Not implemented in webview */ },
        showSessionInfo: uiWebview.showSessionInfo,
        hideThinkingIntensityModal: () => { /* Not implemented in webview */ },

        // Snippet functions
        usePromptSnippet: function() {},
        _deleteCustomSnippet: function() {},
        executeSlashCommand: function() {},

        // Status functions
        toggleStatusPopover: uiWebview.toggleStatusPopover,

        // Placeholder for extension functions
        _enableYoloMode: function() {
            permissionsWebview.enableYoloMode();
        },

        // WSL functions
        openWSLSettings: function() {},
        dismissWSLAlert: function() {}
    });


    // Initialize status indicator
    updateInputStatusIndicator();

    // Expose global state variables for modular functions to access
    Object.assign(window, {
        totalCost,
        totalTokensInput,
        totalTokensOutput,
        lastRequestCost,
        lastRequestTokens,
        currentStatus,
        currentEditorContext,
        isProcessing
    });

    // Request initial editor context
    vscode.postMessage({ type: 'getEditorContext' });
}


function setupMessageHandler() {
    window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
            case 'addMessage':
                uiWebview.addMessage(message.content, message.messageType);
                break;

            case 'toolUse':
                if (typeof message.data === 'object') {
                    uiWebview.addToolUseMessage(message.data);
                    // File info is handled by the toolUse message display
                } else if (message.data && message.data.trim()) {
                    uiWebview.addMessage(message.data, 'tool');
                }
                break;

            case 'addToolUse':
                uiWebview.addToolUseMessage(message.data);
                break;

            case 'toolResult':
                uiWebview.addToolResultMessage(message.data);
                break;

            case 'editorContext':
                currentEditorContext = message.data;
                window.currentEditorContext = currentEditorContext;
                // Also update the chat messages module context
                uiWebview.setCurrentEditorContext(message.data);
                uiWebview.updateEditorContextDisplay(message.data);
                break;

            case 'userInput':
                if (message.data.trim()) {
                    uiWebview.addMessage(uiWebview.parseSimpleMarkdown(message.data), 'user');
                }
                break;

            case 'processingComplete':
                isProcessing = false;
                window.isProcessing = isProcessing;
                uiWebview.enableButtons();
                uiWebview.hideStopButton();

                // Processing completed
                break;

            case 'sessionCleared':
                // Clear any existing checkpoint since we're starting fresh
                currentCheckpoint = null;
                window.currentCheckpoint = null;
                // Clear all messages from UI
                uiWebview.clearMessages();
                uiWebview.addMessage('🆕 Started new session', 'system');
                break;

            case 'sessionLoading':
                // Clear any existing checkpoint when loading previous session
                currentCheckpoint = null;
                window.currentCheckpoint = null;
                // Clear all messages from UI
                uiWebview.clearMessages();
                uiWebview.addMessage('📝 Loaded last session', 'system');
                break;

            case 'configChanged':
            case 'settingsData':
                // Handle settings data updates
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
                    uiWebview.showSessionInfo(message.sessionId);
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
                    const filePathPattern = /^\\s*\\.\\.\\.*\\.(ts|js|json|py|css|scss|html|md)$/;
                    const trimmedData = displayData.trim();
                    if (!filePathPattern.test(trimmedData)) {
                        // This is actual Claude response text - use addMessage to ensure proper ID assignment
                        uiWebview.addMessage(displayData, 'claude');
                    }
                    // File paths are skipped - they'll appear in Changes diffs instead

                    // Auto-scroll if needed
                    const messagesDiv = document.getElementById('chatMessages');
                    if (messagesDiv) {
                        uiWebview.scrollToBottomIfNeeded(messagesDiv, true);
                    }
                }
                break;

            case 'loading':
                if (message.data) {
                    uiWebview.addMessage('🔄 Claude is working...', 'system');
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
                updateInputStatusIndicator();
                if (message.data && message.data.trim()) {
                    // Check if this is an install required error
                    if (message.data.includes('Install claude code first') ||
                        message.data.includes('command not found') ||
                        message.data.includes('ENOENT')) {
                        uiWebview.sendStats('Install required');
                    }
                    uiWebview.addMessage(message.data, 'error');
                }
                break;

            case 'thinking':
                if (message.data && message.data.trim()) {
                    uiWebview.addMessage('💭 Thinking...' + uiWebview.parseSimpleMarkdown(message.data), 'thinking');
                }
                break;

            case 'sessionInfo':
                if (message.data && message.data.sessionId) {
                    uiWebview.showSessionInfo(message.data.sessionId);
                }
                break;

            case 'sessionResumed':
                if (message.data && message.data.sessionId) {
                    uiWebview.showSessionInfo(message.data.sessionId);
                    uiWebview.addMessage(`📝 Resumed previous session\\n🆔 Session ID: ${message.data.sessionId}\\n💡 Your conversation history is preserved`, 'system');
                }
                break;

            case 'conversationStarted':
                if (message.data) {
                    const startMessage = `🚀 **Started conversation**\\n\\n📅 **${new Date().toLocaleString()}**\\n\\n💬 Ready to help with your coding tasks!`;
                    uiWebview.addMessage(startMessage, 'system');
                }
                break;

            case 'ready':
                isProcessing = false;
                currentStatus = 'ready';
                window.isProcessing = isProcessing;
                window.currentStatus = currentStatus;
                updateInputStatusIndicator();
                uiWebview.enableButtons();
                uiWebview.hideStopButton();
                break;

            case 'modelSelected':
                if (message.model) {
                    // Handle model selection
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
                uiWebview.newSession();
                break;

            case 'setProcessing':
                if (message.data && message.data.isProcessing !== undefined) {
                    isProcessing = message.data.isProcessing;
                    currentStatus = isProcessing ? 'processing' : 'ready';
                    window.isProcessing = isProcessing;
                    window.currentStatus = currentStatus;
                    updateInputStatusIndicator();
                    if (isProcessing) {
                        uiWebview.disableButtons();
                        uiWebview.showStopButton();
                    } else {
                        uiWebview.enableButtons();
                        uiWebview.hideStopButton();
                    }
                }
                break;

            case 'platformInfo':
                // Platform info - could be used for WSL detection
                break;

            case 'showHistory':
                uiWebview.toggleConversationHistory();
                break;

            case 'showSettings':
                // Settings modal not implemented in webview
                break;

            case 'toggleStatusInfo':
                uiWebview.toggleStatusPopover();
                break;

            case 'permissionsData':
                permissionsWebview.handlePermissionsData(message.data);
                break;

            case 'conversationList':
                uiWebview.displayConversationList(message.data);
                break;

            case 'conversationHistory':
                if (message.messages && Array.isArray(message.messages)) {
                    // Clear existing messages first
                    uiWebview.clearMessages();
                    // Add each message from history
                    message.messages.forEach((msg: any) => {
                        if (msg.type === 'user' && msg.content) {
                            uiWebview.addMessage(msg.content, 'user');
                        } else if (msg.type === 'claude' || msg.type === 'assistant') {
                            uiWebview.addMessage(msg.content, 'claude');
                        } else if (msg.type === 'tool' && msg.toolInfo) {
                            uiWebview.addToolUseMessage(msg);
                        } else if (msg.type === 'toolResult' && msg.data) {
                            uiWebview.addToolResultMessage(msg);
                        }
                    });
                }
                break;

            case 'restoreConversation':
                // Handle conversation restoration
                if (message.conversation) {
                    uiWebview.clearMessages();
                    // Process the conversation data
                    if (message.conversation.messages) {
                        message.conversation.messages.forEach((msg: any) => {
                            switch (msg.role || msg.type) {
                                case 'user':
                                    if (msg.content) {
                                        uiWebview.addMessage(msg.content, 'user');
                                    }
                                    break;
                                case 'assistant':
                                case 'claude':
                                    if (msg.content) {
                                        uiWebview.addMessage(msg.content, 'claude');
                                    }
                                    break;
                                case 'tool':
                                    if (msg.toolInfo) {
                                        uiWebview.addToolUseMessage(msg);
                                    }
                                    break;
                                case 'toolResult':
                                    if (msg.data) {
                                        uiWebview.addToolResultMessage(msg);
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
                    vscode.postMessage({
                        type: 'recreateWebview',
                        reason: 'jsHotReload',
                        timestamp: message.timestamp
                    });
                } else if (message.reloadType === 'css') {
                    reloadCSS();
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

function updateInputStatusIndicator() {
    // Simple status indicator update
    const statusElement = document.getElementById('statusIndicator');
    if (statusElement) {
        statusElement.textContent = currentStatus === 'processing' ? '🔄' : '✅';
    }
}

function reloadCSS() {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            link.setAttribute('href', href + '?t=' + Date.now());
        }
    });
}

function setupKeyboardHandlers(): void {
    if (!messageInput) {
        console.error('messageInput not found for keyboard handlers');
        return;
    }

    // Handle keyboard shortcuts
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // Enter alone = send message
            e.preventDefault();
            window.sendMessage();
        }
        // Shift+Enter = new line (default behavior)
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
    }, { passive: true });

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
    }, { passive: true });
}

