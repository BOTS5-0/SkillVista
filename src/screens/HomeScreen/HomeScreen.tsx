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
import { api, GitHubSyncResponse } from '@/services/api';
import { mockProfile } from '@/data/mockData';

export const HomeScreen: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [githubData, setGithubData] = useState<GitHubSyncResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      loadUserData();
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

  const loadGitHubData = async () => {
    setIsLoading(true);
    try {
      const data = await api.syncGitHubRepos();
      setGithubData(data);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load GitHub data');
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

          {!githubData && (
            <TouchableOpacity
              style={styles.syncButton}
              onPress={loadGitHubData}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-github" size={18} color="#fff" />
                  <Text style={styles.syncButtonText}>Sync GitHub Profile</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {githubData && (
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
                  <View key={idx} style={styles.skillBadge}>
                    <Text style={styles.skillText}>{skill.skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
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
});
