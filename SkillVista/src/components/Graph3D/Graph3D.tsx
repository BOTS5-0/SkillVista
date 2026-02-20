import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force-3d';
import * as THREE from 'three';

// Reusable vectors for performance
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

const NODE_COLORS: Record<string, string> = {
  frontend: '#3b82f6',
  backend: '#22c55e',
  database: '#f59e0b',
  devops: '#ef4444',
  mobile: '#06b6d4',
  ai: '#a855f7',
  'core cs': '#eab308',
  concept: '#8b5cf6',
  skill: '#14b8a6',
  related: '#94a3b8',
  other: '#9ca3af',
};

const RELATION_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#f59e0b', '#a78bfa', '#22d3ee'];

export interface GraphNode {
  id: string;
  name: string;
  category: string;
  level: string;
  confidence: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

// --- OrbitControls Component (Must be inside Canvas) ---
const OrbitControls = () => {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const orbitCamera = camera as THREE.Camera & {
      isPerspectiveCamera?: boolean;
      isOrthographicCamera?: boolean;
      zoom?: number;
      updateProjectionMatrix?: () => void;
    };
    if (!orbitCamera.isPerspectiveCamera && !orbitCamera.isOrthographicCamera) {
      // React Native GL camera can miss these runtime flags; OrbitControls relies on them.
      orbitCamera.isPerspectiveCamera = true;
      orbitCamera.zoom = orbitCamera.zoom ?? 1;
      orbitCamera.updateProjectionMatrix?.();
    }

    const ctrl = new OrbitControlsImpl(camera, gl.domElement);
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.1;
    ctrl.enableZoom = true;
    ctrl.enablePan = false;
    ctrl.zoomSpeed = 0.7;
    ctrl.minDistance = 45;
    ctrl.maxDistance = 130;
    controls.current = ctrl;
    
    const onChange = () => invalidate();
    ctrl.addEventListener('change', onChange);
    
    return () => {
      ctrl.removeEventListener('change', onChange);
      ctrl.dispose();
    };
  }, [camera, gl, invalidate]);

  useFrame(() => {
    controls.current?.update();
  });
  
  return null;
};

// --- Line Helper (Must be inside Canvas) ---
const Line = ({
  start,
  end,
  color,
}: {
  start?: { x?: number; y?: number; z?: number };
  end?: { x?: number; y?: number; z?: number };
  color?: string;
}) => {
  const ref = useRef<THREE.Mesh>(null!);
  
  useFrame(() => {
    if (!start || !end) return;
    if (
      !Number.isFinite(start.x) ||
      !Number.isFinite(start.y) ||
      !Number.isFinite(start.z) ||
      !Number.isFinite(end.x) ||
      !Number.isFinite(end.y) ||
      !Number.isFinite(end.z)
    ) {
      return;
    }

    v1.set(start.x as number, start.y as number, start.z as number);
    v2.set(end.x as number, end.y as number, end.z as number);
    const distance = v1.distanceTo(v2);
    
    if (distance > 0) {
      ref.current.position.copy(v1).add(v2).multiplyScalar(0.5);
      ref.current.scale.set(1, distance, 1);
      ref.current.quaternion.setFromUnitVectors(
        up, 
        v2.sub(v1).normalize()
      );
    }
  });

  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[0.12, 0.12, 1, 8]} />
      <meshStandardMaterial color={color || '#94a3b8'} opacity={0.78} transparent />
    </mesh>
  );
};

const NodeMesh = ({
  node,
  selected,
  onPress,
}: {
  node: GraphNode;
  selected: boolean;
  onPress: (node: GraphNode) => void;
}) => {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(node.x || 0, node.y || 0, node.z || 0);
  });

  return (
    <mesh
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        onPress(node);
      }}
    >
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial
        color={selected ? '#ff6b6b' : NODE_COLORS[node.category.toLowerCase()] || NODE_COLORS.other}
        emissive={selected ? '#ff0000' : '#000000'}
        emissiveIntensity={0.6}
      />
    </mesh>
  );
};

// --- Scene Content (Must be inside Canvas) ---
const GraphScene = ({ nodes, links, onNodeClick, selectedNodeId }: {
  nodes: GraphNode[],
  links: GraphLink[],
  onNodeClick: (node: any) => void,
  selectedNodeId?: string | number,
}) => {
  const simulation = useMemo(() => {
    // Initialize simulation
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((d: any) => d.id).distance(12).strength(0.45))
      .force('charge', forceManyBody().strength(-20))
      .force('collide', forceCollide(1.7))
      .force('center', forceCenter(0, 0, 0))
      .velocityDecay(0.62)
      .alphaDecay(0.09)
      .alphaMin(0.02);
    // Spread nodes initially
    nodes.forEach((n) => {
      n.x = (Math.random() - 0.5) * 32;
      n.y = (Math.random() - 0.5) * 32;
      n.z = (Math.random() - 0.5) * 32;
    });
    return sim;
  }, [nodes, links]);

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id.toString(), node])),
    [nodes]
  );

  const resolvedLinks = useMemo(
    () =>
      links
        .map((link) => {
          const source =
            typeof link.source === 'string'
              ? nodeById.get(link.source.toString())
              : link.source;
          const target =
            typeof link.target === 'string'
              ? nodeById.get(link.target.toString())
              : link.target;
          if (!source || !target) return null;
          return { source, target };
        })
        .filter((link): link is { source: GraphNode; target: GraphNode } => !!link),
    [links, nodeById]
  );

  useFrame(() => {
    // Keep layout stable while details panel is open for a selected node.
    if (selectedNodeId) return;
    if (simulation.alpha() <= 0.02) return;
    simulation.tick();
  });

  return (
    <>
      <ambientLight intensity={1.2} />
      <pointLight position={[100, 100, 100]} intensity={0.8} />
      
      {nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          onPress={onNodeClick}
        />
      ))}

      {resolvedLinks.map((link, i) => (
        <Line
          key={`link-${i}`}
          start={link.source}
          end={link.target}
          color={RELATION_COLORS[i % RELATION_COLORS.length]}
        />
      ))}
    </>
  );
};

// --- Main Entry Component ---
export const Graph3D = (props: any) => {
  if (!props.nodes || props.nodes.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No data to display</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Canvas camera={{ position: [0, 0, 85], fov: 60 }}>
        <OrbitControls />
        <GraphScene {...props} />
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({ 
  container: { 
    flex: 1, 
    backgroundColor: '#0f172a' 
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#94a3b8',
  }
});
