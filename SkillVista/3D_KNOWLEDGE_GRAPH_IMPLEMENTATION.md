# 3D Knowledge Graph Implementation Guide

## Overview
Implemented a native 3D Knowledge Graph visualization for the MapScreen using React Three Fiber with d3-force-3d physics simulation. This provides optimal performance on mobile devices with interactive zoom, rotation, and drag capabilities.

## Architecture

### 1. Core 3D Graph Component (`src/components/Graph3D/Graph3D.tsx`)

**Purpose**: Main 3D visualization engine using React Three Fiber

**Key Features**:
- **Physics Simulation**: Powered by d3-force-3d
  - `forceSimulation`: Core physics engine
  - `forceLink`: Connects nodes based on relationships
  - `forceManyBody`: Repulsion force to spread nodes apart
  - `forceCenter`: Keeps graph centered
  - `forceCollide`: Prevents node overlap

- **Node Rendering**:
  - Spheres of varying sizes based on skill level
  - Color-coded by category (Frontend, Backend, AI, etc.)
  - Interactive states: normal, hovered (yellow), selected (red)
  - Emissive materials for visual feedback

- **Link Rendering**:
  - Thin cylinders connecting related nodes
  - Semi-transparent gray color
  - Drawn from source to target node positions

- **Interaction**:
  - Click nodes to select/show details
  - Hover for visual feedback
  - OrbitControls for camera manipulation (rotate, zoom, pan)

### 2. Data Transformation Utilities (`src/utils/graphUtils.ts`)

Converts knowledge graph data into graph-compatible format:

```typescript
transformDataToGraph(skills, projects, certifications)
→ { nodes, links }
```

**Node Types**:
- **Skills**: Core nodes from skill data (React, Python, etc.)
- **Projects**: Application nodes showing skill combinations
- **Certifications**: Achievement nodes with related skills

**Relationships**:
- Project → Skills (project requires these skills)
- Certification → Skills (certification validates these skills)
- Skill ↔ Skill (co-occurrence in projects)

**Filtering**:
```typescript
filterGraph(nodes, links, searchQuery, categoryFilter)
```
- Real-time search across node names and categories
- Category-based filtering
- Maintains link integrity (only shows links between filtered nodes)

### 3. Updated NodeDetailsPanel (`src/components/NodeDetailsPanel/NodeDetailsPanel.tsx`)

**Enhancements**:
- Now accepts `GraphNode` type from 3D graph
- Displays proficiency level as badge
- Shows confidence score as percentage bar
- Dynamic category colors and descriptions
- Adaptive modal with smooth animations

**Props**:
- `node`: GraphNode to display
- `onClose`: Close handler
- `isOpen`: Visibility state

### 4. MapScreen Integration (`src/screens/MapScreen/MapScreen.tsx`)

**Layout**:
```
Header
  ↓
Search Bar (TextInput with clear button)
  ↓
Category Filter Pills (horizontal scroll)
  ↓
Stats (node/link count, clear filters)
  ↓
3D Canvas (Graph3D component)
  ↓
Details Panel (overlay when node selected)
```

**Features**:
- Real-time search filtering
- Multi-category filtering
- Result statistics
- Empty state handling
- Dark theme optimized for 3D rendering

## Color Scheme

| Category | Color | Hex |
|----------|-------|-----|
| Frontend | Blue | #3b82f6 |
| Backend | Green | #10b981 |
| Database | Amber | #f59e0b |
| AI | Purple | #8b5cf6 |
| DevOps | Red | #ef4444 |
| Mobile | Cyan | #06b6d4 |
| Core CS | Pink | #ec4899 |
| Project | Lavender | #a78bfa |
| Certification | Yellow | #fbbf24 |

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Target FPS | 60 |
| Node Render | Instanced geometry (optimized) |
| Link Render | Cylinder meshes |
| Simulation | Continuous d3-force loop |
| Physics Iterations | 2 collision iterations |
| Distance Max | 50px (prevents far nodes from attracting) |

## Type Definitions

### GraphNode
```typescript
interface GraphNode {
  id: string;
  name: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  confidence: number; // 0-1
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}
```

### GraphLink
```typescript
interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value?: number; // link strength
}
```

### Graph3DProps
```typescript
interface Graph3DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  selectedNodeId?: string | null;
}
```

## Data Flow

1. **Mock Data** (mockSkills, mockProjects, mockCertifications)
   ↓
2. **transformDataToGraph()** → Creates node and link arrays
   ↓
3. **filterGraph()** (optional) → Filters based on search/category
   ↓
4. **Graph3D Component** → d3-force-3d physics simulation
   ↓
5. **Canvas Rendering** → Three.js 3D visualization
   ↓
6. **User Interaction** → Click/Hover events
   ↓
7. **NodeDetailsPanel** → Display selected node details

## Physics Simulation Details

The d3-force-3d simulation loop:
1. **Initialization**: Nodes placed randomly in 3D space
2. **Each Tick**:
   - Update positions based on forces
   - Apply velocity/acceleration physics
   - Update link geometry
   - Render new positions
3. **Convergence**: System stabilizes as repulsion and attraction balance

**Force Parameters**:
- Link distance: 8 units
- Link strength: 0.1 (weak connections)
- Charge strength: -100 (strong repulsion)
- Collision radius: 1 unit per node

## Mobile Optimization

- OrbitControls adapted for touch input
- Simplified geometry (4 segments on cylinders)
- Transparent materials reduce draw calls
- Continuous animation optimized for 60FPS
- React Native integration via Expo + react-three-fiber/native

## Future Enhancement Opportunities

1. **Labels**: Add text labels above/below nodes
2. **Animation**: Smooth transitions when filtering/selecting
3. **Clustering**: Visual grouping of related skills
4. **Export**: Save graph visualization as image
5. **Advanced Filtering**: Timeline-based skill progression
6. **AR Integration**: Leverage Expo AR for spatial viewing
7. **Web Version**: Scale to web using Canvas component

## Files Created/Modified

### Created:
- `src/components/Graph3D/Graph3D.tsx` - 3D visualization engine
- `src/components/Graph3D/index.ts` - Exports
- `src/utils/graphUtils.ts` - Data transformation utilities
- `src/types/d3-force-3d.d.ts` - Type definitions for d3-force-3d

### Modified:
- `src/screens/MapScreen/MapScreen.tsx` - Complete redesign with search/filter
- `src/components/NodeDetailsPanel/NodeDetailsPanel.tsx` - Updated for GraphNode type
- `src/components/NodeDetailsPanel/index.ts` - Export fix
- `src/screens/LoginScreen/index.ts` - Export fix for existing code
- `package.json` - d3-force-3d dependency added

## Testing

To test the implementation:

1. Navigate to the Map tab in the app
2. Observe the 3D graph rendering with physics simulation
3. Try search and category filtering
4. Click nodes to view details panel
5. Use gestures to rotate/zoom the 3D view

## Troubleshooting

**Graph not rendering**: Check if Canvas component is properly sized (flex: 1)
**Nodes overlapping**: Increase `forceCollide` radius parameter
**Slow performance**: Reduce node count or simplify geometry
**Touch input not working**: Verify OrbitControls is attached with `makeDefault`
