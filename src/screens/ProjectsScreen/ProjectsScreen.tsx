import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';

interface ProjectMetadata {
  stars?: number;
  forks?: number;
  watchers?: number;
  language?: string;
  topics?: string[];
  private?: boolean;
  pushed_at?: string;
  created_at?: string;
  open_issues?: number;
  default_branch?: string;
  full_name?: string;
}

interface ProjectSkill {
  skill: {
    name: string;
  };
}

interface Project {
  id: string;
  name: string;
  description: string;
  url: string;
  metadata: ProjectMetadata;
  last_synced_at: string;
  project_skills?: ProjectSkill[];
}

export const ProjectsScreen: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getGitHubData();
      // Get top 5 projects sorted by stars (from metadata)
      const sortedProjects = (data.projects || [])
        .sort((a: Project, b: Project) => {
          const starsA = a.metadata?.stars || 0;
          const starsB = b.metadata?.stars || 0;
          return starsB - starsA;
        })
        .slice(0, 5);
      setProjects(sortedProjects);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenProject = (url: string) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getRelativeTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const toggleTopicsExpanded = (projectId: string) => {
    setExpandedTopics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const getProjectSkills = (project: Project): string[] => {
    if (!project.project_skills) return [];
    return project.project_skills
      .map(ps => ps.skill?.name)
      .filter((name): name is string => !!name)
      .slice(0, 8);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Top Projects</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1D4ED8" />
            <Text style={styles.loadingText}>Loading projects...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadProjects}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Projects Yet</Text>
            <Text style={styles.emptySubtitle}>
              Connect your GitHub to sync your repositories as projects.
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            <Text style={styles.subtitle}>
              Your top {projects.length} GitHub projects
            </Text>

            {projects.map((project, index) => (
              <TouchableOpacity
                key={project.id}
                style={styles.projectCard}
                onPress={() => handleOpenProject(project.url)}
                activeOpacity={0.7}
              >
                <View style={styles.projectHeader}>
                  <View style={styles.projectRank}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.projectTitleContainer}>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    {project.metadata?.private && (
                      <View style={styles.privateBadge}>
                        <Ionicons name="lock-closed" size={12} color="#6B7280" />
                        <Text style={styles.privateText}>Private</Text>
                      </View>
                    )}
                  </View>
                </View>

                {project.description ? (
                  <Text style={styles.projectDescription} numberOfLines={2}>
                    {project.description}
                  </Text>
                ) : (
                  <Text style={styles.noDescription}>No description available</Text>
                )}

                <View style={styles.statsRow}>
                  {project.metadata?.language && (
                    <View style={styles.stat}>
                      <View
                        style={[
                          styles.languageDot,
                          { backgroundColor: getLanguageColor(project.metadata.language) },
                        ]}
                      />
                      <Text style={styles.statText}>{project.metadata.language}</Text>
                    </View>
                  )}
                  <View style={styles.stat}>
                    <Ionicons name="star-outline" size={14} color="#64748B" />
                    <Text style={styles.statText}>
                      {project.metadata?.stars?.toLocaleString() || 0}
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Ionicons name="git-network-outline" size={14} color="#64748B" />
                    <Text style={styles.statText}>
                      {project.metadata?.forks?.toLocaleString() || 0}
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Ionicons name="eye-outline" size={14} color="#64748B" />
                    <Text style={styles.statText}>
                      {project.metadata?.watchers?.toLocaleString() || 0}
                    </Text>
                  </View>
                </View>

                {project.metadata?.pushed_at && (
                  <View style={styles.activityRow}>
                    <Ionicons name="time-outline" size={14} color="#059669" />
                    <Text style={styles.activityText}>
                      Last active: {getRelativeTime(project.metadata.pushed_at)}
                    </Text>
                  </View>
                )}

                {project.metadata?.topics && project.metadata.topics.length > 0 && (
                  <View style={styles.topicsSection}>
                    <View style={styles.topicsContainer}>
                      {(expandedTopics.has(project.id) 
                        ? project.metadata.topics 
                        : project.metadata.topics.slice(0, 4)
                      ).map((topic, idx) => (
                        // @ts-ignore - key is valid prop in React
                        <View key={`${project.id}-topic-${idx}`} style={styles.topicBadge}>
                          <Text style={styles.topicText}>{topic}</Text>
                        </View>
                      ))}
                    </View>
                    {project.metadata.topics.length > 4 && (
                      <TouchableOpacity 
                        onPress={() => toggleTopicsExpanded(project.id)}
                        style={styles.showMoreButton}
                      >
                        <Text style={styles.showMoreText}>
                          {expandedTopics.has(project.id) 
                            ? 'Show less' 
                            : `+${project.metadata.topics.length - 4} more`}
                        </Text>
                        <Ionicons 
                          name={expandedTopics.has(project.id) ? 'chevron-up' : 'chevron-down'} 
                          size={14} 
                          color="#1D4ED8" 
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {getProjectSkills(project).length > 0 && (
                  <View style={styles.skillsSection}>
                    <Text style={styles.skillsLabel}>Technologies</Text>
                    <View style={styles.skillsContainer}>
                      {getProjectSkills(project).map((skill, idx) => (
                        // @ts-ignore - key is valid prop in React
                        <View key={`${project.id}-skill-${idx}`} style={styles.skillBadge}>
                          <Text style={styles.skillBadgeText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.projectFooter}>
                  <Text style={styles.syncedText}>
                    Last synced: {formatDate(project.last_synced_at)}
                  </Text>
                  <Ionicons name="open-outline" size={16} color="#1D4ED8" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const getLanguageColor = (language: string): string => {
  const colors: Record<string, string> = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    Java: '#b07219',
    'C++': '#f34b7d',
    C: '#555555',
    'C#': '#178600',
    Go: '#00ADD8',
    Rust: '#dea584',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Ruby: '#701516',
    PHP: '#4F5D95',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Dart: '#00B4AB',
  };
  return colors[language] || '#6B7280';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    height: 72,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSpacer: {
    width: 44,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1D4ED8',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
  },
  projectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  projectTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    gap: 4,
    marginLeft: 8,
  },
  privateText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  projectDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 12,
  },
  noDescription: {
    fontSize: 14,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  languageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  activityText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  },
  topicsSection: {
    marginBottom: 12,
  },
  topicsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  topicBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  topicText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '500',
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
  },
  showMoreText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  moreTopics: {
    fontSize: 11,
    color: '#64748B',
    alignSelf: 'center',
    fontWeight: '500',
  },
  skillsSection: {
    marginBottom: 12,
  },
  skillsLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 8,
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  skillBadge: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  skillBadgeText: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '500',
  },
  projectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    marginTop: 4,
  },
  syncedText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
