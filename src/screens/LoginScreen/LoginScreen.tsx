import React, { useState } from 'react';
import { View, StyleSheet, Alert, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginForm } from '@/components/LoginForm/LoginForm';
import { LoginCredentials } from '@/types/auth';

interface RegistrationScreenProps {
  onNavigateBack?: () => void;
  onRegistrationSuccess?: () => void;
}

export const LoginScreen: React.FC<RegistrationScreenProps> = ({
  onNavigateBack,
  onRegistrationSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call when backend is provided
      // For now, just simulate a successful login
      console.log('Login attempt with:', {
        username: credentials.username,
        email: credentials.email,
      });

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (onRegistrationSuccess) {
        onRegistrationSuccess();
        return;
      }

      console.log('User logged in, navigate to dashboard');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'An error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <LoginForm onSubmit={handleLogin} isLoading={isLoading} />
        {onNavigateBack && (
          <View style={styles.backButtonContainer}>
            <Text style={styles.backText}>Already have an account? </Text>
            <TouchableOpacity onPress={onNavigateBack}>
              <Text style={styles.backLink}>Login</Text>
            </TouchableOpacity>
          </View>
        )}
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
    padding: 16,
  },
  backButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  backText: {
    fontSize: 14,
    color: '#666',
  },
  backLink: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
});
