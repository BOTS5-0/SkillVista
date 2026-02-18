import React, { useState } from 'react';
import { LoginScreenComponent } from '@/screens/LoginScreen/LoginScreen.login';
import { LoginScreen as RegistrationScreen } from '@/screens/LoginScreen/LoginScreen';

type AuthScreen = 'login' | 'register';

export default function Index() {
  const [currentScreen, setCurrentScreen] = useState<AuthScreen>('login');

  const handleNavigateToSignUp = () => {
    setCurrentScreen('register');
  };

  const handleNavigateToLogin = () => {
    setCurrentScreen('login');
  };

  if (currentScreen === 'register') {
    return (
      <RegistrationScreen 
        onNavigateBack={handleNavigateToLogin}
      />
    );
  }

  return (
    <LoginScreenComponent 
      onNavigateToSignUp={handleNavigateToSignUp}
    />
  );
}
