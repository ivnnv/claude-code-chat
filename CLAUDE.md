# Claude Development Guidelines for This Project

## 🚨 CRITICAL DEVELOPMENT RULES

### Extension Build & Install Policy
**DO NOT compile and install the extension unless explicitly requested by the user**

- Only run `npm run compile`, `vsce package`, or `code --install-extension` when the user specifically asks
- The user will test manually and provide feedback
- Focus on code implementation and explanation without automatic deployment

### Development Workflow
1. Make code changes as requested
2. Explain what was changed and why
3. Wait for user to test and provide feedback
4. Only compile/install when explicitly asked

This prevents unnecessary rebuilds and gives the user full control over when to test changes.