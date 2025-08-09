// Entry point for webview - imports SCSS and modular scripts
import './index.scss';
import './types/global';

// Import webview-only script files (no Node.js dependencies)
import * as uiWebview from './scripts/ui-webview';
import * as uiWebviewCore from './scripts/ui-webview-core';
import * as permissionsWebview from './scripts/permissions-webview';
import * as settingsWebview from './scripts/settings-webview';
import * as mcpWebview from './scripts/mcp-webview';
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
    uiWebviewCore.setVsCodeApi(vscode);
    uiWebviewCore.setMessageInput(messageInput);
    uiWebviewCore.setModuleReferences(uiWebviewCore, settingsWebview);
    permissionsWebview.setVsCodeApi(vscode);
    settingsWebview.setVsCodeApi(vscode);
    mcpWebview.setVsCodeApi(vscode);

    // Initialize webview modules
    uiWebview.initialize();
    uiWebviewCore.initialize();
    permissionsWebview.initialize();
    settingsWebview.initialize();
    mcpWebview.initialize();

    // Set up message handler
    setupMessageHandler();

    // Set up keyboard event handling for textarea
    setupKeyboardHandlers();

    // Set up event listeners for buttons to avoid CSP violations
    setupEventListeners();


    // Expose core functions to global scope for HTML handlers
    Object.assign(window, {
        // Core messaging functions
        sendMessage: uiWebviewCore.sendMessage,
        copyMessageContent: uiWebviewCore.copyMessageContent,
        copyCodeBlock: uiWebviewCore.copyCodeBlock,

        // File and image functions
        showFilePicker: uiWebviewCore.showFilePicker,
        selectImage: uiWebviewCore.selectImage,

        // Modal functions
        stopRequest: uiWebviewCore.stopRequest,

        // Chat message functions
        addMessage: uiWebviewCore.addMessage,

        // Utility functions
        escapeHtml: escapeHtml,
        shouldAutoScroll: uiWebviewCore.shouldAutoScroll,
        scrollToBottomIfNeeded: uiWebviewCore.scrollToBottomIfNeeded,
        sendStats: uiWebviewCore.sendStats,

        // Permission functions
        isPermissionError: permissionsWebview.isPermissionError,
        enableYoloMode: permissionsWebview.enableYoloMode,
        respondToPermission: permissionsWebview.respondToPermission,
        addPermission: permissionsWebview.addPermission,
        removePermission: permissionsWebview.removePermission,
        toggleCommandInput: permissionsWebview.toggleCommandInput,
        showAddPermissionForm: permissionsWebview.showAddPermissionForm,
        hideAddPermissionForm: permissionsWebview.hideAddPermissionForm,

        // Settings modal functions
        showSettingsModal: settingsWebview.showSettingsModal,
        hideSettingsModal: settingsWebview.hideSettingsModal,
        updateSettings: settingsWebview.updateSettings,
        updateYoloWarning: settingsWebview.updateYoloWarning,
        togglePlanMode: settingsWebview.togglePlanMode,
        toggleThinkingMode: settingsWebview.toggleThinkingMode,

        // MCP functions
        showMCPModal: mcpWebview.showMCPModal,
        hideMCPModal: mcpWebview.hideMCPModal,
        showAddServerForm: mcpWebview.showAddServerForm,
        hideAddServerForm: mcpWebview.hideAddServerForm,
        updateServerForm: mcpWebview.updateServerForm,
        saveMCPServer: mcpWebview.saveMCPServer,
        deleteMCPServer: mcpWebview.deleteMCPServer,
        addPopularServer: mcpWebview.addPopularServer,
        editMCPServer: () => { /* Edit MCP server function not implemented yet */ },

        // UI Core functions
        showModelSelector: uiWebviewCore.showModelSelector,
        hideModelModal: uiWebviewCore.hideModelModal,
        showSlashCommandsModal: uiWebviewCore.showSlashCommandsModal,
        hideSlashCommandsModal: uiWebviewCore.hideSlashCommandsModal,
        newSession: uiWebviewCore.newSession,
        toggleConversationHistory: uiWebviewCore.toggleConversationHistory,
        toggleResultExpansion: uiWebviewCore.toggleResultExpansion,
        toggleExpand: uiWebviewCore.toggleExpand,
        toggleDiffExpansion: uiWebviewCore.toggleDiffExpansion,
        restoreToCommit: uiWebviewCore.restoreToCommit,
        loadConversation: uiWebviewCore.loadConversation,
        addToolResultMessage: uiWebviewCore.addToolResultMessage,
        showRestoreContainer: uiWebviewCore.showRestoreContainer,
        showSessionInfo: uiWebviewCore.showSessionInfo,
        hideThinkingIntensityModal: settingsWebview.hideThinkingIntensityModal,
        hideSessionInfo: uiWebviewCore.hideSessionInfo,
        _copySessionId: uiWebviewCore._copySessionId,

        // Snippet functions
        usePromptSnippet: settingsWebview.usePromptSnippet,
        _deleteCustomSnippet: settingsWebview.deleteCustomSnippet,
        executeSlashCommand: settingsWebview.executeSlashCommand,

        // Status functions
        toggleStatusPopover: uiWebviewCore.toggleStatusPopover,

        // Placeholder for extension functions
        _enableYoloMode: function() {
            permissionsWebview.enableYoloMode();
        },

        // WSL functions
        openWSLSettings: settingsWebview.openWSLSettings,
        dismissWSLAlert: settingsWebview.dismissWSLAlert,

        // Additional functions needed by event listeners
        filterSlashCommands: settingsWebview.filterSlashCommands,
        selectModel: settingsWebview.selectModel,
        updateThinkingIntensityDisplay: settingsWebview.updateThinkingIntensityDisplay,
        confirmThinkingIntensity: settingsWebview.confirmThinkingIntensity,
        openModelTerminal: settingsWebview.openModelTerminal,
        setThinkingIntensityValue: settingsWebview.setThinkingIntensityValue,
        showAddSnippetForm: settingsWebview.showAddSnippetForm,
        saveCustomSnippet: settingsWebview.saveCustomSnippet,
        hideAddSnippetForm: settingsWebview.hideAddSnippetForm,
        handleCustomCommandKeydown: settingsWebview.handleCustomCommandKeydown
    });


    // Initialize status indicator
    uiWebviewCore.updateInputStatusIndicator();

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
                uiWebviewCore.addMessage(message.content, message.messageType);
                break;

            case 'toolUse':
                if (typeof message.data === 'object') {
                    uiWebviewCore.addToolUseMessage(message.data);
                    // File info is handled by the toolUse message display
                } else if (message.data && message.data.trim()) {
                    uiWebviewCore.addMessage(message.data, 'tool');
                }
                break;

            case 'addToolUse':
                uiWebviewCore.addToolUseMessage(message.data);
                break;

            case 'toolResult':
                uiWebviewCore.addToolResultMessage(message.data);
                break;

            case 'editorContext':
                currentEditorContext = message.data;
                window.currentEditorContext = currentEditorContext;
                // Also update the chat messages module context
                uiWebviewCore.setCurrentEditorContext(message.data);
                uiWebviewCore.updateEditorContextDisplay(message.data);
                break;

            case 'userInput':
                if (message.data.trim()) {
                    uiWebviewCore.addMessage(uiWebviewCore.parseSimpleMarkdown(message.data), 'user');
                }
                break;

            case 'processingComplete':
                isProcessing = false;
                window.isProcessing = isProcessing;
                uiWebviewCore.enableButtons();
                uiWebviewCore.hideStopButton();

                // Processing completed
                break;

            case 'sessionCleared':
                // Clear any existing checkpoint since we're starting fresh
                currentCheckpoint = null;
                window.currentCheckpoint = null;
                // Clear all messages from UI
                uiWebviewCore.clearMessages();
                uiWebviewCore.addMessage('🆕 Started new session', 'system');
                break;

            case 'sessionLoading':
                // Clear any existing checkpoint when loading previous session
                currentCheckpoint = null;
                window.currentCheckpoint = null;
                // Clear all messages from UI
                uiWebviewCore.clearMessages();
                uiWebviewCore.addMessage('📝 Loaded last session', 'system');
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
                    uiWebviewCore.showSessionInfo(message.sessionId);
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
                        uiWebviewCore.addMessage(displayData, 'claude');
                    }
                    // File paths are skipped - they'll appear in Changes diffs instead

                    // Auto-scroll if needed
                    const messagesDiv = document.getElementById('chatMessages');
                    if (messagesDiv) {
                        uiWebviewCore.scrollToBottomIfNeeded(messagesDiv, true);
                    }
                }
                break;

            case 'loading':
                if (message.data) {
                    uiWebviewCore.addMessage('🔄 Claude is working...', 'system');
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
                uiWebviewCore.updateInputStatusIndicator();
                if (message.data && message.data.trim()) {
                    // Check if this is an install required error
                    if (message.data.includes('Install claude code first') ||
                        message.data.includes('command not found') ||
                        message.data.includes('ENOENT')) {
                        uiWebviewCore.sendStats('Install required');
                    }
                    uiWebviewCore.addMessage(message.data, 'error');
                }
                break;

            case 'thinking':
                if (message.data && message.data.trim()) {
                    uiWebviewCore.addMessage('💭 Thinking...' + uiWebviewCore.parseSimpleMarkdown(message.data), 'thinking');
                }
                break;

            case 'sessionInfo':
                if (message.data && message.data.sessionId) {
                    uiWebviewCore.showSessionInfo(message.data.sessionId);
                }
                break;

            case 'sessionResumed':
                if (message.data && message.data.sessionId) {
                    uiWebviewCore.showSessionInfo(message.data.sessionId);
                    uiWebviewCore.addMessage(`📝 Resumed previous session\\n🆔 Session ID: ${message.data.sessionId}\\n💡 Your conversation history is preserved`, 'system');
                }
                break;

            case 'conversationStarted':
                if (message.data) {
                    const startMessage = `🚀 **Started conversation**\\n\\n📅 **${new Date().toLocaleString()}**\\n\\n💬 Ready to help with your coding tasks!`;
                    uiWebviewCore.addMessage(startMessage, 'system');
                }
                break;

            case 'ready':
                isProcessing = false;
                currentStatus = 'ready';
                window.isProcessing = isProcessing;
                window.currentStatus = currentStatus;
                uiWebviewCore.updateInputStatusIndicator();
                uiWebviewCore.enableButtons();
                uiWebviewCore.hideStopButton();
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
                uiWebviewCore.newSession();
                break;

            case 'setProcessing':
                if (message.data && message.data.isProcessing !== undefined) {
                    isProcessing = message.data.isProcessing;
                    currentStatus = isProcessing ? 'processing' : 'ready';
                    window.isProcessing = isProcessing;
                    window.currentStatus = currentStatus;
                    uiWebviewCore.updateInputStatusIndicator();
                    if (isProcessing) {
                        uiWebviewCore.disableButtons();
                        uiWebviewCore.showStopButton();
                    } else {
                        uiWebviewCore.enableButtons();
                        uiWebviewCore.hideStopButton();
                    }
                }
                break;

            case 'platformInfo':
                // Platform info - could be used for WSL detection
                break;

            case 'showHistory':
                uiWebviewCore.toggleConversationHistory();
                break;

            case 'showSettings':
                settingsWebview.showSettingsModal();
                break;

            case 'toggleStatusInfo':
                uiWebviewCore.toggleStatusPopover();
                break;

            case 'permissionsData':
                permissionsWebview.handlePermissionsData(message.data);
                break;

            case 'conversationList':
                uiWebviewCore.displayConversationList(message.data);
                break;

            case 'conversationHistory':
                if (message.messages && Array.isArray(message.messages)) {
                    // Clear existing messages first
                    uiWebviewCore.clearMessages();
                    // Add each message from history
                    message.messages.forEach((msg: any) => {
                        if (msg.type === 'user' && msg.content) {
                            uiWebviewCore.addMessage(msg.content, 'user');
                        } else if (msg.type === 'claude' || msg.type === 'assistant') {
                            uiWebviewCore.addMessage(msg.content, 'claude');
                        } else if (msg.type === 'tool' && msg.toolInfo) {
                            uiWebviewCore.addToolUseMessage(msg);
                        } else if (msg.type === 'toolResult' && msg.data) {
                            uiWebviewCore.addToolResultMessage(msg);
                        }
                    });
                }
                break;

            case 'restoreConversation':
                // Handle conversation restoration
                if (message.conversation) {
                    uiWebviewCore.clearMessages();
                    // Process the conversation data
                    if (message.conversation.messages) {
                        message.conversation.messages.forEach((msg: any) => {
                            switch (msg.role || msg.type) {
                                case 'user':
                                    if (msg.content) {
                                        uiWebviewCore.addMessage(msg.content, 'user');
                                    }
                                    break;
                                case 'assistant':
                                case 'claude':
                                    if (msg.content) {
                                        uiWebviewCore.addMessage(msg.content, 'claude');
                                    }
                                    break;
                                case 'tool':
                                    if (msg.toolInfo) {
                                        uiWebviewCore.addToolUseMessage(msg);
                                    }
                                    break;
                                case 'toolResult':
                                    if (msg.data) {
                                        uiWebviewCore.addToolResultMessage(msg);
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
                    uiWebviewCore.reloadCSS();
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

function setupEventListeners(): void {
    // Set up event listeners to replace inline onclick handlers for CSP compliance
    // Send button
    const sendButton = document.getElementById('sendButton');
    if (sendButton) {
        sendButton.addEventListener('click', () => window.sendMessage());
    }

    // Stop button
    const stopButton = document.getElementById('stopButton');
    if (stopButton) {
        stopButton.addEventListener('click', () => window.stopRequest());
    }

    // File picker button
    const filePickerBtn = document.getElementById('filePickerBtn');
    if (filePickerBtn) {
        filePickerBtn.addEventListener('click', () => window.showFilePicker());
    }

    // Image picker button
    const imageBtn = document.getElementById('imageBtn');
    if (imageBtn) {
        imageBtn.addEventListener('click', () => window.selectImage());
    }

    // New session button
    const newSessionBtn = document.getElementById('newSessionBtn');
    if (newSessionBtn) {
        newSessionBtn.addEventListener('click', () => window.newSession());
    }

    // History and Settings buttons are VS Code header actions, not HTML elements

    // MCP button
    const mcpBtn = document.getElementById('mcpBtn');
    if (mcpBtn) {
        mcpBtn.addEventListener('click', () => window.showMCPModal());
    }

    // Model selector button
    const modelSelectorBtn = document.getElementById('modelSelectorBtn');
    if (modelSelectorBtn) {
        modelSelectorBtn.addEventListener('click', () => window.showModelSelector());
    }

    // Slash commands button
    const slashCommandsBtn = document.getElementById('slashCommandsBtn');
    if (slashCommandsBtn) {
        slashCommandsBtn.addEventListener('click', () => window.showSlashCommandsModal());
    }

    // Status button
    const statusButton = document.getElementById('statusButton');
    if (statusButton) {
        statusButton.addEventListener('click', () => window.toggleStatusPopover());
    }

    // Close buttons for modals
    const closeButtons = document.querySelectorAll('.close-modal');
    closeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const modal = (e.target as HTMLElement).closest('.modal') as HTMLElement;
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Close buttons with specific modal targets
    const closeSettingsBtn = document.querySelector('.close-settings');
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => window.hideSettingsModal());
    }

    const closeMCPBtn = document.querySelector('.close-mcp');
    if (closeMCPBtn) {
        closeMCPBtn.addEventListener('click', () => window.hideMCPModal());
    }

    const closeModelBtn = document.querySelector('.close-model');
    if (closeModelBtn) {
        closeModelBtn.addEventListener('click', () => window.hideModelModal());
    }

    const closeSlashCommandsBtn = document.querySelector('.close-slash-commands');
    if (closeSlashCommandsBtn) {
        closeSlashCommandsBtn.addEventListener('click', () => window.hideSlashCommandsModal());
    }

    // Settings form elements
    const wslEnabledCheckbox = document.getElementById('wsl-enabled');
    if (wslEnabledCheckbox) {
        wslEnabledCheckbox.addEventListener('change', () => window.updateSettings());
    }

    const wslDistroInput = document.getElementById('wsl-distro');
    if (wslDistroInput) {
        wslDistroInput.addEventListener('change', () => window.updateSettings());
    }

    const wslNodePathInput = document.getElementById('wsl-node-path');
    if (wslNodePathInput) {
        wslNodePathInput.addEventListener('change', () => window.updateSettings());
    }

    const wslClaudePathInput = document.getElementById('wsl-claude-path');
    if (wslClaudePathInput) {
        wslClaudePathInput.addEventListener('change', () => window.updateSettings());
    }

    const yoloModeCheckbox = document.getElementById('yolo-mode');
    if (yoloModeCheckbox) {
        yoloModeCheckbox.addEventListener('change', () => window.updateSettings());
    }

    // MCP form elements
    const addServerBtn = document.getElementById('addServerBtn');
    if (addServerBtn) {
        addServerBtn.addEventListener('click', () => window.showAddServerForm());
    }

    const cancelServerBtn = document.getElementById('cancelServerBtn');
    if (cancelServerBtn) {
        cancelServerBtn.addEventListener('click', () => window.hideAddServerForm());
    }

    const saveServerBtn = document.getElementById('saveServerBtn');
    if (saveServerBtn) {
        saveServerBtn.addEventListener('click', () => window.saveMCPServer());
    }

    const serverTypeSelect = document.getElementById('serverType');
    if (serverTypeSelect) {
        serverTypeSelect.addEventListener('change', () => window.updateServerForm());
    }

    // Search inputs
    const slashCommandsSearchInput = document.getElementById('slashCommandsSearch');
    if (slashCommandsSearchInput) {
        slashCommandsSearchInput.addEventListener('input', () => window.filterSlashCommands());
    }

    // Plan mode and thinking mode switches
    const planModeSwitch = document.getElementById('planModeSwitch');
    if (planModeSwitch) {
        planModeSwitch.addEventListener('click', () => window.togglePlanMode());
    }

    const thinkingModeSwitch = document.getElementById('thinkingModeSwitch');
    if (thinkingModeSwitch) {
        thinkingModeSwitch.addEventListener('click', () => window.toggleThinkingMode());
    }

    // Model selection radio buttons
    const modelRadios = document.querySelectorAll('input[name="model"]');
    modelRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const selectedModel = (e.target as HTMLInputElement).value;
            window.selectModel(selectedModel);
        });
    });

    // Thinking intensity modal elements
    const thinkingIntensitySlider = document.getElementById('thinkingIntensitySlider');
    if (thinkingIntensitySlider) {
        thinkingIntensitySlider.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            window.updateThinkingIntensityDisplay(value);
        });
    }

    const confirmThinkingBtn = document.getElementById('confirmThinkingBtn');
    if (confirmThinkingBtn) {
        confirmThinkingBtn.addEventListener('click', () => window.confirmThinkingIntensity());
    }

    const cancelThinkingBtn = document.getElementById('cancelThinkingBtn');
    if (cancelThinkingBtn) {
        cancelThinkingBtn.addEventListener('click', () => window.hideThinkingIntensityModal());
    }

    // WSL alert buttons
    const enableWSLBtn = document.querySelector('[data-action="enableWSL"]');
    if (enableWSLBtn) {
        enableWSLBtn.addEventListener('click', () => window.openWSLSettings());
    }

    const dismissWSLBtn = document.querySelector('[data-action="dismissWSL"]');
    if (dismissWSLBtn) {
        dismissWSLBtn.addEventListener('click', () => window.dismissWSLAlert());
    }

    // Permission buttons
    const addPermissionBtn = document.getElementById('addPermissionBtn');
    if (addPermissionBtn) {
        addPermissionBtn.addEventListener('click', () => window.addPermission());
    }

    const showAddPermissionBtn = document.getElementById('showAddPermissionBtn');
    if (showAddPermissionBtn) {
        showAddPermissionBtn.addEventListener('click', () => window.showAddPermissionForm());
    }

    const addPermissionTool = document.getElementById('addPermissionTool');
    if (addPermissionTool) {
        addPermissionTool.addEventListener('change', () => window.toggleCommandInput());
    }

    // Popular server buttons
    const popularServerItems = document.querySelectorAll('.popular-server-item');
    popularServerItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            // Map each popular server to its configuration
            const servers = [
                { name: 'context7', config: { type: 'http', url: 'https://context7.liam.sh/mcp' } },
                { name: 'sequential-thinking', config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] } },
                { name: 'memory', config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } },
                { name: 'puppeteer', config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] } },
                { name: 'fetch', config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] } },
                { name: 'filesystem', config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } }
            ];
            if (servers[index]) {
                window.addPopularServer(servers[index].name, servers[index].config);
            }
        });
    });

    // Model selection items
    const modelItems = document.querySelectorAll('.tool-item[data-model]');
    modelItems.forEach(item => {
        item.addEventListener('click', () => {
            const model = item.getAttribute('data-model');
            if (model) {
                window.selectModel(model);
            }
        });
    });

    // Configure model terminal button
    const configureModelBtn = document.querySelector('.configure-button');
    if (configureModelBtn) {
        configureModelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.openModelTerminal();
        });
    }

    // Thinking intensity slider labels
    for (let i = 0; i <= 3; i++) {
        const label = document.getElementById(`thinking-label-${i}`);
        if (label) {
            label.addEventListener('click', () => window.setThinkingIntensityValue(i));
        }
    }

    // Slash command prompt snippets
    const promptSnippets = document.querySelectorAll('.prompt-snippet-item');
    promptSnippets.forEach(item => {
        item.addEventListener('click', () => {
            const snippetType = item.getAttribute('data-snippet') ||
                              item.getAttribute('onclick')?.match(/usePromptSnippet\('(.+?)'\)/)?.[1];
            if (snippetType) {
                window.usePromptSnippet(snippetType);
            }
        });
    });

    // Add snippet form buttons
    const showAddSnippetBtn = document.querySelector('.add-snippet-item');
    if (showAddSnippetBtn) {
        showAddSnippetBtn.addEventListener('click', () => window.showAddSnippetForm());
    }

    const saveSnippetBtn = document.querySelector('[data-action="saveSnippet"]');
    if (saveSnippetBtn) {
        saveSnippetBtn.addEventListener('click', () => window.saveCustomSnippet());
    }

    const cancelSnippetBtn = document.querySelector('[data-action="cancelSnippet"]');
    if (cancelSnippetBtn) {
        cancelSnippetBtn.addEventListener('click', () => window.hideAddSnippetForm());
    }

    // Slash commands
    const slashCommandItems = document.querySelectorAll('.slash-command-item:not(.prompt-snippet-item):not(.add-snippet-item)');
    slashCommandItems.forEach(item => {
        item.addEventListener('click', () => {
            const command = item.getAttribute('data-command') ||
                          item.getAttribute('onclick')?.match(/executeSlashCommand\('(.+?)'\)/)?.[1];
            if (command) {
                window.executeSlashCommand(command);
            }
        });
    });

    // Custom command input
    const customCommandInput = document.querySelector('.command-input-wrapper input');
    if (customCommandInput) {
        customCommandInput.addEventListener('keydown', (event) => window.handleCustomCommandKeydown(event as KeyboardEvent));
        customCommandInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // History close button
    const historyCloseBtn = document.querySelector('[data-action="closeHistory"]');
    if (historyCloseBtn) {
        historyCloseBtn.addEventListener('click', () => window.toggleConversationHistory());
    }

    // Dynamically generated elements (using event delegation)
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Restore buttons
        if (target.classList.contains('diff-restore-btn')) {
            const sha = target.getAttribute('data-sha');
            if (sha) {
                window.restoreToCommit(sha);
            }
        }

        // Copy message buttons
        else if (target.classList.contains('copy-message-btn')) {
            const messageId = target.getAttribute('data-message-id');
            if (messageId) {
                window.copyMessageContent(messageId);
            }
        }

        // YOLO mode buttons
        else if (target.classList.contains('yolo-btn')) {
            window._enableYoloMode();
        }

        // Conversation items
        else if (target.classList.contains('conversation-item') || target.closest('.conversation-item')) {
            const conversationItem = target.closest('.conversation-item') as HTMLElement;
            if (conversationItem) {
                const filename = conversationItem.getAttribute('data-filename');
                if (filename) {
                    window.loadConversation(filename);
                }
            }
        }

        // Session info buttons
        else if (target.classList.contains('session-close-btn')) {
            window.hideSessionInfo();
        }
        else if (target.classList.contains('session-copy-btn')) {
            const sessionId = target.getAttribute('data-session-id');
            if (sessionId) {
                window._copySessionId(sessionId);
            }
        }

        // Snippet buttons
        else if (target.classList.contains('use-snippet-btn')) {
            const snippetId = target.getAttribute('data-snippet-id');
            if (snippetId) {
                window.usePromptSnippet(snippetId);
            }
        }
        else if (target.classList.contains('delete-snippet-btn')) {
            const snippetId = target.getAttribute('data-snippet-id');
            if (snippetId) {
                window._deleteCustomSnippet(snippetId);
            }
        }

        // Context clear button
        else if (target.classList.contains('context-clear')) {
            window.clearEditorContext();
        }
    });
}

