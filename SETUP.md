# Electron + TypeScript + SvelteKit + Tailwind Template

A modern, production-ready boilerplate for building cross-platform desktop applications using Electron with SvelteKit, TypeScript, and Tailwind CSS.

## Features

- **Electron v33** - Latest Electron with auto-updater support
- **SvelteKit + Svelte 5** - Modern web framework with excellent DX
- **TypeScript** - Full type safety across main and renderer processes
- **Tailwind CSS** - Utility-first CSS framework
- **Hot Reload** - Fast development with automatic reloading
- **IPC Type Safety** - Typed communication between processes
- **Auto Updater** - GitHub releases integration
- **System Tray** - Native system tray integration
- **Global Shortcuts** - Customizable keyboard shortcuts
- **Settings Persistence** - JSON file-based settings storage
- **Cross-Platform** - Build for Windows, macOS, and Linux

## Tech Stack

- **Frontend**: SvelteKit, Svelte 5, TypeScript, Tailwind CSS
- **Backend**: Electron, Node.js
- **Build Tools**: Vite, electron-vite, electron-builder
- **UI Components**: shadcn/ui components (Svelte port)
- **Testing**: Playwright, Vitest

## Project Structure

```
├── src/
│   ├── main/                 # Electron main process
│   │   ├── services/          # Application services
│   │   ├── windows/           # Window management
│   │   ├── interfaces/        # TypeScript interfaces
│   │   └── index.ts           # Main entry point
│   ├── preload/               # Preload scripts
│   │   └── index.ts           # Context bridge API
│   └── renderer/              # SvelteKit application
│       ├── src/
│       │   ├── lib/           # Components and utilities
│       │   ├── routes/        # SvelteKit routes
│       │   └── main.css       # Global styles
│       └── static/            # Static assets
├── electron-builder.yml       # Build configuration
├── electron.vite.config.ts    # Vite config for Electron
└── package.json
```

## Prerequisites

- Node.js 18+ and npm
- Git

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/electron-typescript-sveltekit-template.git
cd electron-typescript-sveltekit-template

# Install dependencies
npm install

# Install renderer dependencies
cd src/renderer && npm install && cd ../..
```

### Development

```bash
# Run in development mode with hot reload
npm run dev

# Run type checking
npm run typecheck

# Lint the code
npm run lint

# Format with Prettier
npm run format
```

### Building

```bash
# Build for production
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

### Testing

```bash
# Run tests in renderer
cd src/renderer
npm run test        # Playwright e2e tests
npm run test:unit   # Vitest unit tests
```

## Configuration

### Application Settings

Update the following files to customize your application:

- `electron-builder.yml` - Build configuration and app metadata
- `package.json` - Application name and version
- `src/main/index.ts` - Main window configuration

### Build Configuration

Edit `electron-builder.yml`:

```yaml
appId: com.yourcompany.yourapp
productName: Your App Name
```

### Auto-updater

Configure GitHub releases in `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: your-github-username
  repo: your-repo-name
```

## Development Guide

### Main Process Services

The template includes several pre-built services:

- **WindowService** - Window management
- **SettingsService** - Persistent settings
- **ShortcutService** - Global shortcuts
- **TrayService** - System tray
- **UpdaterService** - Auto-updates
- **IpcHandlerService** - IPC communication

### IPC Communication

Type-safe IPC is set up between main and renderer:

```typescript
// In renderer
const settings = await window.api.getSettings();
window.api.onSettingsUpdated((newSettings) => {
  // Handle settings update
});
```

### Adding New Routes

Create new routes in `src/renderer/src/routes/`:

```svelte
<!-- src/renderer/src/routes/about/+page.svelte -->
<script lang="ts">
  // Your component logic
</script>

<h1>About Page</h1>
```

### Using UI Components

The template includes shadcn/ui components:

```svelte
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Card } from '$lib/components/ui/card';
</script>

<Card>
  <Button>Click me</Button>
</Card>
```

## Deployment

### GitHub Releases

1. Update version in `package.json`
2. Commit and tag the release
3. Push to GitHub
4. GitHub Actions will build and publish

### Manual Distribution

Build artifacts are created in the `dist/` folder:

- **Windows**: `.exe` installer and portable
- **macOS**: `.dmg` installer
- **Linux**: `.AppImage`, `.deb`, and `.snap`

## Troubleshooting

### Common Issues

**Development server not starting**

- Ensure all dependencies are installed: `npm install`
- Check if ports 5173 (SvelteKit) and 5174 (Electron) are available

**TypeScript errors**

- Run `npm run typecheck` to identify issues
- Ensure TypeScript versions match in all package.json files

**Build failures**

- Clear the build cache: `rm -rf dist/ out/`
- Reinstall dependencies: `rm -rf node_modules && npm install`

### Debug Mode

Set environment variables for debugging:

```bash
NODE_ENV=development npm run dev
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Electron](https://www.electronjs.org/)
- [SvelteKit](https://kit.svelte.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [electron-vite](https://electron-vite.org/)

## Support

For support, please open an issue in the GitHub repository.
