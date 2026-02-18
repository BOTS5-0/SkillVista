import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { mockProfile } from '@/data/mockData';

const AUTH_STORAGE_KEY = 'skillvista.auth.session';

export const SettingsScreen: React.FC = () => {
  const router = useRouter();
  const [isProfilePublic, setIsProfilePublic] = useState(true);

  const handleOpenExternal = async (url?: string) => {
    if (!url) {
      Alert.alert('Not available', 'No linked account found yet.');
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Unable to open link', 'Please try again later.');
      return;
    }
    await Linking.openURL(url);
  };

  const handleUploadCertificateImage = () => {
    Alert.alert('Upload', 'Certificate image upload will be available soon.');
  };

  const handleUploadCertificateLink = () => {
    Alert.alert('Upload', 'Certificate link upload will be available soon.');
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Integrations</Text>
          <View style={styles.iconRow}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => handleOpenExternal(mockProfile.githubUrl)}
            >
              <Ionicons name="logo-github" size={22} color="#0F172A" />
              <Text style={styles.iconLabel}>Connect GitHub</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => handleOpenExternal(mockProfile.notionUrl)}
            >
              <Ionicons name="document-text-outline" size={22} color="#0F172A" />
              <Text style={styles.iconLabel}>Connect Notion</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Certificates</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleUploadCertificateImage}
          >
            <Ionicons name="image-outline" size={20} color="#1D4ED8" />
            <Text style={styles.actionLabel}>Upload certificate image</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleUploadCertificateLink}
          >
            <Ionicons name="link-outline" size={20} color="#1D4ED8" />
            <Text style={styles.actionLabel}>Add certificate link</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Public profile</Text>
            <Switch
              value={isProfilePublic}
              onValueChange={setIsProfilePublic}
              thumbColor={isProfilePublic ? '#1D4ED8' : '#CBD5F5'}
              trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            <Text style={styles.logoutLabel}>Log out</Text>
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
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
  iconRow: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  iconLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionLabel: {
    marginLeft: 10,
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 14,
    color: '#0F172A',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  logoutLabel: {
    marginLeft: 10,
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
});
