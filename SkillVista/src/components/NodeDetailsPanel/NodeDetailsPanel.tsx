import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { GraphNode } from '@/components/Graph3D';

interface NodeDetailsPanelProps {
  node: GraphNode | null;
  onClose: () => void;
  isOpen: boolean;
}

const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({ node, onClose, isOpen }) => {
  if (!node || !isOpen) return null;

  const confidencePercentage = Math.round(node.confidence * 100);

  const CATEGORY_COLORS: Record<string, string> = {
    'Frontend': '#3b82f6',
    'Backend': '#10b981',
    'Database': '#f59e0b',
    'AI': '#8b5cf6',
    'DevOps': '#ef4444',
    'Mobile': '#06b6d4',
    'Core CS': '#ec4899',
    'Project': '#a78bfa',
    'Certification': '#fbbf24',
  };

  const levelDescriptions: Record<string, string> = {
    'beginner': 'Just starting to learn and explore',
    'intermediate': 'Good understanding and practical experience',
    'advanced': 'Expert level with significant experience',
  };

  const categoryDescriptions: Record<string, string> = {
    'Frontend': 'Front-end development technologies and frameworks',
    'Backend': 'Back-end and server-side technologies',
    'Database': 'Database systems and data management',
    'AI': 'Artificial Intelligence and machine learning',
    'DevOps': 'DevOps, deployment, and infrastructure',
    'Mobile': 'Mobile app development',
    'Core CS': 'Core computer science fundamentals',
    'Project': 'A project that demonstrates your skills',
    'Certification': 'An earned professional certification',
  };

  const categoryColor = CATEGORY_COLORS[node.category] || '#6b7280';

  const renderBar = (percentage: number, color: string) => (
    <View style={styles.barContainer}>
      <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: color }]} />
    </View>
  );

  // Mobile/React Native version
  return (
    <View style={styles.modalOverlay}>
      <TouchableOpacity style={styles.backdropTouchArea} activeOpacity={1} onPress={onClose} />
      <View style={styles.modalContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{node.name}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>x</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContent}>
          <View style={styles.section}>
            <View style={styles.categoryBadge}>
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: categoryColor },
                ]}
              />
              <Text style={styles.categoryText}>{node.category}</Text>
            </View>
            <Text style={styles.description}>
              {categoryDescriptions[node.category] || 'A skill in your knowledge graph'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proficiency Level</Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>{node.level}</Text>
            </View>
            <Text style={styles.levelDescription}>
              {levelDescriptions[node.level || ''] || 'Working on this skill'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confidence Score</Text>
            {renderBar(confidencePercentage, categoryColor)}
            <Text style={styles.barLabel}>{confidencePercentage}%</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>About</Text>
            <Text style={styles.infoText}>
              This node represents a {(node.category || 'Unknown').toLowerCase()} with the label "{node.name}". 
              The confidence score indicates how reliably this connection was detected based 
              on your GitHub activity, projects, and certifications.
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  backdropTouchArea: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '55%',
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    flex: 1,
  },
  closeButton: {
    fontSize: 24,
    color: '#999',
    padding: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 20,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  description: {
    fontSize: 13,
    color: '#999',
    lineHeight: 20,
  },
  levelBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  levelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textTransform: 'capitalize',
  },
  levelDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 10,
  },
  barContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  infoBox: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 4,
    marginTop: 20,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});

export { NodeDetailsPanel };

