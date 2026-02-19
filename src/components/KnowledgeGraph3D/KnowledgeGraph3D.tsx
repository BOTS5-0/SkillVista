import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, ScrollView } from 'react-native';
import { api } from '@/services/api';

interface KnowledgeNode {
  id: number;
  label: string;
  category: string;
  color: string;
  size: number;
  strength: number;
  confidence: number;
  x?: number;
  y?: number;
  z?: number;
}

interface KnowledgeEdge {
  id: number;
  source: number;
  target: number;
  type: string;
  weight: number;
}

interface KnowledgeGraphProps {
  onNodeClick?: (node: KnowledgeNode) => void;
  filter?: string;
}

// Web-only 3D visualization component using Three.js
const KnowledgeGraph3DWeb: React.FC<KnowledgeGraphProps> = ({ onNodeClick, filter }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [edges, setEdges] = useState<KnowledgeEdge[]>([]);

  // Fetch knowledge graph data
  useEffect(() => {
    const fetchGraphData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getKnowledgeGraphData(filter);
        
        if (!data.nodes || data.nodes.length === 0) {
          setError('No skills data available. Connect your GitHub account to populate the knowledge graph.');
          setNodes([]);
          setEdges([]);
          return;
        }

        setNodes(data.nodes);
        setEdges(data.edges);
      } catch (err) {
        console.error('Error fetching knowledge graph:', err);
        setError('Failed to load knowledge graph. Please try again.');
        setNodes([]);
        setEdges([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGraphData();
  }, [filter]);

  // Initialize 3D visualization with Three.js
  useEffect(() => {
    if (nodes.length === 0 || !containerRef.current || typeof window === 'undefined') return;

    const initializeThreeGraph = async () => {
      try {
        // Dynamically import Three.js
        const THREE = require('three') as any;
        
        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5f5f5);
        
        const width = containerRef.current!.clientWidth;
        const height = containerRef.current!.clientHeight;
        
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
        camera.position.z = 150;
        
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current!.appendChild(renderer.domElement);

        // Create node geometries
        const nodeGroup = new THREE.Group();
        const nodeMap = new Map<number, any>();

        nodes.forEach((node) => {
          const geometry = new THREE.SphereGeometry(node.size * 0.5, 16, 16);
          const material = new THREE.MeshStandardMaterial({
            color: node.color || '#4ECDC4',
            emissive: node.color || '#4ECDC4',
            emissiveIntensity: 0.3,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(node.x || 0, node.y || 0, node.z || 0);
          (mesh as any).nodeData = node;
          nodeGroup.add(mesh);
          nodeMap.set(node.id, mesh);
        });

        scene.add(nodeGroup);

        // Create edge lines
        const edgeGroup = new THREE.Group();
        edges.forEach((edge) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);

          if (sourceNode && targetNode) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
              'position',
              new THREE.BufferAttribute(
                new Float32Array([
                  sourceNode.position.x, sourceNode.position.y, sourceNode.position.z,
                  targetNode.position.x, targetNode.position.y, targetNode.position.z,
                ]),
                3
              )
            );

            const material = new THREE.LineBasicMaterial({
              color: 0xcccccc,
              linewidth: Math.sqrt(edge.weight) * 2,
            });
            const line = new THREE.Line(geometry, material);
            edgeGroup.add(line);
          }
        });

        scene.add(edgeGroup);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 100, 100);
        scene.add(directionalLight);

        // Mouse interaction
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let rotation = { x: 0, y: 0 };

        const handleMouseDown = (e: any) => {
          isDragging = true;
          previousMousePosition = { x: e.clientX, y: e.clientY };
        };

        const handleMouseMove = (e: any) => {
          if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            rotation.y += deltaX * 0.01;
            rotation.x += deltaY * 0.01;
            nodeGroup.rotation.y = rotation.y;
            nodeGroup.rotation.x = rotation.x;
          }
          previousMousePosition = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => {
          isDragging = false;
        };

        const handleWheel = (e: any) => {
          e.preventDefault();
          camera.position.z += e.deltaY * 0.1;
        };

        renderer.domElement.addEventListener('mousedown', handleMouseDown);
        renderer.domElement.addEventListener('mousemove', handleMouseMove);
        renderer.domElement.addEventListener('mouseup', handleMouseUp);
        renderer.domElement.addEventListener('wheel', handleWheel);

        // Click to select node
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const handleClick = (e: any) => {
          mouse.x = (e.clientX / width) * 2 - 1;
          mouse.y = -(e.clientY / height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);

          const intersects = raycaster.intersectObjects(nodeGroup.children);
          if (intersects.length > 0) {
            const selected = intersects[0].object as any;
            if (onNodeClick && selected.nodeData) {
              onNodeClick(selected.nodeData);
            }
          }
        };

        renderer.domElement.addEventListener('click', handleClick);

        // Animation loop
        const animate = () => {
          requestAnimationFrame(animate);
          renderer.render(scene, camera);
        };

        animate();

        // Handle window resize
        const handleResize = () => {
          const newWidth = containerRef.current!.clientWidth;
          const newHeight = containerRef.current!.clientHeight;
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        };

        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
          window.removeEventListener('resize', handleResize);
          renderer.domElement.removeEventListener('mousedown', handleMouseDown);
          renderer.domElement.removeEventListener('mousemove', handleMouseMove);
          renderer.domElement.removeEventListener('mouseup', handleMouseUp);
          renderer.domElement.removeEventListener('wheel', handleWheel);
          renderer.domElement.removeEventListener('click', handleClick);
          renderer.domElement.remove();
        };
      } catch (err) {
        console.error('Error initializing Three.js graph:', err);
        setError('Failed to initialize 3D visualization.');
      }
    };

    initializeThreeGraph();
  }, [nodes, edges, onNodeClick]);

  // For web platform, render HTML container
  if (typeof window !== 'undefined' && Platform.OS === 'web') {
    // Use a React component that returns a div for web
    // @ts-expect-error - HTML elements not available in React Native context, but this runs on web
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
        }}
      >
        {loading && <ActivityIndicator size="large" color="#4ECDC4" />}
        {error && (
          <Text style={{ color: '#FF6B6B', fontSize: 16, textAlign: 'center', padding: 20 }}>
            {error}
          </Text>
        )}
      </div>
    );
  }

  return null;
};

const KnowledgeGraph3D: React.FC<KnowledgeGraphProps> = (props) => {
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          3D Knowledge Graph is only available on web. Mobile view coming soon.
        </Text>
      </View>
    );
  }

  // For web, return a React element that renders the 3D component
  return <KnowledgeGraph3DWeb {...props} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
});

export default KnowledgeGraph3D;
export type { KnowledgeNode, KnowledgeEdge };
