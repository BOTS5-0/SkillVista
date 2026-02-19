import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  Platform, 
  TouchableOpacity, 
  TextInput, 
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KnowledgeGraph3D } from '@/components/KnowledgeGraph3D';
import { NodeDetailsPanel } from '@/components/NodeDetailsPanel';
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

export const MapScreen: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [detailsPanelVisible, setDetailsPanelVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [categories, setCategories] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Fetch available categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true);
        const data = await api.getKnowledgeGraphData();
        setCategories(['All', ...data.categories]);
      } catch (err) {
        console.error('Error fetching categories:', err);
        setCategories(['All']);
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []);

  // Handle search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const results = await api.searchSkills(query);
      setSearchResults(results.results || []);
      setShowSearchResults(true);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    }
  };

  // Handle node click from graph
  const handleNodeClick = (node: KnowledgeNode) => {
    setSelectedNode(node);
    setDetailsPanelVisible(true);
  };

  // Handle search result selection
  const handleSearchResultClick = (result: any) => {
    const node: KnowledgeNode = {
      id: result.id,
      label: result.name,
      category: 'Searched',
      color: '#A8E6CF',
      size: 3,
      strength: 0.5,
      confidence: 0.5,
    };
    handleNodeClick(node);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  // Web version
  if (Platform.OS === 'web') {
    return (
      <div style={styles.webContainer as any}>
        <div style={styles.webHeader as any}>
          <h1 style={{ margin: 0, color: '#111', fontSize: 24, fontWeight: 700 }}>
            Knowledge Graph
          </h1>
          <p style={{ margin: '8px 0 0 0', color: '#999', fontSize: 14 }}>
            Explore your skills in 3D. Click nodes for details, drag to rotate, scroll to zoom.
          </p>
        </div>

        <div style={styles.webControlsContainer as any}>
          <div style={styles.webSearchContainer as any}>
            <input
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={styles.webSearchInput as any}
            />
            {showSearchResults && searchResults.length > 0 && (
              <div style={styles.webSearchDropdown as any}>
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    style={styles.webSearchResultItem as any}
                    onClick={() => handleSearchResultClick(result)}
                  >
                    {result.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.webFiltersContainer as any}>
            <span style={styles.webFilterLabel as any}>Filter by:</span>
            {loadingCategories ? (
              <span style={{ fontSize: 12, color: '#999' }}>Loading...</span>
            ) : (
              <div style={styles.webFilterButtonsContainer as any}>
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category === 'All' ? undefined : category)}
                    style={{
                      ...styles.webFilterButton,
                      ...((!selectedCategory && category === 'All') ||
                      selectedCategory === category
                        ? styles.webFilterButtonActive
                        : styles.webFilterButtonInactive),
                    } as any}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.webGraphContainer as any}>
          <KnowledgeGraph3D
            onNodeClick={handleNodeClick}
            filter={selectedCategory}
          />
        </div>

        {/* Details Panel - Integrated inline */}
        {selectedNode && detailsPanelVisible && (
          <div
            style={{
              ...styles.webDetailsPanel,
              right: detailsPanelVisible ? 0 : -400,
            } as any}
          >
            <div style={styles.webDetailHeader as any}>
              <h2 style={{ margin: 0, color: '#111' }}>{selectedNode.label}</h2>
              <button
                onClick={() => setDetailsPanelVisible(false)}
                style={styles.webDetailCloseButton as any}
              >
                ✕
              </button>
            </div>

            <div style={styles.webDetailContent as any}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: selectedNode.color,
                      marginRight: 10,
                    }}
                  />
                  <span style={{ fontSize: 14, color: '#666' }}>{selectedNode.category}</span>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 10 }}>
                  Proficiency Level
                </h3>
                <div style={{ height: 8, backgroundColor: '#f0f0f0', borderRadius: 4 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round(selectedNode.strength * 100)}%`,
                      backgroundColor: selectedNode.color,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
                  {Math.round(selectedNode.strength * 100)}%
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 10 }}>
                  Confidence Score
                </h3>
                <div style={{ height: 8, backgroundColor: '#f0f0f0', borderRadius: 4 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round(selectedNode.confidence * 100)}%`,
                      backgroundColor: '#4ECDC4',
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
                  {Math.round(selectedNode.confidence * 100)}%
                </div>
              </div>

              <div style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 8 }}>
                  About
                </h3>
                <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6, margin: 0 }}>
                  This skill is inferred from your GitHub projects, certifications, and other
                  connected sources.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Mobile version
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Knowledge Graph</Text>
          <Text style={styles.subtitle}>Explore your skills in 3D</Text>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search skills..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="#999"
          />
        </View>

        {showSearchResults && searchResults.length > 0 && (
          <ScrollView style={styles.searchResults}>
            {searchResults.map((result) => (
              <TouchableOpacity
                key={result.id}
                style={styles.searchResultItem}
                onPress={() => handleSearchResultClick(result)}
              >
                <Text style={styles.searchResultText}>{result.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.filterContainer}>
          <Text style={styles.filterLabel}>Filter by category:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterButtons}>
            {loadingCategories ? (
              <ActivityIndicator size="small" color="#4ECDC4" />
            ) : (
              categories.map((category) => (
                <TouchableOpacity
                  key={category}
                  onPress={() => setSelectedCategory(category === 'All' ? undefined : category)}
                  style={[
                    styles.filterButton,
                    (!selectedCategory && category === 'All') || selectedCategory === category
                      ? styles.filterButtonActive
                      : styles.filterButtonInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      (!selectedCategory && category === 'All') || selectedCategory === category
                        ? styles.filterButtonTextActive
                        : styles.filterButtonTextInactive,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        <View style={styles.graphContainer}>
          <KnowledgeGraph3D onNodeClick={handleNodeClick} filter={selectedCategory} />
        </View>

        <NodeDetailsPanel
          node={selectedNode}
          visible={detailsPanelVisible}
          onClose={() => setDetailsPanelVisible(false)}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // React Native styles
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
  },
  header: {
    marginTop: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#111',
  },
  searchResults: {
    backgroundColor: 'white',
    borderRadius: 8,
    maxHeight: 150,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchResultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultText: {
    fontSize: 14,
    color: '#111',
  },
  filterContainer: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
  },
  filterButtonActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  filterButtonInactive: {
    backgroundColor: 'white',
    borderColor: '#e0e0e0',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  filterButtonTextInactive: {
    color: '#666',
  },
  graphContainer: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },

  // Web styles
  webContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as any,
  webHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: 'white',
  } as any,
  webControlsContainer: {
    padding: '16px 24px',
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    gap: 16,
    alignItems: 'center',
    flexWrap: 'wrap',
  } as any,
  webSearchContainer: {
    position: 'relative',
    flex: 1,
    minWidth: 200,
  } as any,
  webSearchInput: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'inherit',
  } as any,
  webSearchDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderTop: 'none',
    borderRadius: '0 0 6px 6px',
    maxHeight: 200,
    overflowY: 'auto',
    zIndex: 10,
  } as any,
  webSearchResultItem: {
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer',
    fontSize: 13,
    color: '#111',
  } as any,
  webFiltersContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as any,
  webFilterLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#666',
    whiteSpace: 'nowrap',
  } as any,
  webFilterButtonsContainer: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  } as any,
  webFilterButton: {
    padding: '6px 12px',
    border: '1px solid #e0e0e0',
    borderRadius: 16,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as any,
  webFilterButtonActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
    color: 'white',
  } as any,
  webFilterButtonInactive: {
    backgroundColor: 'white',
    color: '#666',
  } as any,
  webGraphContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  } as any,
  webDetailsPanel: {
    position: 'fixed',
    right: 0,
    top: 0,
    width: 400,
    height: '100%',
    backgroundColor: 'white',
    boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
    zIndex: 1000,
    overflowY: 'auto',
    transition: 'right 0.3s ease-in-out',
    display: 'flex',
    flexDirection: 'column',
  } as any,
  webDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottom: '1px solid #f0f0f0',
  } as any,
  webDetailCloseButton: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    color: '#999',
  } as any,
  webDetailContent: {
    flex: 1,
    padding: 20,
    overflowY: 'auto',
  } as any,
});
