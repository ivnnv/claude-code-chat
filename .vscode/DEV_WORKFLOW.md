# 🚀 Extension Development Workflow

## Simple Development

### Primary Development Command
**Press `F5` or run "DevExt"**

This will:
1. ✅ Start `pnpm dev` (TypeScript watch + RSBuild dev server)
2. ✅ Wait for "Found 0 errors. Watching for file changes."
3. ✅ Automatically launch the extension in a new VS Code window
4. ✅ Enable hot reloading for both backend and webview changes

### Debug Configuration

- **DevExt** - Single development config with live reload

### Terminal Management

- **Dev server runs in dedicated terminal**
- **Debug stop button terminates both extension and dev server**
- **Clean terminal output with colors enabled**

### Environment Variables

The dev mode sets these environment variables:
- `VSCODE_DEBUG=true` - Indicates debug mode
- `CLAUDE_VSC_DEV_MODE=true` - Custom dev mode indicator
- `FORCE_COLOR=1` - Enables colored terminal output

### Hot Reload Features

- ✅ **Backend Changes**: TypeScript files trigger automatic recompilation
- ✅ **Webview Changes**: HTML/CSS/JS changes trigger webview reload
- ✅ **Build Info Display**: Shows build timestamp in dev mode only
- ✅ **Live Debugging**: Breakpoints work during development

### Usage Tips

1. **Single F5 Press**: Everything you need starts with one keypress
2. **Terminal Visibility**: Dev server terminal stays open for monitoring
3. **Clean Stop**: Use Shift+F5 to stop both debugging and dev server
4. **Rapid Iteration**: Changes are reflected immediately without manual rebuilds
5. **Production Testing**: Use the production config to test final builds

### Troubleshooting

**If dev server doesn't start:**
- Run `🛑 Stop DevServer` task first
- Check terminal for error messages
- Ensure ports 3000 (RSBuild) and VS Code debug port are available

**If extension doesn't load:**
- Check TypeScript compilation completed successfully
- Verify `out/` directory contains compiled files
- Check Debug Console for error messages

**If hot reload isn't working:**
- Restart with `🔄 Restart DevServer` task
- Check that both TypeScript and RSBuild watchers are running
- Look for error messages in the "🚀 Extension DevServer" terminal

This setup provides a seamless development experience with minimal manual intervention!