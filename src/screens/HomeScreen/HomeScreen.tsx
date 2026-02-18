import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { api, GitHubSyncResponse } from '@/services/api';
import { mockProfile } from '@/data/mockData';

const API_BASE_URL = 'https://skillvista-1.onrender.com/api';

export const HomeScreen: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [githubData, setGithubData] = useState<GitHubSyncResponse | null>(null);
  const [skillStrengthScore, setSkillStrengthScore] = useState<number | null>(null);
  const [skillsData, setSkillsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [streamingRepos, setStreamingRepos] = useState<any[]>([]);
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      loadUserData();
      loadSkillsData();
    }, [])
  );

  const loadUserData = async () => {
    try {
      const user = await api.getStoredUser();
      setUserData(user);
    } catch (error) {
      console.warn('Failed to load user data', error);
    }
  };

  const loadSkillsData = async () => {
    try {
      const data = await api.getGitHubData();
      if (data.skills && data.skills.length > 0) {
        setSkillsData(data.skills);
        // Calculate overall skill strength from top 10 skills' proficiency scores
        const topSkills = data.skills.slice(0, 10);
        const avgScore = topSkills.reduce((sum: number, s: any) => sum + (s.proficiencyScore || 0), 0) / topSkills.length;
        // Normalize to 0-100 scale (scores are typically 0-1 or low values)
        const normalized = Math.min(100, Math.round(avgScore * 100));
        setSkillStrengthScore(normalized);
      }
    } catch (error) {
      console.warn('Failed to load skills data', error);
    }
  };

  // Stream GitHub sync with progressive updates
  const streamGitHubSync = async () => {
    const token = await api.getStoredToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    setStreamingRepos([]);
    setSyncProgress(null);
    
    return new Promise<void>((resolve, reject) => {
      const url = `${API_BASE_URL}/integrations/github/sync-stream`;
      
      // Use fetch with readable stream for SSE
      fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(async response => {
        if (!response.ok) {
          try {
            const error = await response.json();
            if (error.needsOAuth) {
              reject({ needsOAuth: true, message: 'GitHub not connected' });
            } else {
              reject(new Error(error.error || `Server error: ${response.status}`));
            }
          } catch (parseError) {
            // If response body isn't JSON, show status code
            reject(new Error(`Server error: ${response.status} ${response.statusText}`));
          }
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          reject(new Error('Stream not supported'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let allRepos: any[] = [];
        let allSkills: any[] = [];
        let githubUser: any = null;

        const processLine = (line: string) => {
          if (line.startsWith('event: ')) {
            // Store event type for next data line
            (processLine as any).currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            const eventType = (processLine as any).currentEvent || 'message';
            try {
              const data = JSON.parse(line.substring(6));
              
              switch (eventType) {
                case 'status':
                  setSyncStatus(data.message);
                  break;
                case 'user':
                  githubUser = data;
                  break;
                case 'repos_count':
                  setSyncProgress({ current: 0, total: data.total });
                  break;
                case 'repo':
                  allRepos.push(data.repo);
                  setStreamingRepos([...allRepos]);
                  setSyncProgress({ current: data.index + 1, total: data.total });
                  // Update githubData progressively
                  setGithubData({
                    provider: 'github',
                    studentName: githubUser?.name || 'User',
                    syncedAt: new Date().toISOString(),
                    source: 'oauth',
                    repositories: allRepos,
                    inferredSkills: allSkills,
                    totals: { repositories: allRepos.length, inferredSkills: allSkills.length },
                    githubUser
                  });
                  break;
                case 'skills':
                  allSkills = data;
                  setSkillsData(data);
                  setGithubData(prev => prev ? { ...prev, inferredSkills: data, totals: { ...prev.totals, inferredSkills: data.length } } : null);
                  break;
                case 'complete':
                  setSyncStatus('Sync complete!');
                  setTimeout(() => setSyncStatus(''), 2000);
                  resolve();
                  break;
                case 'error':
                  reject(new Error(data.message));
                  break;
              }
            } catch (e) {
              // Ignore parse errors for partial lines
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim()) processLine(line);
          }
        }
        
        // Process any remaining buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.trim()) processLine(line);
          }
        }
        
        resolve();
      }).catch((fetchError) => {
        reject(new Error(`Failed to connect to server: ${fetchError?.message || 'Network error'}`));
      });
    });
  };

  const handleGitHubOAuth = async () => {
    setIsLoading(true);
    setSyncStatus('Starting...');
    try {
      // Step 1: Get the OAuth URL from our backend
      const { authUrl } = await api.getGithubOAuthUrl();
      
      // Step 2: Open GitHub authorization page in browser
      const result = await WebBrowser.openBrowserAsync(authUrl);
      
      // Step 3: After user returns from browser, wait for callback to complete
      if (result.type === 'cancel') {
        setIsLoading(false);
        setSyncStatus('');
        return; // User cancelled
      }
      
      // Step 4: Wait a moment for the OAuth callback to complete on the server
      setSyncStatus('Completing authorization...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 5: Try to stream sync with retries
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await streamGitHubSync();
          Alert.alert('Success', 'GitHub profile synced successfully!');
          return;
        } catch (err: any) {
          lastError = err;
          if (err.needsOAuth) {
            setSyncStatus('Waiting for authorization...');
            await new Promise(resolve => setTimeout(resolve, 1500));
          } else {
            throw err;
          }
        }
      }
      
      throw lastError || new Error('Failed to sync after multiple attempts');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to connect GitHub');
      setSyncStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenProfile = () => {
    setIsMenuOpen(false);
    router.push('/profile');
  };

  const handleOpenSettings = () => {
    setIsMenuOpen(false);
    router.push('/settings');
  };

  const handleOpenProjects = () => {
    router.push('/projects');
  };

  const handleToggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={handleToggleMenu}
          accessibilityLabel="Open profile menu"
        >
          <Image
            source={{
              uri: userData?.avatarUrl || mockProfile.avatarUrl,
            }}
            style={styles.avatar}
          />
        </TouchableOpacity>
      </View>
      {isMenuOpen && (
        <View style={styles.menuOverlay}>
          <Pressable style={styles.menuBackdrop} onPress={handleToggleMenu} />
          <View style={styles.profileMenu}>
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenProfile}>
              <Ionicons name="person-circle-outline" size={18} color="#1E293B" />
              <Text style={styles.menuItemText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenSettings}>
              <Ionicons name="settings-outline" size={18} color="#1E293B" />
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome, {userData?.name || 'User'}!</Text>
          <Text style={styles.subtitle}>Your learning dashboard</Text>

          {skillStrengthScore !== null && (
            <View style={styles.skillStrengthCard}>
              <View style={styles.skillStrengthHeader}>
                <Ionicons name="fitness-outline" size={24} color="#059669" />
                <Text style={styles.skillStrengthTitle}>Skill Strength Score</Text>
              </View>
              <View style={styles.skillStrengthContent}>
                <View style={styles.skillScoreCircle}>
                  <Text style={styles.skillScoreValue}>{skillStrengthScore}</Text>
                  <Text style={styles.skillScoreMax}>/100</Text>
                </View>
                <View style={styles.skillStrengthMeter}>
                  <View style={styles.skillMeterTrack}>
                    <View 
                      style={[
                        styles.skillMeterFill, 
                        { width: `${skillStrengthScore}%` },
                        skillStrengthScore >= 70 ? styles.skillMeterHigh :
                        skillStrengthScore >= 40 ? styles.skillMeterMedium :
                        styles.skillMeterLow
                      ]} 
                    />
                  </View>
                  <Text style={styles.skillStrengthLabel}>
                    {skillStrengthScore >= 70 ? 'Strong' :
                     skillStrengthScore >= 40 ? 'Growing' : 'Building'}
                  </Text>
                </View>
              </View>
              {skillsData.length > 0 && (
                <View style={styles.topProficientSkills}>
                  <Text style={styles.topSkillsLabel}>Top proficient skills:</Text>
                  <View style={styles.proficientSkillsList}>
                    {skillsData.slice(0, 3).map((s: any, idx: number) => (
                      // @ts-ignore - key is valid prop in React
                      <View key={`prof-${idx}`} style={styles.proficientSkillBadge}>
                        <Text style={styles.proficientSkillText}>{s.skill}</Text>
                        <Text style={styles.proficientSkillScore}>
                          {Math.round((s.proficiencyScore || 0) * 100)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {!githubData && !isLoading && (
            <TouchableOpacity
              style={styles.syncButton}
              onPress={handleGitHubOAuth}
              disabled={isLoading}
            >
              <Ionicons name="logo-github" size={18} color="#fff" />
              <Text style={styles.syncButtonText}>Connect GitHub</Text>
            </TouchableOpacity>
          )}

          {isLoading && (
            <View style={styles.syncProgressContainer}>
              <View style={styles.syncProgressHeader}>
                <ActivityIndicator color="#1D4ED8" />
                <Text style={styles.syncProgressStatus}>{syncStatus || 'Syncing...'}</Text>
              </View>
              {syncProgress && (
                <View style={styles.syncProgressBar}>
                  <View 
                    style={[
                      styles.syncProgressFill, 
                      { width: `${(syncProgress.current / syncProgress.total) * 100}%` }
                    ]} 
                  />
                </View>
              )}
              {syncProgress && (
                <Text style={styles.syncProgressText}>
                  {syncProgress.current} of {syncProgress.total} repositories
                </Text>
              )}
              {streamingRepos.length > 0 && (
                <View style={styles.streamingReposList}>
                  {streamingRepos.slice(-3).map((repo, idx) => (
                    // @ts-ignore - key is valid prop in React
                    <View key={`stream-${idx}`} style={styles.streamingRepoItem}>
                      <Ionicons name="checkmark-circle" size={14} color="#059669" />
                      <Text style={styles.streamingRepoName}>{repo.name}</Text>
                      {repo.language && (
                        <Text style={styles.streamingRepoLang}>{repo.language}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {githubData && !isLoading && (
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Ionicons name="code-outline" size={24} color="#1D4ED8" />
                <Text style={styles.statValue}>{githubData.totals.repositories}</Text>
                <Text style={styles.statLabel}>Repositories</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="sparkles" size={24} color="#1D4ED8" />
                <Text style={styles.statValue}>{githubData.totals.inferredSkills}</Text>
                <Text style={styles.statLabel}>Skills</Text>
              </View>
            </View>
          )}

          {githubData?.inferredSkills && githubData.inferredSkills.length > 0 && (
            <View style={styles.skillsContainer}>
              <Text style={styles.sectionTitle}>Top Skills</Text>
              <View style={styles.skillsList}>
                {githubData.inferredSkills.slice(0, 6).map((skill, idx) => (
                  // @ts-ignore - key is valid prop in React
                  <View key={`skill-${idx}`} style={styles.skillBadge}>
                    <Text style={styles.skillText}>{skill.skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.projectsButton}
            onPress={handleOpenProjects}
          >
            <Ionicons name="folder-outline" size={18} color="#fff" />
            <Text style={styles.projectsButtonText}>View Projects</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
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
  headerSpacer: {
    width: 52,
    height: 52,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  avatarButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#60A5FA',
    backgroundColor: '#F1F5F9',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  profileMenu: {
    position: 'absolute',
    top: 18,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    width: 160,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 11,
  },
  menuOverlay: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuItemText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
  },
  syncButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  skillsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  skillsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  skillText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  projectsButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  projectsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skillStrengthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  skillStrengthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  skillStrengthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  skillStrengthContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  skillScoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#059669',
  },
  skillScoreValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#059669',
  },
  skillScoreMax: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: -4,
  },
  skillStrengthMeter: {
    flex: 1,
  },
  skillMeterTrack: {
    height: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
  },
  skillMeterFill: {
    height: '100%',
    borderRadius: 6,
  },
  skillMeterHigh: {
    backgroundColor: '#059669',
  },
  skillMeterMedium: {
    backgroundColor: '#F59E0B',
  },
  skillMeterLow: {
    backgroundColor: '#EF4444',
  },
  skillStrengthLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 6,
  },
  topProficientSkills: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  topSkillsLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  proficientSkillsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  proficientSkillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  proficientSkillText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  proficientSkillScore: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  syncProgressContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  syncProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  syncProgressStatus: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
  },
  syncProgressBar: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  syncProgressFill: {
    height: '100%',
    backgroundColor: '#1D4ED8',
    borderRadius: 4,
  },
  syncProgressText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  streamingReposList: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    gap: 8,
  },
  streamingRepoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamingRepoName: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
    flex: 1,
  },
  streamingRepoLang: {
    fontSize: 11,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
});
