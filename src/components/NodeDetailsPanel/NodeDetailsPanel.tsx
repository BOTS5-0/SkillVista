import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';

interface KnowledgeNode {
  id: number;
  label: string;
  category: string;
  color: string;
  size: number;
  strength: number;
  confidence: number;
}

interface NodeDetailsPanelProps {
  node: KnowledgeNode | null;
  onClose: () => void;
  visible: boolean;
}

const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({ node, onClose, visible }) => {
  if (!node) return null;

  const proficiencyPercentage = Math.round(node.strength * 100);
  const confidencePercentage = Math.round(node.confidence * 100);

  const renderBar = (percentage: number, color: string) => (
    <View style={styles.barContainer}>
      <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: color }]} />
    </View>
  );

  // Determine category description
  const categoryDescriptions: Record<string, string> = {
    'AI/ML': 'Artificial Intelligence and Machine Learning technologies and concepts',
    'Web': 'Web development frameworks, libraries, and technologies',
    'Cloud/DevOps': 'Cloud platforms, containerization, and DevOps tools',
    'Database': 'Database systems and data management technologies',
    'Core CS': 'Fundamental computer science concepts and languages',
    'Other': 'Other technologies and skills',
  };

  // Mobile/React Native version
  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{node.label}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent}>
            <View style={styles.section}>
              <View style={styles.categoryBadge}>
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: node.color },
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
              {renderBar(proficiencyPercentage, node.color)}
              <Text style={styles.barLabel}>{proficiencyPercentage}%</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Confidence Score</Text>
              {renderBar(confidencePercentage, '#4ECDC4')}
              <Text style={styles.barLabel}>{confidencePercentage}%</Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>About</Text>
              <Text style={styles.infoText}>
                This skill is inferred from your GitHub projects, certifications, and other
                connected sources. The proficiency level is calculated based on usage frequency
                and code contributions.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
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

export default NodeDetailsPanel;
