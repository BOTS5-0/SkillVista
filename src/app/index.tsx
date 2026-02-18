import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { HomeScreen } from '@/screens/HomeScreen/HomeScreen';
import { ForgotPasswordScreen } from '@/screens/ForgotPasswordScreen';
import { LoginScreenComponent } from '@/screens/LoginScreen/LoginScreen.login';
import { LoginScreen as RegistrationScreen } from '@/screens/LoginScreen/LoginScreen';

type AuthScreen = 'login' | 'register' | 'home' | 'forgot';

const AUTH_STORAGE_KEY = 'skillvista.auth.session';

export default function Index() {
  const [currentScreen, setCurrentScreen] = useState<AuthScreen>('login');
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const storedSession = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (storedSession === 'true') {
          setCurrentScreen('home');
          return;
        }
        setCurrentScreen('login');
      } catch (error) {
        console.warn('Failed to load auth session', error);
        setCurrentScreen('login');
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrapAuth();
  }, []);

  const handleNavigateToSignUp = () => {
    setCurrentScreen('register');
  };

  const handleNavigateToLogin = () => {
    setCurrentScreen('login');
  };

  const handleNavigateToForgotPassword = () => {
    setCurrentScreen('forgot');
  };

  const handleLoginSuccess = async () => {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true');
    setCurrentScreen('home');
  };

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (currentScreen === 'register') {
    return (
      <RegistrationScreen 
        onNavigateBack={handleNavigateToLogin}
        onRegistrationSuccess={handleLoginSuccess}
      />
    );
  }

  if (currentScreen === 'home') {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  if (currentScreen === 'forgot') {
    return <ForgotPasswordScreen onNavigateBack={handleNavigateToLogin} />;
  }

  return (
    <LoginScreenComponent 
      onNavigateToSignUp={handleNavigateToSignUp}
      onNavigateToForgotPassword={handleNavigateToForgotPassword}
      onLoginSuccess={handleLoginSuccess}
    />
  );
}
