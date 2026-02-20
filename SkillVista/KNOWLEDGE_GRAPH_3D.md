# 3D Knowledge Graph Implementation Guide

## Overview

The 3D Knowledge Graph is an interactive visualization of your skills and their relationships. It serves as the main feature in the Maps tab, providing a visual representation of your technical competencies derived from GitHub, certifications, and other sources.

## Features

### Core Visualization
- **3D Interactive Graph**: Rotate, zoom, and drag to explore your skill network
- **Node Sizing**: Node sizes represent skill proficiency levels (larger = stronger proficiency)
- **Color Coding**: Skills are categorized and color-coded by type:
  - **Red (#FF6B6B)**: AI/ML - Artificial Intelligence and Machine Learning
  - **Teal (#4ECDC4)**: Web - Web development frameworks and technologies
  - **Yellow (#FFE66D)**: Cloud/DevOps - Cloud platforms and DevOps tools
  - **Mint (#95E1D3)**: Database - Database systems
  - **Light Green (#A8E6CF)**: Core CS - Fundamental computer science
  - **Purple (#D4A5FF)**: Other - Miscellaneous technologies

### Interactive Features
- **Click to View Details**: Click any node to see proficiency and confidence scores
- **Filter by Category**: Toggle category filters to focus on specific skill types
- **Search Functionality**: Search for specific skills to quickly locate them
- **Real-time Updates**: Data synced from backend knowledge graph

### Node Details Panel
When you click on a skill node, a details panel shows:
- Skill name and category
- Proficiency Level (0-100%)
- Confidence Score (0-100%)
- Detailed description of the skill category

## Technical Architecture

### Components

#### 1. **KnowledgeGraph3D** (`src/components/KnowledgeGraph3D/`)
- Main 3D visualization component using Three.js
- Handles graph data fetching and rendering
- Supports web platform via dynamic Three.js rendering
- Mobile fallback with explanatory message

#### 2. **NodeDetailsPanel** (`src/components/NodeDetailsPanel/`)
- Modal component displaying selected node details
- Shows proficiency and confidence bars
- Works on both mobile (modal) and web (side panel)

#### 3. **MapScreen** (`src/screens/MapScreen/`)
- Container screen integrating the graph and details
- Manages state for filtering, searching, and selection
- Provides UI for controls (search, filters)
- Responsive layout for web and mobile

### Backend Integration

#### API Endpoints

##### GET `/api/graph/data`
Fetches the knowledge graph for an authenticated user with optional filtering.

**Query Parameters:**
- `filter` (optional): Category to filter by (e.g., "AI/ML", "Web")

**Response:**
```json
{
  "nodes": [
    {
      "id": 1,
      "label": "Python",
      "category": "AI/ML",
      "color": "#FF6B6B",
      "size": 3.5,
      "strength": 0.85,
      "confidence": 0.9,
      "x": -10.5,
      "y": 20.3,
      "z": 5.2
    }
  ],
  "edges": [
    {
      "id": 1,
      "source": 1,
      "target": 2,
      "type": "DEPENDS_ON",
      "weight": 0.8
    }
  ],
  "categories": ["AI/ML", "Web", "Core CS"],
  "metadata": {
    "totalSkills": 25,
    "visualizedSkills": 15,
    "totalConnections": 42,
    "studentId": 123
  }
}
```

##### GET `/api/graph/search`
Searches for skills by name.

**Query Parameters:**
- `q` (required): Search query (minimum 2 characters)

**Response:**
```json
{
  "query": "python",
  "results": [
    {
      "id": 1,
      "name": "Python",
      "type": "skill"
    }
  ]
}
```

### Database Schema

Key tables involved:
- `student_skills`: Maps students to skills with proficiency/confidence scores
- `skills`: Skill definitions
- `knowledge_edges`: Relationships between skills
- `student_skill_evidence`: Evidence for skill inference

## Usage

### For Users

1. **Navigate to Maps Tab**: Open the app and go to the Maps tab
2. **View Your Knowledge Graph**: See your skills arranged in 3D space
3. **Interact with Nodes**:
   - Drag to rotate the view
   - Scroll to zoom in/out
   - Click nodes to see details
4. **Filter Skills**: Use the category buttons to focus on skill types
5. **Search**: Use the search bar to find specific skills

### For Developers

#### Adding a New Skill Category

Edit the `categorizeSkill` function in `backend/server.js`:

```javascript
const categorizeSkill = (skillName) => {
  const name = (skillName || '').toLowerCase();
  
  if (/your-pattern/.test(name)) {
    return { category: 'Your Category', color: '#HEXCOLOR' };
  }
  
  // ... other categories
};
```

#### Customizing Node Appearance

In `src/components/KnowledgeGraph3D/KnowledgeGraph3D.tsx`, modify the material properties:

```typescript
const material = new THREE.MeshStandardMaterial({
  color: node.color || '#4ECDC4',
  emissive: node.color || '#4ECDC4',
  emissiveIntensity: 0.3,  // Adjust glow
  roughness: 0.7,           // Adjust surface roughness
  metalness: 0.2,           // Adjust metallic appearance
});
```

## Performance Considerations

- **Large Graphs**: For >100 nodes, consider implementing graph clustering
- **Mobile**: Web-only implementation currently; mobile support to be added
- **Caching**: Graph data is fetched on demand; implement caching for repeated views
- **LOD (Level of Detail)**: Could be added for very large knowledge graphs

## Data Flow

```
Backend (PostgreSQL)
    ↓
/api/graph/data endpoint
    ↓
API Service (src/services/api.ts)
    ↓
KnowledgeGraph3D Component
    ↓
Three.js Renderer
    ↓
Web Browser (GL Canvas)
```

## Known Limitations

1. **Mobile Support**: Currently web-only; mobile version coming soon
2. **Real-time Updates**: Graph updates require manual refresh
3. **Large Graphs**: Performance may degrade with >200+ nodes
4. **Export**: No built-in export functionality for graphs

## Future Enhancements

- [ ] Mobile 3D visualization
- [ ] Graph animation/physics simulation
- [ ] Node clustering for large graphs
- [ ] Export to image/video
- [ ] Skill recommendations based on graph
- [ ] Real-time collaboration features
- [ ] Alternative 2D force-directed layout
- [ ] Graph statistics and analytics

## Troubleshooting

### Blank Graph
- **Cause**: No skills in database
- **Solution**: Connect GitHub account or add skills manually

### Slow Performance
- **Cause**: Too many nodes/edges
- **Solution**: Use category filter to reduce visible nodes

### Click Not Working
- **Cause**: Browser compatibility
- **Solution**: Use modern browser (Chrome, Firefox, Safari, Edge)

## Dependencies

- `three`: 3D graphics library
- `react-native-web`: Web support for React Native
- `expo`: Cross-platform development

## Related Documentation

- [Backend Integration Guide](../BACKEND_INTEGRATION.md)
- [Database Schema](../backend_database_linking.md)
- [API Documentation](../README.md)
