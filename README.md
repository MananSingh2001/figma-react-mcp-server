# @manansiingh/figma-react-mcp-server

> **Enterprise-grade Figma-to-React MCP Server** — converts Figma designs into production-ready React components with design token extraction, widget registry integration, and micro-frontend (MFE) module generation.

[![npm version](https://img.shields.io/npm/v/@manansiingh/figma-react-mcp-server)](https://www.npmjs.com/package/@manansiingh/figma-react-mcp-server)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.MananSingh2001%2Ffigma--react-blue)](https://registry.modelcontextprotocol.io)

## Why This Server?

There are several Figma MCP servers out there. Here's what makes this one different:

| Feature | Other Figma MCPs | This Server |
|---|---|---|
| Basic component generation | ✅ | ✅ |
| **Design token extraction** (colors, spacing, typography → reusable token file) | ❌ | ✅ |
| **Registry-driven output** (components self-register into a widget registry) | ❌ | ✅ |
| **MFE-aware generation** (independently deployable micro-frontend modules) | ❌ | ✅ |
| Auto Layout → Flexbox mapping | Partial | ✅ Full |

This server was built from real-world experience building enterprise design systems and micro-frontend dashboards at scale, not just weekend prototypes.

## What It Does

### 1. Design Token Extraction
Instead of hardcoding colors and spacing into individual components, this server extracts Figma's design tokens into a standalone `tokens.ts` file:

```ts
// Auto-generated design tokens from Figma
export const tokens = {
  colors: {
    primary: '#6366F1',
    background: '#F8FAFC',
    text: '#0F172A',
  },
  spacing: {
    sm: '8px',
    md: '16px',
    lg: '24px',
  },
  typography: {
    heading: { fontFamily: 'Inter', fontSize: '24px', fontWeight: 700 },
    body: { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400 },
  },
};
```

### 2. Widget Registry Output
Generated components automatically export a registry entry, making them plug-and-play in dashboard frameworks:

```ts
// Auto-generated registry entry
export const widgetManifest = {
  id: 'figma-card-widget',
  name: 'Card Widget',
  component: CardWidget,
  category: 'display',
  version: '1.0.0',
};
```

### 3. Micro-Frontend Module Generation
Components are generated as independently deployable MFE modules with their own entry point, not just standalone `.tsx` files:

```ts
// Auto-generated MFE bootstrap
import { CardWidget } from './CardWidget';
import { tokens } from './tokens';

export default {
  mount: (container: HTMLElement) => {
    // Render into the provided container
  },
  unmount: (container: HTMLElement) => {
    // Cleanup
  },
};
```

## Quick Start

### Requirements
- A **Figma Personal Access Token** (Settings → Personal Access Tokens)
- A **Figma File Key** (from the URL: `figma.com/file/<FILE_KEY>/...`)
- A **Node ID** (from the URL when selecting a frame: `?node-id=1:2`)

### Add to Your MCP Client

Add this to your MCP client config (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "figma-to-react": {
      "command": "npx",
      "args": ["-y", "@manansiingh/figma-react-mcp-server"]
    }
  }
}
```

### Usage
Once configured, simply prompt your AI agent:

> "Use the figma-to-react tool to convert Node '123:4' in file 'abcxyz' into a React component with design tokens extracted. My Figma token is 'figd_XXX'."

## Available MCP Tools

| Tool | Description |
|---|---|
| `generate_react_component` | Converts a Figma node into a production React component with inline styles derived from Auto Layout, fills, strokes, typography, and border radius. |
| `extract_design_tokens` | Pulls all color, spacing, and typography tokens from a Figma file into a reusable `tokens.ts` format. |
| `generate_mfe_module` | Generates a self-contained micro-frontend module with mount/unmount lifecycle hooks. |

## How It Works

1. Fetches the exact node tree from the Figma REST API
2. Recursively parses geometry, auto-layout constraints, fills, strokes, and text styles
3. Maps Figma's `layoutMode` → CSS Flexbox (`display: flex`, `flexDirection`, `justifyContent`, `alignItems`, `gap`)
4. Extracts design tokens into a separate reusable file
5. Wraps output in registry-compatible and MFE-compatible formats
6. Returns clean, production-ready React JSX via MCP tool response

## Tech Stack

- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) (stdio transport)
- [Figma REST API](https://www.figma.com/developers/api)
- TypeScript, Node.js (ES2022)

## License

MIT
