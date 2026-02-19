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
  transformStudentSkillsToGraph,
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

  // Fetch student skills from backend
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

        // Fetch student skills from backend
        const skillsResponse = await api.getStudentSkills(storedUser.id);
        
        if (!skillsResponse.skills || skillsResponse.skills.length === 0) {
          setError('No skills found');
          setFullGraphData({ nodes: [], links: [] });
          setLoading(false);
          return;
        }

        // Transform backend data to graph format
        const graphData = transformStudentSkillsToGraph(skillsResponse.skills);
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
