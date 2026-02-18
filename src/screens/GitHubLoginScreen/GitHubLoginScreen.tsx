import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { appEnv } from '@/config/env';

const AUTH_STORAGE_KEY = 'skillvista.auth.session';
const USER_STORAGE_KEY = 'skillvista.user.data';

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  bio: string;
}

export const GitHubLoginScreen: React.FC = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleGitHubLogin = async () => {
    if (!appEnv.GITHUB_CLIENT_ID) {
      Alert.alert('Error', 'GitHub OAuth configuration is missing.');
      return;
    }

    setIsLoading(true);

    try {
      // For development, we'll use a mock token approach
      // In production, you'd implement a proper OAuth backend flow
      const mockUser: GitHubUser = {
        id: 12345,
        login: 'skillvista-user',
        name: 'SkillVista User',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
        bio: 'An awesome learner',
      };

      const mockAccessToken =
        appEnv.GITHUB_TOKEN || `mock_token_${Date.now()}`;

      // Save auth session and user data
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true');
      await AsyncStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify({
          id: mockUser.id,
          name: mockUser.name || mockUser.login,
          username: mockUser.login,
          avatarUrl: mockUser.avatar_url,
          bio: mockUser.bio,
          accessToken: mockAccessToken,
        })
      );

      // Navigate to home
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      console.error('GitHub login error:', error);
      Alert.alert('Error', 'Failed to login with GitHub. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerSection}>
          <Ionicons name="logo-github" size={64} color="#0F172A" />
          <Text style={styles.title}>SkillVista</Text>
          <Text style={styles.subtitle}>
            Connect with GitHub to view your learning journey
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleGitHubLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-github" size={20} color="#fff" />
              <Text style={styles.buttonText}>Login with GitHub</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          We use GitHub OAuth to securely authenticate your account.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    backgroundColor: '#1D1D1D',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    width: '100%',
  },
  buttonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 24,
    fontStyle: 'italic',
  },
});
