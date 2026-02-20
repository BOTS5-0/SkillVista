import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginForm } from '@/components/LoginForm/LoginForm.login';
import { LoginCredentials } from '@/utils/loginValidators';
import { api } from '@/services/api';

interface LoginScreenProps {
  onNavigateToForgotPassword?: () => void;
  onNavigateToSignUp?: () => void;
  onLoginSuccess?: () => void;
}

export const LoginScreenComponent: React.FC<LoginScreenProps> = ({
  onNavigateToForgotPassword,
  onNavigateToSignUp,
  onLoginSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      // Call actual API
      const response = await api.login(credentials.email, credentials.password);
      
      console.log('Login successful:', response.user.email);

      if (onLoginSuccess) {
        onLoginSuccess();
        return;
      }

      console.log('User logged in, navigate to dashboard');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Login failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <LoginForm
          onSubmit={handleLogin}
          isLoading={isLoading}
          onForgotPassword={onNavigateToForgotPassword}
          onSignUp={onNavigateToSignUp}
        />
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
});
