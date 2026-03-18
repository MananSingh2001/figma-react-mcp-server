#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const server = new Server(
  {
    name: "figma-react-mcp-server",
    version: "1.0.4",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const FIGMA_API_URL = "https://api.figma.com/v1";

// ─── Figma API Helper ────────────────────────────────────────────────

async function fetchFigma(endpoint: string, token: string) {
  try {
    const response = await axios.get(`${FIGMA_API_URL}${endpoint}`, {
      headers: { "X-Figma-Token": token },
    });
    return response.data;
  } catch (error: any) {
    throw new Error(
      `Figma API Error: ${error?.response?.data?.err || error.message}`
    );
  }
}

// ─── Color Utilities ─────────────────────────────────────────────────

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  return a < 1
    ? `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(2)})`
    : hex;
}

function colorToToken(r: number, g: number, b: number, a: number): string {
  return rgbaToHex(r, g, b, a);
}

// ─── Design Token Extraction ────────────────────────────────────────

interface DesignTokens {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  typography: Record<string, { fontFamily: string; fontSize: string; fontWeight: number }>;
  radii: Record<string, string>;
}

function extractTokensFromTree(node: any, tokens: DesignTokens) {
  if (!node || node.visible === false) return;

  const safeName = (node.name || "unnamed")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .toLowerCase();

  // Colors from fills
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find(
      (f: any) => f.type === "SOLID" && f.visible !== false
    );
    if (solidFill?.color) {
      const key = node.type === "TEXT" ? `text_${safeName}` : `bg_${safeName}`;
      tokens.colors[key] = colorToToken(
        solidFill.color.r,
        solidFill.color.g,
        solidFill.color.b,
        solidFill.color.a ?? 1
      );
    }
  }

  // Spacing from auto-layout
  if (node.itemSpacing) {
    tokens.spacing[`gap_${safeName}`] = `${node.itemSpacing}px`;
  }
  if (node.paddingTop) tokens.spacing[`pt_${safeName}`] = `${node.paddingTop}px`;
  if (node.paddingBottom) tokens.spacing[`pb_${safeName}`] = `${node.paddingBottom}px`;
  if (node.paddingLeft) tokens.spacing[`pl_${safeName}`] = `${node.paddingLeft}px`;
  if (node.paddingRight) tokens.spacing[`pr_${safeName}`] = `${node.paddingRight}px`;

  // Typography
  if (node.type === "TEXT" && node.style) {
    tokens.typography[`type_${safeName}`] = {
      fontFamily: node.style.fontFamily || "sans-serif",
      fontSize: `${node.style.fontSize || 16}px`,
      fontWeight: node.style.fontWeight || 400,
    };
  }

  // Border radii
  if (node.cornerRadius) {
    tokens.radii[`radius_${safeName}`] = `${node.cornerRadius}px`;
  }

  // Recurse children
  if (node.children) {
    for (const child of node.children) {
      extractTokensFromTree(child, tokens);
    }
  }
}

function generateTokensFile(tokens: DesignTokens): string {
  return `// Auto-generated design tokens — do not edit manually
// Generated via @manansiingh/figma-react-mcp-server

export const tokens = {
  colors: ${JSON.stringify(tokens.colors, null, 4)},
  spacing: ${JSON.stringify(tokens.spacing, null, 4)},
  typography: ${JSON.stringify(tokens.typography, null, 4)},
  radii: ${JSON.stringify(tokens.radii, null, 4)},
} as const;

export type Tokens = typeof tokens;
`;
}

// ─── Recursive React Component Generation ────────────────────────────

function convertFigmaToReact(node: any, depth = 0): string {
  if (!node || node.visible === false) return "";

  const indent = "  ".repeat(depth + 1);
  const styles: Record<string, string | number> = {};

  // Auto Layout → Flexbox
  if (node.layoutMode && node.layoutMode !== "NONE") {
    styles.display = "flex";
    styles.flexDirection = node.layoutMode === "HORIZONTAL" ? "row" : "column";

    if (node.primaryAxisAlignItems === "MIN") styles.justifyContent = "flex-start";
    else if (node.primaryAxisAlignItems === "MAX") styles.justifyContent = "flex-end";
    else if (node.primaryAxisAlignItems === "CENTER") styles.justifyContent = "center";
    else if (node.primaryAxisAlignItems === "SPACE_BETWEEN") styles.justifyContent = "space-between";

    if (node.counterAxisAlignItems === "MIN") styles.alignItems = "flex-start";
    else if (node.counterAxisAlignItems === "MAX") styles.alignItems = "flex-end";
    else if (node.counterAxisAlignItems === "CENTER") styles.alignItems = "center";

    if (node.itemSpacing) styles.gap = `${node.itemSpacing}px`;
    if (node.paddingTop) styles.paddingTop = `${node.paddingTop}px`;
    if (node.paddingBottom) styles.paddingBottom = `${node.paddingBottom}px`;
    if (node.paddingLeft) styles.paddingLeft = `${node.paddingLeft}px`;
    if (node.paddingRight) styles.paddingRight = `${node.paddingRight}px`;
  } else if (node.absoluteBoundingBox) {
    if (node.type !== "TEXT") {
      styles.width = `${Math.round(node.absoluteBoundingBox.width)}px`;
      if (node.type !== "GROUP") {
        styles.height = `${Math.round(node.absoluteBoundingBox.height)}px`;
      }
    }
  }

  // Fills
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find(
      (f: any) => f.type === "SOLID" && f.visible !== false
    );
    if (solidFill?.color) {
      const c = rgbaToHex(solidFill.color.r, solidFill.color.g, solidFill.color.b, solidFill.color.a ?? 1);
      if (node.type === "TEXT") styles.color = c;
      else styles.backgroundColor = c;
    }
  }

  // Typography
  if (node.type === "TEXT" && node.style) {
    if (node.style.fontSize) styles.fontSize = `${node.style.fontSize}px`;
    if (node.style.fontWeight) styles.fontWeight = node.style.fontWeight;
    if (node.style.fontFamily) styles.fontFamily = node.style.fontFamily;
    if (node.style.textAlignHorizontal === "CENTER") styles.textAlign = "center";
    if (node.style.textAlignHorizontal === "RIGHT") styles.textAlign = "right";
  }

  // Strokes → Borders
  if (node.strokes && node.strokes.length > 0) {
    const solidStroke = node.strokes.find(
      (s: any) => s.type === "SOLID" && s.visible !== false
    );
    if (solidStroke?.color) {
      styles.borderColor = rgbaToHex(solidStroke.color.r, solidStroke.color.g, solidStroke.color.b, solidStroke.color.a ?? 1);
      styles.borderWidth = `${node.strokeWeight || 1}px`;
      styles.borderStyle = "solid";
    }
  }

  // Border Radius
  if (node.cornerRadius) styles.borderRadius = `${node.cornerRadius}px`;

  // Compile styles
  let styleString = "";
  if (Object.keys(styles).length > 0) {
    const styleProps = Object.entries(styles)
      .map(([k, v]) => `${indent}    ${k}: '${v}'`)
      .join(",\n");
    styleString = ` style={{\n${styleProps}\n${indent}  }}`;
  }

  // Text nodes
  if (node.type === "TEXT") {
    const textContent = (node.characters || "")
      .replace(/{/g, "&#123;")
      .replace(/}/g, "&#125;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `${indent}<span${styleString}>\n${indent}  ${textContent}\n${indent}</span>`;
  }

  // Recursive children
  let childrenString = "";
  if (node.children && node.children.length > 0) {
    childrenString =
      "\n" +
      node.children
        .map((child: any) => convertFigmaToReact(child, depth + 1))
        .filter(Boolean)
        .join("\n") +
      `\n${indent}`;
  } else {
    return `${indent}<div${styleString} />`;
  }

  return `${indent}<div${styleString}>${childrenString}</div>`;
}

// ─── Output Generators ──────────────────────────────────────────────

function generateReactComponent(node: any): string {
  const componentName = (node.name || "FigmaComponent").replace(
    /[^a-zA-Z0-9]/g,
    ""
  );

  const jsxTree = convertFigmaToReact(node, 1);

  return `import React from 'react';
import { tokens } from './tokens';

/**
 * Figma Component: ${node.name}
 * Generated via @manansiingh/figma-react-mcp-server
 */
export const ${componentName || "FigmaComponent"} = () => {
  return (
${jsxTree}
  );
};
`;
}

function generateWidgetRegistryEntry(node: any): string {
  const componentName = (node.name || "FigmaComponent").replace(
    /[^a-zA-Z0-9]/g,
    ""
  );
  const widgetId = (node.name || "widget")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();

  return `import { ${componentName} } from './${componentName}';

/**
 * Widget Registry Entry
 * Auto-generated — registers this component in a dashboard widget system
 */
export const widgetManifest = {
  id: '${widgetId}',
  name: '${node.name || "Unnamed Widget"}',
  component: ${componentName},
  category: 'display',
  version: '1.0.0',
};
`;
}

function generateMFEModule(node: any): string {
  const componentName = (node.name || "FigmaComponent").replace(
    /[^a-zA-Z0-9]/g,
    ""
  );

  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import { ${componentName} } from './${componentName}';

/**
 * Micro-Frontend Module
 * Auto-generated — independently deployable with mount/unmount lifecycle
 */

let root: ReturnType<typeof createRoot> | null = null;

export default {
  mount: (container: HTMLElement) => {
    root = createRoot(container);
    root.render(React.createElement(${componentName}));
  },
  unmount: () => {
    if (root) {
      root.unmount();
      root = null;
    }
  },
};
`;
}

// ─── MCP Tool Definitions ────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_react_component",
        description:
          "Fetch a Figma node and convert it into a production React component with Auto Layout → Flexbox, fills, typography, strokes, and border radius mapping.",
        inputSchema: {
          type: "object",
          properties: {
            figmaToken: { type: "string", description: "Figma Personal Access Token" },
            fileKey: { type: "string", description: "Figma file key from the URL" },
            nodeId: { type: "string", description: "Figma node ID to convert" },
          },
          required: ["figmaToken", "fileKey", "nodeId"],
        },
      },
      {
        name: "extract_design_tokens",
        description:
          "Extract all design tokens (colors, spacing, typography, radii) from a Figma node tree into a reusable TypeScript tokens file.",
        inputSchema: {
          type: "object",
          properties: {
            figmaToken: { type: "string", description: "Figma Personal Access Token" },
            fileKey: { type: "string", description: "Figma file key from the URL" },
            nodeId: { type: "string", description: "Root Figma node ID to extract tokens from" },
          },
          required: ["figmaToken", "fileKey", "nodeId"],
        },
      },
      {
        name: "generate_mfe_module",
        description:
          "Generate a self-contained micro-frontend module from a Figma node, with mount/unmount lifecycle hooks and a widget registry entry.",
        inputSchema: {
          type: "object",
          properties: {
            figmaToken: { type: "string", description: "Figma Personal Access Token" },
            fileKey: { type: "string", description: "Figma file key from the URL" },
            nodeId: { type: "string", description: "Figma node ID to generate the MFE module from" },
          },
          required: ["figmaToken", "fileKey", "nodeId"],
        },
      },
    ],
  };
});

// ─── MCP Tool Handlers ───────────────────────────────────────────────

async function fetchNode(figmaToken: string, fileKey: string, nodeId: string) {
  const data = await fetchFigma(`/files/${fileKey}/nodes?ids=${nodeId}`, figmaToken);
  const nodeData = data.nodes[nodeId]?.document;
  if (!nodeData) {
    throw new Error(`Node ID [${nodeId}] not found in Figma file [${fileKey}].`);
  }
  return nodeData;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments as any;
  const { figmaToken, fileKey, nodeId } = args;

  if (!figmaToken || !fileKey || !nodeId) {
    throw new Error("Missing required arguments: figmaToken, fileKey, nodeId");
  }

  try {
    const nodeData = await fetchNode(figmaToken, fileKey, nodeId);

    switch (request.params.name) {
      // ── Tool 1: React Component ──
      case "generate_react_component": {
        const tokens: DesignTokens = { colors: {}, spacing: {}, typography: {}, radii: {} };
        extractTokensFromTree(nodeData, tokens);
        const tokensFile = generateTokensFile(tokens);
        const componentFile = generateReactComponent(nodeData);

        return {
          content: [
            { type: "text", text: `// ─── tokens.ts ───\n${tokensFile}\n\n// ─── ${(nodeData.name || "Component").replace(/[^a-zA-Z0-9]/g, "")}.tsx ───\n${componentFile}` },
          ],
        };
      }

      // ── Tool 2: Design Token Extraction ──
      case "extract_design_tokens": {
        const tokens: DesignTokens = { colors: {}, spacing: {}, typography: {}, radii: {} };
        extractTokensFromTree(nodeData, tokens);
        const tokensFile = generateTokensFile(tokens);

        return {
          content: [{ type: "text", text: tokensFile }],
        };
      }

      // ── Tool 3: MFE Module ──
      case "generate_mfe_module": {
        const tokens: DesignTokens = { colors: {}, spacing: {}, typography: {}, radii: {} };
        extractTokensFromTree(nodeData, tokens);
        const tokensFile = generateTokensFile(tokens);
        const componentFile = generateReactComponent(nodeData);
        const registryEntry = generateWidgetRegistryEntry(nodeData);
        const mfeBootstrap = generateMFEModule(nodeData);

        return {
          content: [
            {
              type: "text",
              text: [
                `// ─── tokens.ts ───`,
                tokensFile,
                `// ─── ${(nodeData.name || "Component").replace(/[^a-zA-Z0-9]/g, "")}.tsx ───`,
                componentFile,
                `// ─── registry.ts ───`,
                registryEntry,
                `// ─── bootstrap.ts (MFE entry point) ───`,
                mfeBootstrap,
              ].join("\n\n"),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (e: any) {
    return {
      content: [{ type: "text", text: `Error: ${e.message}` }],
      isError: true,
    };
  }
});

// ─── Start Server ────────────────────────────────────────────────────

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Figma-to-React MCP Server (Enterprise Edition) running!");
}

run().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
