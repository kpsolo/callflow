# AI Agent Instructions for Call Flow Studio

Welcome! If you are an AI assistant or coding agent joining this workspace, please follow this guide to understand the project architecture, context, and domain logic.

## 1. Core Documentation (Read These First)
Before making architectural changes or creating new nodes, you **must** read the following documentation files to understand the domain and constraints:

- **`project-specification.md`**: The primary architectural specification. It defines the core data model, state management (Zustand), visual canvas (React Flow), and component hierarchy.
- **`flow-logic.md`**: Defines the heuristics for how edges are drawn, how terminals (e.g., "Answered", "Dropped") are dynamically injected, and the rules of the simulator engine.
- **`nodes-description.md`**: A comprehensive taxonomy, mindmap, and dictionary of all 34 node kinds, their categories, default data, inputs/outputs, and inspector fields.
- **`history.md`**: The changelog. Useful for understanding why certain architectural decisions (like moving to Zustand or introducing the inline editor) were made.
- **`README.md`**: Basic bootstrapping, UI layout overview, and scripts.

## 2. Source Code Organization
The application is built with React, TypeScript, React Flow, Zustand, and Zod. 

### Domain Model & Schemas (`src/schema/`)
This is the source of truth for all data structures.
- `src/schema/node.ts`: Defines `NodeKind`, `PortId`, and the base `FlowNode` structure.
- `src/schema/nodeData.ts`: Zod schemas for the `data` payload of every node kind. **If you add a new node or field, update the schema here.**
- `src/schema/flow.ts`: The aggregate `CallFlow` container schema.

### Nodes Registry & Visuals (`src/nodes/`)
- `src/nodes/registry.ts`: The central dictionary mapping `NodeKind` to its aesthetic category, label, ports, and default data. **Any new node must be registered here.**
- `src/nodes/FlowNodeView.tsx`: The universal React Flow custom node component. It renders the card, header, inline editor, and input/output handles.
- `src/nodes/NodeInlineEditor.tsx`: Renders quick-edit inline fields directly on the node card.
- `src/nodes/icons.tsx`: Maps every node kind to a Lucide-React icon.

### Inspector & Forms (`src/inspector/`)
- `src/inspector/fields.ts`: Maps schema fields to UI form controls (text, toggle, select, active-period, etc.) for the right-hand sidebar. **If you add a schema field, register it here to make it editable.**
- `src/inspector/Inspector.tsx`: The sidebar component that renders the form.

### Canvas & Edges (`src/canvas/`)
- `src/canvas/Canvas.tsx`: The main React Flow wrapper.
- `src/canvas/edgeStyle.ts`: Logic for styling and routing edges based on the semantic meaning of the connection (e.g., true/false, next, ring).
- `src/canvas/FlowEdge.tsx`: Custom SVG edge rendering.

### State Management (`src/state/`)
- `src/state/store.ts`: The primary Zustand store managing the nodes, edges, undo/redo history, and autosave logic.
- `src/state/uiStore.ts`: UI-only state (e.g., active tab, selected node, search query).

### Simulator Engine (`src/simulator/`)
- `src/simulator/engine.ts`: A headless execution engine that traverses the graph based on simulated caller inputs.
- `src/simulator/CallSimulator.tsx`: The UI for the step-by-step simulator tool.

### Test Fixtures (`src/fixtures/`)
Provide hardcoded `CallFlow` objects used for initial state and unit testing. When modifying schemas, ensure `src/fixtures/acmeHqMultiDept.ts` and others still pass type checks.

## 3. Development Guidelines
- **Strict Typing:** Always satisfy Zod schemas and TypeScript interfaces. Avoid using `any`.
- **Node Immutability:** Never mutate nodes directly. Always use the Zustand actions provided in `store.ts` (e.g., `updateNodeData`, `addNode`, `addEdge`).
- **Styling:** The project uses pure Vanilla CSS. Avoid adding CSS frameworks unless explicitly instructed. Use CSS variables defined in the standard palette (`src/palette/Palette.css`).
- **Testing:** The project uses Vitest. Run `npm test` after making changes to verify you haven't broken the logic. Test files are co-located in `__tests__` directories next to the files they test.
