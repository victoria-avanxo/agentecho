<div align="center">

  <img src="assets/logo-text.jpg" alt="Avanxo Feedbacks Logo" width="400">

  **Visual feedback annotation tool for developers and clients**

  [![License: Polyform Noncommercial](https://img.shields.io/badge/License-Polyform_Noncommercial_1.0.0-red.svg)](LICENSE.md)
  [![Chrome Version](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

  [Features](#-features) &bull; [Installation](#-installation) &bull; [Usage](#-usage) &bull; [Development](#-development)

  Place visual markers on any webpage element and generate AI-optimized Markdown feedback reports. Perfect for code reviews, bug reporting, and communicating with AI coding assistants.

</div>

---

## Screenshots

<div align="center">

  ![Avanxo Feedbacks Demo](assets/demo.gif)

  *Hover to highlight elements, click to add feedback*

</div>

---

## Features

- **Visual Annotation System**
  - Click any element to place a numbered marker
  - Blue hover highlight shows exactly what you're targeting
  - Markers stay visible and positioned on the page

- **Framework Detection**
  - Automatically detects React components
  - Identifies Angular components
  - Vue and Svelte support planned

- **Smart Element Analysis**
  - Generates unique, stable CSS selectors
  - Extracts classes, IDs, and data attributes
  - Captures text content and component names
  - Stores element position for accurate marker placement

- **Markdown Export**
  - One-click copy to clipboard
  - Structured format optimized for AI coding agents
  - Includes all element context for precise communication

- **Developer-Friendly**
  - Shadow DOM isolation (won't break page styles)
  - Works on any website
  - Keyboard shortcuts for power users
  - Per-page feedback persistence

---

## Installation

### From Chrome Web Store

![Chrome Web Store](https://chromewebstore.google.com/detail/fdkdjnebmcmlhnbecbfefebpdhihdjjb)

> Support continued development by purchasing for $1 on the Chrome Web Store.

### From Source (Free)

If you're comfortable building from source, you can use Avanxo Feedbacks completely free:

1. **Clone the repository**
   ```bash
   git clone https://github.com/victoria-avanxo/agentecho.git
   cd avanxo-feedbacks
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist/` directory

---

## Usage

### Basic Workflow

1. **Click the extension icon** in your browser toolbar to open Avanxo Feedbacks
2. **Click "Activate"** to enable annotation on the current page
3. **Hover** over any element to see the blue highlight box
4. **Click** an element to place a marker
5. **Enter your feedback** in the modal that appears
6. **Repeat** for as many elements as needed
7. **Click "Copy"** in the toolbar to copy formatted Markdown to clipboard

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Copy all feedback to clipboard |
| `H` | Toggle marker visibility |
| `Delete` / `Backspace` | Clear all markers |
| `Escape` | Exit annotation mode |
| `Ctrl+Shift+A` | Exit annotation mode |

### Toolbar Controls

- **Pause**: Temporarily disable hover highlighting
- **Hide Markers**: Toggle marker visibility
- **Copy**: Copy all feedback as Markdown
- **Clear**: Remove all markers
- **Exit**: Deactivate extension

### Example Output

```markdown
# Avanxo Feedbacks Report

**URL:** https://example.com/dashboard
**Captured:** 2026-01-21 20:15:00
**Total Items:** 2

---

## Feedback #1
> The button text is hard to read on mobile

- **Element:** `<button>`
- **Selector:** `div.header > button.submit-btn`
- **Classes:** `submit-btn`, `primary`, `lg`
- **ID:** `submit-form`
- **Text:** "Submit Application"
- **Component:** `SubmitButton` (React)

---

## Feedback #2
> This section needs better spacing

- **Element:** `<section>`
- **Selector:** `main > section.hero:nth-of-type(1)`
- **Classes:** `hero`, `gradient-bg`

---
```

---

## Development

### Prerequisites

- Node.js 18+ and npm
- Chrome browser (for testing)

### Setup

```bash
# Install dependencies
npm install

# Development mode with hot-reload
npm run dev

# Type checking
npm run build  # Includes tsc compilation
```

### Project Structure

```
avanxo-feedbacks/
├── manifest.json              # Chrome extension manifest
├── src/
│   ├── background/           # Service worker (message broker)
│   ├── content/              # Injected content scripts
│   │   ├── overlay/         # Visual UI components
│   │   ├── analyzers/       # DOM inspection
│   │   └── feedback/        # Markdown generation
│   ├── popup/               # Extension popup UI
│   └── shared/              # Types, storage, messaging
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Tech Stack

- **TypeScript** 5.6 - Type-safe development
- **Vite** 5 - Fast build tool with HMR
- **@crxjs/vite-plugin** - Chrome extension build integration
- **Shadow DOM** - Style isolation
- **Chrome Manifest V3** - Latest extension APIs

### Building for Production

```bash
# Build optimized production bundle
npm run build

# Output directory: dist/
# Load in Chrome via chrome://extensions/ -> Load unpacked
```

### Generating Icons

```bash
# Generate extension icons from source
npm run generate-icons
```

---

## Attribution

**Avanxo Feedbacks** is a fork of [AgentEcho](https://github.com/Areshkew/agentecho) by **Areshkew**, modified and rebranded for client feedback delivery. All changes retain the original copyright and are licensed under the same [Polyform Noncommercial 1.0.0](LICENSE.md) terms.

- Original project & copyright: **© 2026 Areshkew. All Rights Reserved.**
- This fork (name, branding, and modifications): **Avanxo Feedbacks**

---

## License

**Polyform Noncommercial 1.0.0**

This project is source-available but not open-source software.

### What You CAN Do (Free):
- Use the software for personal or internal business purposes
- Study and modify the source code for your own use
- Build and install from source yourself

### What You CANNOT Do:
- Distribute the software or derivatives commercially
- Sell the extension on the Chrome Web Store or other marketplaces
- Use the software in commercial products or services

[Read full license text](LICENSE.md)

> **Why this license?**
> Avanxo Feedbacks is free to build and use. It's distributed as a source-available version of the open-source AgentEcho project by Areshkew, modified for client feedback use. See the attribution note below.

---

## Known Limitations

- Cannot inject into cross-origin iframes (browser security)
- Framework detection may fail on production/minified builds
- Selectors may break if DOM structure changes significantly between sessions

---

## Roadmap

- [ ] Vue and Svelte framework detection
- [ ] Screenshot capture per feedback item
- [ ] JSON export option
- [ ] Feedback categories and tags
- [ ] Cloud sync for feedback across devices
- [ ] Team collaboration features
- [ ] Integration with popular issue trackers

---

## Contributing

While this license restricts commercial distribution, contributions are welcome! Please feel free to:

- Report bugs via GitHub Issues
- Suggest new features
- Submit pull requests for bug fixes
- Improve documentation

All contributions must adhere to the Polyform Noncommercial license terms.

---

## Acknowledgments

Built with modern web standards and Chrome Extension Manifest V3.

- Inspired by the need for better developer-to-AI communication tools
- Framework detection patterns learned from React and Angular DevTools
- Shadow DOM isolation for seamless integration

---

<div align="center">

  **Made with care for developers who care about details**

  [Report a Bug](../../issues) &bull; [Request a Feature](../../issues) &bull; [Support Development](https://chromewebstore.google.com/detail/fdkdjnebmcmlhnbecbfefebpdhihdjjb)

</div>
