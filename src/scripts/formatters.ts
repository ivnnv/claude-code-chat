// Formatters - Utility functions for formatting UI elements and tool outputs

export function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

export function formatFilePath(filePath: string): string {
	const parts = filePath.split('/');
	if (parts.length > 3) {
		return '.../' + parts.slice(-2).join('/');
	}
	return filePath;
}

export function formatSingleEdit(edit: any, _editNumber: number): string {
	let result = '<div class="single-edit">';
	// Remove edit number since context is now in user message header
	// Create diff view for this single edit
	const oldLines = edit.old_string.split('\n');
	const newLines = edit.new_string.split('\n');
	// Show removed lines
	for (const line of oldLines) {
		result += '<div class="diff-line removed">- ' + escapeHtml(line) + '</div>';
	}
	// Show added lines
	for (const line of newLines) {
		result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
	}
	result += '</div>';
	return result;
}

export function formatToolInputUI(input: any): string {
	if (!input || typeof input !== 'object') {
		const str = String(input);
		if (str.length > 100) {
			const truncateAt = 97;
			const truncated = str.substring(0, truncateAt);
			const inputId = 'input_' + Math.random().toString(36).substr(2, 9);
			return '<span id="' + inputId + '_visible">' + escapeHtml(truncated) + '</span>' +
				   '<span id="' + inputId + '_ellipsis">...</span>' +
				   '<span id="' + inputId + '_hidden" style="display: none;">' + escapeHtml(str.substring(truncateAt)) + '</span>' +
				   '<div class="diff-expand-container">' +
				   '<button class="result-expand-btn" data-result-id="' + inputId + '" style="cursor: pointer;">Show more</button>' +
				   '</div>';
		}
		return str;
	}
	// Special handling for Read tool with file_path
	if (input.file_path && Object.keys(input).length === 1) {
		const formattedPath = formatFilePath(input.file_path);
		return '<div class="diff-file-path" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer;">' + formattedPath + '</div>';
	}
	let result = '';
	let isFirst = true;
	for (const [key, value] of Object.entries(input)) {
		// Skip internal parameters that don't need to be shown
		if (key === 'offset' || key === 'limit') {
			continue;
		}

		const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
		if (!isFirst) {result += '\n';}
		isFirst = false;
		// Special formatting for file_path in Read tool context
		if (key === 'file_path') {
			const formattedPath = formatFilePath(valueStr);
			result += '<div class="diff-file-path" data-file-path="' + escapeHtml(valueStr) + '" style="cursor: pointer;">' + formattedPath + '</div>';
		} else if (valueStr.length > 100) {
			const truncated = valueStr.substring(0, 97) + '...';
			const escapedValue = valueStr.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
			result += '<span class="expandable-item"><strong>' + key + ':</strong> ' + truncated + ' <span class="expand-btn" data-key="' + key + '" data-value="' + escapedValue + '" style="cursor: pointer;">expand</span></span>';
		} else {
			result += '<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

export function formatEditToolDiff(input: any): string {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}
	// Check if this is an Edit tool (has file_path, old_string, new_string)
	if (!input.file_path || !input.old_string || !input.new_string) {
		return formatToolInputUI(input);
	}
	// Format file path with better display
	const formattedPath = formatFilePath(input.file_path);
	// Create diff view
	const oldLines = input.old_string.split('\n');
	const newLines = input.new_string.split('\n');
	const allLines = [...oldLines.map((line: string) => ({type: 'removed', content: line})),
					 ...newLines.map((line: string) => ({type: 'added', content: line}))];
	const maxLines = 6;
	const shouldTruncate = allLines.length > maxLines;
	const visibleLines = shouldTruncate ? allLines.slice(0, maxLines) : allLines;
	const hiddenLines = shouldTruncate ? allLines.slice(maxLines) : [];

	let result = '<div class="diff-container">';

	// Create header with proper row structure and checkpoint support like monolithic version
	let changesRow = '<div class="diff-changes-row">';
	changesRow += '<span class="diff-changes-label">Changes:</span>';
	const currentCheckpoint = (window as any).currentCheckpoint;
	if (currentCheckpoint) {
		const timeAgo = new Date(currentCheckpoint.timestamp).toLocaleTimeString();
		changesRow += '<div class="diff-timestamp-group">';
		changesRow += '<span class="diff-timestamp">(' + timeAgo + ')</span>';
		changesRow += '<button class="diff-restore-btn" onclick="restoreToCommit(\'' + currentCheckpoint.sha + '\')" title="Restore checkpoint">↶</button>';
		changesRow += '</div>';
	}
	changesRow += '</div>';

	let filePathRow = '<div class="diff-filepath-row"><span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '">' + formattedPath + '</span></div>';

	result += '<div class="diff-header">' + changesRow + filePathRow + '</div>';

	// Create a unique ID for this diff
	const diffId = 'diff_' + Math.random().toString(36).substr(2, 9);
	// Show visible lines
	result += '<div id="' + diffId + '_visible">';
	for (const line of visibleLines) {
		const prefix = line.type === 'removed' ? '- ' : '+ ';
		const cssClass = line.type === 'removed' ? 'removed' : 'added';
		result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
	}
	result += '</div>';
	// Show hidden lines (initially hidden)
	if (shouldTruncate) {
		result += '<div id="' + diffId + '_hidden" style="display: none;">';
		for (const line of hiddenLines) {
			const prefix = line.type === 'removed' ? '- ' : '+ ';
			const cssClass = line.type === 'removed' ? 'removed' : 'added';
			result += '<div class="diff-line ' + cssClass + '">' + prefix + escapeHtml(line.content) + '</div>';
		}
		result += '</div>';
		// Add expand button
		result += '<div class="diff-expand-container">';
		result += '<button class="diff-expand-btn" data-diff-id="' + diffId + '" style="cursor: pointer;">Show ' + hiddenLines.length + ' more lines</button>';
		result += '</div>';
	}
	result += '</div>';
	// Add other properties if they exist
	for (const [key, value] of Object.entries(input)) {
		if (key !== 'file_path' && key !== 'old_string' && key !== 'new_string') {
			const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
			result += '\n<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

export function formatMultiEditToolDiff(input: any): string {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}
	// Check if this is a MultiEdit tool (has file_path and edits array)
	if (!input.file_path || !input.edits || !Array.isArray(input.edits)) {
		return formatToolInputUI(input);
	}
	// Format file path with better display
	const formattedPath = formatFilePath(input.file_path);
	// Count total lines across all edits for truncation
	let totalLines = 0;
	for (const edit of input.edits) {
		if (edit.old_string && edit.new_string) {
			const oldLines = edit.old_string.split('\n');
			const newLines = edit.new_string.split('\n');
			totalLines += oldLines.length + newLines.length;
		}
	}
	const maxLines = 6;
	const shouldTruncate = totalLines > maxLines;

	let result = '<div class="diff-container">';

	// Create header with proper layout: number + timestamp + button on first row, file path on second row
	let headerContent = '<div class="diff-header-row" style="display: flex; justify-content: space-between; align-items: center;">';
	headerContent += '<span class="diff-changes-count">Changes (' + input.edits.length + ')</span>';

	// Add checkpoint timestamp and restore button if available
	const currentCheckpoint = (window as any).currentCheckpoint;
	if (currentCheckpoint) {
		const timeAgo = new Date(currentCheckpoint.timestamp).toLocaleTimeString();
		headerContent += '<div class="diff-timestamp-group">';
		headerContent += '<span class="diff-timestamp">(' + timeAgo + ')</span>';
		headerContent += '<button class="diff-restore-btn" onclick="restoreToCommit(\'' + currentCheckpoint.sha + '\')" title="Restore checkpoint" style="margin-left: 5px;">↶</button>';
		headerContent += '</div>';
	}
	headerContent += '</div>';

	// Add file path on second row
	headerContent += '<div class="diff-file-path-row" style="margin-top: 4px;">';
	headerContent += '<span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer; font-size: 11px; opacity: 0.8;">' + formattedPath + '</span>';
	headerContent += '</div>';

	result += '<div class="diff-header">' + headerContent + '</div>';
	// Create a unique ID for this diff
	const diffId = 'multiEdit_' + Math.random().toString(36).substr(2, 9);
	let currentLineCount = 0;
	const visibleEdits = [];
	const hiddenEdits = [];
	// Determine which edits to show/hide based on line count
	for (let i = 0; i < input.edits.length; i++) {
		const edit = input.edits[i];
		if (!edit.old_string || !edit.new_string) {continue;}
		const oldLines = edit.old_string.split('\n');
		const newLines = edit.new_string.split('\n');
		const editLines = oldLines.length + newLines.length;
		if (shouldTruncate && currentLineCount + editLines > maxLines && visibleEdits.length > 0) {
			hiddenEdits.push(edit);
		} else {
			visibleEdits.push(edit);
			currentLineCount += editLines;
		}
	}
	// Show visible edits
	result += '<div id="' + diffId + '_visible">';
	for (let i = 0; i < visibleEdits.length; i++) {
		const edit = visibleEdits[i];
		if (i > 0) {result += '<div class="diff-edit-separator"></div>';}
		result += formatSingleEdit(edit, i + 1);
	}
	result += '</div>';
	// Show hidden edits (initially hidden)
	if (hiddenEdits.length > 0) {
		result += '<div id="' + diffId + '_hidden" style="display: none;">';
		for (let i = 0; i < hiddenEdits.length; i++) {
			const edit = hiddenEdits[i];
			result += '<div class="diff-edit-separator"></div>';
			result += formatSingleEdit(edit, visibleEdits.length + i + 1);
		}
		result += '</div>';
		// Add expand button
		result += '<div class="diff-expand-container">';
		result += '<button class="diff-expand-btn" data-diff-id="' + diffId + '" style="cursor: pointer;">Show ' + hiddenEdits.length + ' more edit' + (hiddenEdits.length > 1 ? 's' : '') + '</button>';
		result += '</div>';
	}
	result += '</div>';
	// Add other properties if they exist
	for (const [key, value] of Object.entries(input)) {
		if (key !== 'file_path' && key !== 'edits') {
			const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
			result += '\n<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

export function formatWriteToolDiff(input: any): string {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}
	// Check if this is a Write tool (has file_path and content)
	if (!input.file_path || !input.content) {
		return formatToolInputUI(input);
	}
	// Format file path with better display
	const formattedPath = formatFilePath(input.file_path);
	// Create diff view showing all content as additions
	const contentLines = input.content.split('\n');
	const maxLines = 6;
	const shouldTruncate = contentLines.length > maxLines;
	const visibleLines = shouldTruncate ? contentLines.slice(0, maxLines) : contentLines;
	const hiddenLines = shouldTruncate ? contentLines.slice(maxLines) : [];

	let result = '<div class="diff-container">';

	// Create header with file path inline and checkpoint info
	let headerContent = 'New file content: <span class="diff-file-path-inline" data-file-path="' + escapeHtml(input.file_path) + '" style="cursor: pointer; font-size: 10px; opacity: 0.7; font-weight: normal;">' + formattedPath + '</span>';

	// Add checkpoint timestamp and restore button if available
	const currentCheckpoint = (window as any).currentCheckpoint;
	if (currentCheckpoint) {
		const timeAgo = new Date(currentCheckpoint.timestamp).toLocaleTimeString();
		headerContent += '<div class="diff-timestamp-group" style="float: right;">';
		headerContent += '<span class="diff-timestamp">(' + timeAgo + ')</span>';
		headerContent += '<button class="diff-restore-btn" onclick="restoreToCommit(\'' + currentCheckpoint.sha + '\')" title="Restore checkpoint" style="margin-left: 5px;">↶</button>';
		headerContent += '</div>';
	}

	result += '<div class="diff-header">' + headerContent + '</div>';
	// Create a unique ID for this diff
	const diffId = 'write_' + Math.random().toString(36).substr(2, 9);
	// Show visible lines (all as additions)
	result += '<div id="' + diffId + '_visible">';
	for (const line of visibleLines) {
		result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
	}
	result += '</div>';
	// Show hidden lines (initially hidden)
	if (shouldTruncate) {
		result += '<div id="' + diffId + '_hidden" style="display: none;">';
		for (const line of hiddenLines) {
			result += '<div class="diff-line added">+ ' + escapeHtml(line) + '</div>';
		}
		result += '</div>';
		// Add expand button
		result += '<div class="diff-expand-container">';
		result += '<button class="diff-expand-btn" data-diff-id="' + diffId + '" style="cursor: pointer;">Show ' + hiddenLines.length + ' more lines</button>';
		result += '</div>';
	}
	result += '</div>';
	// Add other properties if they exist
	for (const [key, value] of Object.entries(input)) {
		if (key !== 'file_path' && key !== 'content') {
			const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
			result += '\n<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 4,
		maximumFractionDigits: 4
	}).format(amount);
}

export function formatTokenCount(count: number): string {
	return new Intl.NumberFormat('en-US').format(count);
}
