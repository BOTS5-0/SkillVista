import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Graph3D, GraphNode, GraphLink } from '@/components/Graph3D';
import { NodeDetailsPanel } from '@/components/NodeDetailsPanel';
import {
  transformBackendGraphToNodes,
  filterGraph,
  getCategories,
} from '@/utils/graphUtils';
import { api } from '@/services/api';

export const MapScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullGraphData, setFullGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  // Fetch student graph from backend
  useEffect(() => {
    const fetchStudentData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get stored user
        const storedUser = await api.getStoredUser();
        if (!storedUser || !storedUser.id) {
          setError('User not authenticated');
          setLoading(false);
          return;
        }

        // Fetch student graph from backend
        const graphResponse = await api.getStudentGraph(storedUser.id, 2, 100);

        const graphData = (() => {
          // Backward-compatible path if backend returns full nodes/edges shape.
          if (Array.isArray(graphResponse.nodes) && graphResponse.nodes.length > 0) {
            return transformBackendGraphToNodes(
              graphResponse.nodes,
              Array.isArray(graphResponse.edges) ? graphResponse.edges : []
            );
          }

          // Current backend shape: seedSkills + traversal edges.
          const rawEdges = Array.isArray(graphResponse.edges) ? graphResponse.edges : [];
          const rawSeedSkills = Array.isArray(graphResponse.seedSkills) ? graphResponse.seedSkills : [];

          const nodes: GraphNode[] = [];
          const links: GraphLink[] = [];
          const nodeMap = new Map<string, GraphNode>();
          const linkPairs = new Set<string>();

          const makeNodeId = (id: string | number, type = 'skill') =>
            `${type}:${id.toString()}`;

          const upsertNode = (
            id: string | number,
            name: string,
            category: string,
            type = 'skill'
          ) => {
            const nodeId = makeNodeId(id, type);
            if (nodeMap.has(nodeId)) return nodeId;
            const node: GraphNode = {
              id: nodeId,
              name,
              category,
              level: 'intermediate',
              confidence: 0.8,
              x: Math.random() * 20 - 10,
              y: Math.random() * 20 - 10,
              z: Math.random() * 20 - 10,
            };
            nodeMap.set(nodeId, node);
            nodes.push(node);
            return nodeId;
          };

          rawSeedSkills.forEach((skill) => {
            upsertNode(
              skill.skill_id,
              skill.skills?.name || `Skill ${skill.skill_id}`,
              'Skill',
              'skill'
            );
          });

          rawEdges.forEach((edge) => {
            const sourceIdRaw = edge.source_id ?? edge.source;
            const targetIdRaw = edge.target_id ?? edge.target;
            if (sourceIdRaw === undefined || targetIdRaw === undefined) return;

            const sourceType = edge.source_type || 'skill';
            const targetType = edge.target_type || 'related';
            const sourceName = edge.source_name || `Skill ${sourceIdRaw}`;
            const targetName = edge.target_name || `${targetType} ${targetIdRaw}`;

            const sourceNodeId = upsertNode(
              sourceIdRaw,
              sourceName,
              sourceType.charAt(0).toUpperCase() + sourceType.slice(1),
              sourceType
            );
            const targetNodeId = upsertNode(
              targetIdRaw,
              targetName,
              targetType.charAt(0).toUpperCase() + targetType.slice(1),
              targetType
            );

            if (sourceNodeId === targetNodeId) return;
            const pairKey = [sourceNodeId, targetNodeId].sort().join('|');
            if (linkPairs.has(pairKey)) return;
            linkPairs.add(pairKey);
            links.push({
              source: sourceNodeId,
              target: targetNodeId,
              value: Number((edge as { weight?: number }).weight ?? 1),
            });
          });

          const normalizeName = (name: string) =>
            name
              .toLowerCase()
              .replace(/\s+/g, '')
              .replace(/[^a-z0-9+#]/g, '');

          const relatedAliases: Record<string, string[]> = {
            c: ['c++', 'cpp'],
            'c++': ['c', 'cpp'],
            cpp: ['c', 'c++'],
            js: ['javascript', 'nodejs', 'node.js', 'typescript', 'ts'],
            javascript: ['js', 'typescript', 'ts'],
            ts: ['typescript', 'javascript', 'js'],
            typescript: ['ts', 'javascript', 'js'],
          };

          const addFallbackLink = (aId: string, bId: string, value = 0.4) => {
            if (aId === bId) return;
            const pairKey = [aId, bId].sort().join('|');
            if (linkPairs.has(pairKey)) return;
            linkPairs.add(pairKey);
            links.push({ source: aId, target: bId, value });
          };

          const skillNodes = nodes.filter((node) => node.id.startsWith('skill:'));

          if (links.length < Math.max(1, Math.floor(skillNodes.length / 3))) {
            for (let i = 0; i < skillNodes.length; i += 1) {
              for (let j = i + 1; j < skillNodes.length; j += 1) {
                const a = skillNodes[i];
                const b = skillNodes[j];
                const aName = normalizeName(a.name);
                const bName = normalizeName(b.name);
                const aliases = relatedAliases[aName] || [];
                const reverseAliases = relatedAliases[bName] || [];
                const shouldLink =
                  aliases.includes(bName) ||
                  reverseAliases.includes(aName) ||
                  (a.category === b.category && aName.slice(0, 3) === bName.slice(0, 3));
                if (shouldLink) {
                  addFallbackLink(a.id, b.id, 0.5);
                }
              }
            }
          }

          if (links.length === 0 && skillNodes.length > 1) {
            for (let i = 0; i < skillNodes.length - 1; i += 1) {
              addFallbackLink(skillNodes[i].id, skillNodes[i + 1].id, 0.35);
            }
          }

          return { nodes, links };
        })();

        if (graphData.nodes.length === 0) {
          setError('No graph data found');
          setFullGraphData({ nodes: [], links: [] });
          setLoading(false);
          return;
        }

        setFullGraphData(graphData);
      } catch (err) {
        console.error('Error fetching student data:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load knowledge graph'
        );
        setFullGraphData({ nodes: [], links: [] });
      } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, []);

  // Filter graph based on search and category
  const filteredGraphData = useMemo(
    () =>
      filterGraph(
        fullGraphData.nodes,
        fullGraphData.links,
        searchQuery,
        categoryFilter
      ),
    [fullGraphData, searchQuery, categoryFilter]
  );

  // Get available categories for filter buttons
  const categories = useMemo(
    () => getCategories(fullGraphData.nodes),
    [fullGraphData]
  );

  const handleCategoryToggle = (category: string) => {
    setCategoryFilter(categoryFilter === category ? undefined : category);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter(undefined);
  };

  // Add key to force remount on tab focus (disabled for React Native)
  // const [tabFocusKey, setTabFocusKey] = useState(0);
  // useEffect(() => {
  //   const handleFocus = () => setTabFocusKey((k) => k + 1);
  //   if (typeof window !== 'undefined') {
  //     window.addEventListener('focus', handleFocus);
  //     return () => window.removeEventListener('focus', handleFocus);
  //   }
  // }, []);
  // In React Native, use navigation listeners if remount on focus is needed.
  const tabFocusKey = 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Knowledge Graph</Text>
        <Text style={styles.subtitle}>Your Skills Network</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading your knowledge graph...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search skills..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Category Filter Pills */}
          {categories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryContainer}
            >
              {categories.map((category) => (
                <TouchableOpacity
                  key={`category-${category}`}
                  style={[
                    styles.categoryPill,
                    categoryFilter === category && styles.categoryPillActive,
                  ]}
                  onPress={() => handleCategoryToggle(category)}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      categoryFilter === category && styles.categoryPillTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Results info */}
          <View style={styles.statsContainer}>
            <Text style={styles.statsText}>
              {filteredGraphData.nodes.length} skill
              {filteredGraphData.nodes.length !== 1 ? 's' : ''} •{' '}
              {filteredGraphData.links.length} connection
              {filteredGraphData.links.length !== 1 ? 's' : ''}
            </Text>
            {(searchQuery || categoryFilter) && (
              <TouchableOpacity onPress={clearFilters}>
                <Text style={styles.clearLink}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 3D Graph Canvas */}
          <View style={styles.canvasContainer}>
            {filteredGraphData.nodes.length > 0 ? (
              <Graph3D
                key={tabFocusKey}
                nodes={filteredGraphData.nodes}
                links={filteredGraphData.links}
                onNodeClick={setSelectedNode}
                onNodeHover={setHoveredNode}
                selectedNodeId={selectedNode?.id}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No results found</Text>
                <Text style={styles.emptyStateText}>
                  Try adjusting your search or filters
                </Text>
              </View>
            )}
          </View>

          {/* Node Details Panel */}
          {selectedNode && (
            <NodeDetailsPanel
              node={selectedNode}
              isOpen={!!selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#94a3b8',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 0,
    backgroundColor: '#1e293b',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  clearButton: {
    padding: 8,
    marginLeft: 8,
  },
  clearButtonText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '600',
  },
  categoryScroll: {
    maxHeight: 50,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  categoryContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryPillActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94a3b8',
  },
  categoryPillTextActive: {
    color: '#ffffff',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  statsText: {
    fontSize: 12,
    color: '#64748b',
  },
  clearLink: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748b',
  },
});
