import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force-3d';
import * as THREE from 'three';

// Suppress harmless deprecation warnings
if (typeof console !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    // Filter out harmless Three.js and expo-gl warnings
    if (
      message.includes('THREE.Clock') ||
      message.includes('THREE.Timer') ||
      message.includes('pixelStorei') ||
      message.includes('EXGL')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

export interface GraphNode {
  id: string;
  name: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value?: number;
}

interface Graph3DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  selectedNodeId?: string | null;
}

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  'Frontend': '#3b82f6',      // blue
  'Backend': '#10b981',       // green
  'Database': '#f59e0b',      // amber
  'AI': '#8b5cf6',           // purple
  'DevOps': '#ef4444',       // red
  'Mobile': '#06b6d4',       // cyan
  'Core CS': '#ec4899',      // pink
};

const getCategoryColor = (category: string): string => {
  return CATEGORY_COLORS[category] || '#6b7280';
};

// Update node positions based on level (size)
const getSizeFromLevel = (level: string): number => {
  switch (level) {
    case 'advanced':
      return 0.5;
    case 'intermediate':
      return 0.35;
    case 'beginner':
      return 0.25;
    default:
      return 0.3;
  }
};

interface NodeRendererProps {
  node: GraphNode;
  isSelected: boolean;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
}

const NodeRenderer: React.FC<NodeRendererProps> = ({
  node,
  isSelected,
  onNodeClick,
  onNodeHover,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const size = getSizeFromLevel(node.level);
  const color = getCategoryColor(node.category);

  return (
    <mesh
      ref={meshRef}
      position={[node.x || 0, node.y || 0, node.z || 0]}
      onClick={() => onNodeClick(node)}
      onPointerEnter={() => {
        setHovered(true);
        onNodeHover(node);
      }}
      onPointerLeave={() => {
        setHovered(false);
        onNodeHover(null);
      }}
    >
      <sphereGeometry args={[size, 32, 32]} />
      <meshStandardMaterial
        color={isSelected ? '#ff6b6b' : hovered ? '#ffd93d' : color}
        emissive={isSelected ? '#ff0000' : hovered ? '#ffff00' : '#000000'}
        emissiveIntensity={isSelected ? 0.5 : hovered ? 0.3 : 0}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
};

interface LinkRendererProps {
  link: GraphLink;
  nodes: Map<string, GraphNode>;
}

const LinkRenderer: React.FC<LinkRendererProps> = ({ link, nodes }) => {
  const sourceNode = typeof link.source === 'string'
    ? nodes.get(link.source)
    : link.source;
  const targetNode = typeof link.target === 'string'
    ? nodes.get(link.target)
    : link.target;

  if (!sourceNode || !targetNode) return null;

  // Create a line using a simple cylinder geometry
  const distanceX = (targetNode.x || 0) - (sourceNode.x || 0);
  const distanceY = (targetNode.y || 0) - (sourceNode.y || 0);
  const distanceZ = (targetNode.z || 0) - (sourceNode.z || 0);
  const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ);

  const midpointX = ((sourceNode.x || 0) + (targetNode.x || 0)) / 2;
  const midpointY = ((sourceNode.y || 0) + (targetNode.y || 0)) / 2;
  const midpointZ = ((sourceNode.z || 0) + (targetNode.z || 0)) / 2;

  return (
    <mesh position={[midpointX, midpointY, midpointZ]}>
      <cylinderGeometry args={[0.05, 0.05, distance, 8]} />
      <meshStandardMaterial 
        color="#ffffff" 
        transparent={false} 
        opacity={1} 
        emissive="#ffffff" 
        emissiveIntensity={0.7}
        metalness={0.5}
        roughness={0.2}
      />
    </mesh>
  );
};


interface SimulationContentProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  selectedNodeId?: string | null;
  nodeMapRef: React.MutableRefObject<Map<string, GraphNode>>;
}

const SimulationContent: React.FC<SimulationContentProps> = ({
  nodes,
  links,
  onNodeClick,
  onNodeHover,
  selectedNodeId,
  nodeMapRef,
}) => {
  const simulationRef = useRef<any>(null);
  const [, setUpdate] = useState(0);

  // Initialize simulation
  useEffect(() => {
    const normalizationFactor = 20; // Reduce forces for mobile rendering

    const sim = forceSimulation(nodes)
      .force(
        'link',
        forceLink(links)
          .id((d: any) => d.id)
          .distance(8)
          .strength(0.1)
      )
      .force('charge', forceManyBody().strength(-100).distanceMax(50))
      .force('center', forceCenter(0, 0, 0).strength(0.05))
      .force('collide', forceCollide(1).iterations(2));

    simulationRef.current = sim;

    // Disable default stop behavior to keep simulation running
    sim.on('tick', () => {
      setUpdate(prev => prev + 1);
    });

    return () => {
      sim.stop();
    };
  }, [nodes, links]);

  // Update animation frame
  useFrame(() => {
    if (simulationRef.current) {
      simulationRef.current.tick();
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />

      {/* Nodes */}
      {nodes.map((node) => (
        <NodeRenderer
          key={node.id}
          node={node}
          isSelected={selectedNodeId === node.id}
          onNodeClick={onNodeClick}
          onNodeHover={onNodeHover}
        />
      ))}

      {/* Links */}
      {links.map((link, idx) => (
        <LinkRenderer
          key={`link-${idx}`}
          link={link}
          nodes={nodeMapRef.current}
        />
      ))}
    </>
  );
};

export const Graph3D: React.FC<Graph3DProps> = ({
  nodes,
  links,
  onNodeClick = () => {},
  onNodeHover = () => {},
  selectedNodeId,
}) => {
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map());

  // Keep node map in sync
  useEffect(() => {
    const nodeMap = new Map<string, GraphNode>();
    nodes.forEach((node) => {
      nodeMap.set(node.id, node);
    });
    nodeMapRef.current = nodeMap;
  }, [nodes]);

  // Camera control logic and gesture handlers
  // Camera control refs
  const cameraRef = React.useRef<THREE.PerspectiveCamera>(null);
  const rotationRef = React.useRef({ x: 0.5, y: 0 });
  const zoomRef = React.useRef(50);
  const dragging = React.useRef(false);
  const lastPointer = React.useRef<{ x: number; y: number } | null>(null);


  // Pointer and touch event handlers for Canvas
  const handlePointerDown = (e: any) => {
    if (e?.nativeEvent) {
      dragging.current = true;
      lastPointer.current = { x: e.nativeEvent.x, y: e.nativeEvent.y };
    }
  };
  const handlePointerMove = (e: any) => {
    if (!dragging.current || !lastPointer.current || !e?.nativeEvent) return;
    const x = e.nativeEvent.x;
    const y = e.nativeEvent.y;
    const dx = x - lastPointer.current.x;
    const dy = y - lastPointer.current.y;
    lastPointer.current = { x, y };
    rotationRef.current.y -= dx * 0.01;
    rotationRef.current.x -= dy * 0.01;
  };
  const handlePointerUp = () => {
    dragging.current = false;
    lastPointer.current = null;
  };
  // Touch events for mobile
  const handleTouchStart = (e: any) => {
    if (e?.nativeEvent?.touches && e.nativeEvent.touches.length === 1) {
      dragging.current = true;
      const touch = e.nativeEvent.touches[0];
      lastPointer.current = { x: touch.pageX, y: touch.pageY };
    }
  };
  const handleTouchMove = (e: any) => {
    if (!dragging.current || !lastPointer.current || !e?.nativeEvent?.touches || e.nativeEvent.touches.length !== 1) return;
    const touch = e.nativeEvent.touches[0];
    const x = touch.pageX;
    const y = touch.pageY;
    const dx = x - lastPointer.current.x;
    const dy = y - lastPointer.current.y;
    lastPointer.current = { x, y };
    rotationRef.current.y -= dx * 0.01;
    rotationRef.current.x -= dy * 0.01;
  };
  const handleTouchEnd = () => {
    dragging.current = false;
    lastPointer.current = null;
  };

  // Camera controller child for useFrame
  const CameraController = () => {
    useFrame(({ camera }) => {
      if (!cameraRef.current) {
        cameraRef.current = camera as THREE.PerspectiveCamera;
      }
      rotationRef.current.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, rotationRef.current.x));
      const radius = Math.max(20, Math.min(100, zoomRef.current));
      cameraRef.current.position.x = radius * Math.sin(rotationRef.current.y) * Math.cos(rotationRef.current.x);
      cameraRef.current.position.y = radius * Math.sin(rotationRef.current.x);
      cameraRef.current.position.z = radius * Math.cos(rotationRef.current.y) * Math.cos(rotationRef.current.x);
      cameraRef.current.lookAt(0, 0, 0);
    });
    return null;
  };

  return (
    <Canvas
      camera={{ position: [0, 0, 50], fov: 75 }}
      style={{ width: '100%', height: '100%' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Fallback: transparent mesh overlay for touch, never blocks raycasts */}
      <mesh
        position={[0, 0, 0]}
        scale={[1000, 1000, 1]}
        visible={true}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <CameraController />
      <SimulationContent
        nodes={nodes}
        links={links}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        selectedNodeId={selectedNodeId}
        nodeMapRef={nodeMapRef}
      />
    </Canvas>
  );
};
