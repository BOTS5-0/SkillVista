import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { mockProfile } from '@/data/mockData';

export const HomeScreen: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

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
          <Image source={{ uri: mockProfile.avatarUrl }} style={styles.avatar} />
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
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>You are logged in.</Text>
      </View>

    </SafeAreaView>
  );
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});
