// Global type definitions for the webview

export interface GlobalState {
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  lastRequestCost: number;
  lastRequestTokens: number;
  currentStatus: 'ready' | 'processing' | 'error';
  currentEditorContext: any;
  isProcessing: boolean;
  currentCheckpoint: { sha: string; timestamp: string } | null;
  lastPathToolMessage?: HTMLElement;
}

// Extend the Window interface
declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window extends GlobalState {
    // Module references
    uiWebview: typeof import('../scripts/ui-webview');
    permissionsWebview: typeof import('../scripts/permissions-webview');

    // Functions exposed globally for HTML onclick handlers
    sendMessage(): void;
    stopRequest(): void;
    copyMessageContent(messageDiv: HTMLElement): void;
    copyCodeBlock(codeId: string): void;
    showFilePicker(): void;
    selectImage(): void;
    addMessage(content: string, type?: string): void;
    escapeHtml(text: string): string;
    shouldAutoScroll(messagesDiv: HTMLElement): boolean;
    scrollToBottomIfNeeded(messagesDiv: HTMLElement, shouldScroll?: boolean | null): void;
    sendStats(eventName: string): void;
    isPermissionError(content: string): boolean;
    enableYoloMode(): void;
    respondToPermission(command: string, allow: boolean): void;
    addPermission(command: string): void;
    removePermission(command: string): void;
    toggleCommandInput(): void;
    showAddPermissionForm(): void;
    hideAddPermissionForm(): void;
    showSettingsModal(): void;
    hideSettingsModal(): void;
    updateSettings(): void;
    updateYoloWarning(): void;
    togglePlanMode(): void;
    toggleThinkingMode(): void;
    showMCPModal(): void;
    hideMCPModal(): void;
    showAddServerForm(): void;
    hideAddServerForm(): void;
    updateServerForm(): void;
    saveMCPServer(): void;
    deleteMCPServer(serverId: string): void;
    addPopularServer(serverType: string): void;
    editMCPServer(serverId: string): void;
    showModelSelector(): void;
    hideModelModal(): void;
    showSlashCommandsModal(): void;
    hideSlashCommandsModal(): void;
    newSession(): void;
    toggleConversationHistory(): void;
    toggleResultExpansion(resultId: string): void;
    toggleExpand(button: HTMLElement): void;
    toggleDiffExpansion(diffId: string): void;
    restoreToCommit(commitSha: string): void;
    loadConversation(filename: string): void;
    addToolResultMessage(data: any): void;
    showRestoreContainer(data: any): void;
    showSessionInfo(sessionId: string): void;
    hideThinkingIntensityModal(): void;
    usePromptSnippet(snippetType: string): void;
    _deleteCustomSnippet(snippetId: string): void;
    executeSlashCommand(): void;
    toggleStatusPopover(): void;
    _enableYoloMode(): void;
  }
}
