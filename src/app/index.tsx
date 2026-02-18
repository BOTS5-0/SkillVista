import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { GitHubLoginScreen } from '@/screens/GitHubLoginScreen';

const AUTH_STORAGE_KEY = 'skillvista.auth.session';

export default function Index() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const storedSession = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (storedSession === 'true') {
          setIsAuthenticated(true);
          return;
        }
        setIsAuthenticated(false);
      } catch (error) {
        console.warn('Failed to load auth session', error);
        setIsAuthenticated(false);
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrapAuth();
  }, []);

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <GitHubLoginScreen />;
}
