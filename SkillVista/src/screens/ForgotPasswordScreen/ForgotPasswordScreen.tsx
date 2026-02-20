import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ForgotPasswordForm } from './ForgotPasswordForm';

interface ForgotPasswordScreenProps {
  onNavigateBack?: () => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  onNavigateBack,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleResetPassword = async (email: string) => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call when backend is provided
      console.log('Reset password for email:', email);

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Show success message
      Alert.alert(
        'Success',
        'Check your email for a password reset link. It may take a few minutes to arrive.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back to login
              onNavigateBack?.();
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to send reset email. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ForgotPasswordForm
          onSubmit={handleResetPassword}
          onCancel={onNavigateBack}
          isLoading={isLoading}
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
