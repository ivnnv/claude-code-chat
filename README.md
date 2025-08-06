# 🚀 Claude Code Sidebar - Clean, Modular Claude Code Interface for VS Code

> **Fork Notice**: This is a modernized fork of [claude-code-chat](https://github.com/andrepimenta/claude-code-chat) by Andre Pimenta. Created due to the monolithic architecture being difficult to maintain and limited attention to contributors from the original maintainer.

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?style=for-the-badge&logo=visual-studio-code)](#)
[![Claude Code](https://img.shields.io/badge/Powered%20by-Claude%20Code-orange?style=for-the-badge)](https://claude.ai/code)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

> **No more terminal commands. Chat with Claude Code through a clean, minimal interface right inside VS Code.**

Experience Claude Code with a modernized, modular architecture and Copilot-like minimal design. This fork focuses on maintainability, clean code structure, and user privacy.

---

## ✨ **What's Different in This Fork?**

🏗️ **Modular Architecture** - Completely refactored from monolithic structure to maintainable modules  
🎨 **Minimal Design** - Copilot-like clean interface with native VS Code title integration  
🔒 **Privacy First** - **No user tracking or analytics** (removed from original)  
⚡ **Better Performance** - Optimized spacing, rendering, and resource usage  
🛠️ **Maintainable Code** - Split large files into focused, testable modules  
🔧 **Active Development** - Responsive to community feedback and contributions  

---

## 🌟 **Key Features**

### 💬 **Clean Chat Interface**
- Minimal design inspired by GitHub Copilot
- Native VS Code title bar integration (no duplicate headers)
- Icon-only action buttons for clean appearance
- Tight spacing between messages and diffs
- Real-time streaming with optimized rendering

### 🔌 **Full Claude Code Integration**
- All original Claude Code features maintained
- MCP Server support with visual management
- File references with `@` syntax
- Image support via drag & drop or clipboard
- Slash commands with modal interface
- Model selection (Opus, Sonnet, Default)

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
   - Run `code --install-extension claude-code-sidebar-x.x.x.vsix`

2. **Open Claude Code Sidebar**
   - Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
   - Or click the Claude icon in your activity bar
   - Or use Command Palette: `Claude Code: Open Chat`

---

## 🔧 **Configuration**

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open Claude Code Sidebar |
| `Enter` | Send message |
| `@` | Open file picker |
| `/` | Open slash commands modal |

### WSL Configuration (Windows Users)
Configure WSL integration through VS Code Settings:

```json
{
  "claudeCodeSidebar.wsl.enabled": true,
  "claudeCodeSidebar.wsl.distro": "Ubuntu",
  "claudeCodeSidebar.wsl.nodePath": "/usr/bin/node",
  "claudeCodeSidebar.wsl.claudePath": "/usr/local/bin/claude"
}
```

---

## 🤝 **Contributing**

This fork welcomes contributions! We focus on:

1. **🏗️ Code Quality** - Maintaining modular, testable architecture
2. **🎨 User Experience** - Clean, minimal design principles
3. **🔒 Privacy** - No user tracking, local-first approach
4. **📚 Documentation** - Clear, helpful documentation

### Development Setup
```bash
git clone https://github.com/ivnnv/claude-code-sidebar
cd claude-code-sidebar
npm install

# Press F5 in VS Code to run the extension
```

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

## 🆚 **Original vs Fork**

| Feature | Original | This Fork |
|---------|----------|-----------|
| Architecture | Monolithic | Modular |
| Design | Custom headers | Native VS Code |
| Tracking | Analytics included | Privacy-first (removed) |
| Maintenance | Limited contributor attention | Active development |
| Code Structure | Large single files | Split into focused modules |
| UI/UX | Bulky interface | Copilot-like minimal design |

---

## 📞 **Support**

- 🐛 **Issues**: [GitHub Issues](https://github.com/ivnnv/claude-code-sidebar/issues)
- 💡 **Original Extension**: [claude-code-chat](https://github.com/andrepimenta/claude-code-chat)

---

**Created by Ivn Nv (ivnnv@hotmail.com)**

*Forked to provide a cleaner, more maintainable Claude Code experience*