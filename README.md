# 🚀 Claude Code VSC Panel - Advanced Claude Code Interface for VS Code

> **Next-Level Evolution**: Originally inspired by [claude-code-chat](https://github.com/andrepimenta/claude-code-chat) by Andre Pimenta, this project has evolved into a completely different experience with advanced architectural improvements, next-level features, and privacy-first approach. Huge thanks to Andre for the initial work and inspiration that made this possible!

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?style=for-the-badge&logo=visual-studio-code)](#)
[![Claude Code](https://img.shields.io/badge/Powered%20by-Claude%20Code-orange?style=for-the-badge)](https://claude.ai/code)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

> **Chat with Claude Code through a clean, minimal interface right inside VS Code - no terminal required.**

Experience Claude Code with a completely rewritten modular architecture, Copilot-inspired minimal design, and strict privacy-first principles. We've moved beyond the original codebase to deliver a superior Claude Code experience.

---

## ✨ **Why This Project Exists**

🏗️ **Modern Architecture** - Completely rewritten with TypeScript modules, SCSS organization, and modern tooling  
🎨 **Superior UX** - Copilot-inspired minimal design with native VS Code integration  
🔒 **Privacy First** - **Zero user tracking** - no analytics, no data collection, period  
⚡ **Performance Focus** - Optimized with RSBuild bundling and efficient rendering  
🛠️ **Developer Experience** - Modern toolchain (pnpm, RSBuild, modular TypeScript) welcomes contributions  
🚀 **Independent Direction** - We chart our own course for the best Claude Code experience  

---

## 🏗️ **Modern Architecture & Tooling**

This project represents a complete architectural overhaul from typical VS Code extensions:

### **📁 Modular Structure**
```
src/
├── scripts/           # Focused, single-responsibility modules
│   ├── chat-messages.ts    # Message rendering & formatting  
│   ├── ui-core.ts          # Core UI interactions
│   ├── settings-modals.ts  # Settings & modal management
│   ├── mcp-servers.ts      # MCP server integration
│   └── permissions.ts      # Security & permissions
├── index.scss         # Organized SCSS with nested selectors
├── index.html         # Clean HTML structure
└── ui-scripts.ts      # Main entry point & message routing
```

### **🛠️ Modern Toolchain**
- **📦 pnpm** - Fast, efficient package management with workspace support
- **⚡ RSBuild** - Lightning-fast bundling (Rust-based, replaces Webpack)  
- **🎨 SCSS** - Organized stylesheets with nested selectors and groupings
- **📘 TypeScript** - Full type safety across all modules
- **🧹 ESLint** - Consistent code quality and formatting

### **🔄 Development Workflow**
- **Hot reload** with `pnpm run dev`
- **Type checking** with `npx tsc --noEmit`  
- **Linting & fixing** with `pnpm run lint:fix`
- **Optimized builds** with `pnpm run build:webview`

### **vs. Legacy Approach**
| Aspect | Legacy Extensions | This Project |
|--------|------------------|-------------|
| Structure | Single large files (1000+ lines) | Focused modules (~200 lines) |
| Bundling | Basic/No bundling | Modern RSBuild optimization |
| Package Manager | npm (slower) | pnpm (3x faster installs) |
| Styling | Inline CSS or single file | Organized SCSS with nesting |
| Type Safety | Minimal/None | Full TypeScript coverage |

---

## 🌟 **Key Features**

### 💬 **Clean Chat Interface**
- Minimal design inspired by GitHub Copilot
- Native VS Code title bar integration (no duplicate headers)
- Icon-only action buttons for clean appearance
- Tight spacing between messages and diffs
- Real-time streaming with optimized rendering

### 🔌 **Complete Claude Code Integration**
- Full Claude Code feature compatibility and beyond
- Enhanced MCP Server support with visual management
- Intuitive file references with `@` syntax
- Seamless image support via drag & drop or clipboard
- Advanced slash commands with clean modal interface
- Smart model selection (Opus, Sonnet, Default)

### 🛠️ **Advanced Tool Integration**
- Secure permissions system with granular controls
- Visual tool execution with formatted results
- WSL support for Windows users
- Checkpoint system for safe experimentation
- Process control with start/stop capabilities

### 🎨 **Native VS Code Experience**
- Follows VS Code design principles
- Automatic theme adaptation
- Activity bar integration
- Sidebar and panel support
- Native keyboard shortcuts

---

## 🚀 **Getting Started**

### Prerequisites
- **VS Code 1.94+** - Latest version recommended
- **Claude Code CLI** - [Install from Anthropic](https://claude.ai/code)
- **Active Claude subscription** - Pro/Max plan or API access

### Installation

1. **Download and Install**
   - Download the `.vsix` file from releases
   - Run `code --install-extension claude-code-vsc-panel-x.x.x.vsix`

2. **Open Claude Code VSC Panel**
   - Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
   - Or click the Claude icon in your activity bar
   - Or use Command Palette: `Claude Code: Open Chat`

---

## 🔧 **Configuration**

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open Claude Code VSC Panel |
| `Enter` | Send message |
| `@` | Open file picker |
| `/` | Open slash commands modal |

### WSL Configuration (Windows Users)
Configure WSL integration through VS Code Settings:

```json
{
  "claudeCodeVscPanel.wsl.enabled": true,
  "claudeCodeVscPanel.wsl.distro": "Ubuntu",
  "claudeCodeVscPanel.wsl.nodePath": "/usr/bin/node",
  "claudeCodeVscPanel.wsl.claudePath": "/usr/local/bin/claude"
}
```

---

## 🤝 **Contributing**

We welcome contributions to make this the best Claude Code experience! Our focus areas:

1. **🏗️ Code Quality** - Maintaining our modular, testable architecture
2. **🎨 User Experience** - Advancing our clean, minimal design philosophy  
3. **🔒 Privacy** - Absolute commitment to zero user tracking
4. **📚 Documentation** - Clear, comprehensive documentation
5. **🚀 Innovation** - Pushing Claude Code integration forward

### Development Setup
```bash
git clone https://github.com/ivnnv/claude-code-vsc-panel
cd claude-code-vsc-panel
pnpm install   # Fast installs with pnpm

# Development commands
pnpm run dev          # Hot reload development
pnpm run compile      # Full build with linting
pnpm run lint         # Check code quality
pnpm run lint:fix     # Auto-fix linting issues

# Press F5 in VS Code to run the extension in debug mode
```

### **Project Structure Benefits**
- **Easy to find code**: Each module has a single, clear responsibility
- **Easy to test**: Small, focused functions in isolated modules  
- **Easy to contribute**: Clear separation allows parallel development
- **Easy to maintain**: Changes are localized to relevant modules
- **Fast builds**: Modern tooling provides sub-second rebuilds

---

## 📝 **License**

See the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- **Andre Pimenta** - For creating the original [claude-code-chat](https://github.com/andrepimenta/claude-code-chat) extension
- **Anthropic** - For Claude AI and the Claude Code SDK
- **VS Code Team** - For the incredible extension platform
- **Contributors** - For feedback and improvements

---

## 🆚 **This Project vs Others**

| Feature | Other Claude Extensions | Claude Code VSC Panel |
|---------|-------------------------|-------------------|
| Architecture | Monolithic/Legacy | Modern Modular |
| Design | Custom/Inconsistent | Native VS Code Integration |
| Privacy | Analytics/Tracking | **Zero Tracking** |
| Maintenance | Variable/Limited | Active & Responsive |
| Code Quality | Mixed | Clean, Testable Modules |
| UI/UX | Bulky/Cluttered | Minimal, Copilot-inspired |
| Performance | Heavy/Slow | Optimized & Fast |

---

## 📞 **Support**

- 🐛 **Issues**: [GitHub Issues](https://github.com/ivnnv/claude-code-vsc-panel/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/ivnnv/claude-code-vsc-panel/discussions)
- 📧 **Contact**: ivnnv@hotmail.com

---

**Created by Ivn Nv**

*Delivering the cleanest, most private Claude Code experience in VS Code*