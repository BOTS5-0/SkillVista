import React, { useState } from 'react';
import { HomeScreen } from '@/screens/HomeScreen/HomeScreen';
import { ForgotPasswordScreen } from '@/screens/ForgotPasswordScreen';
import { LoginScreenComponent } from '@/screens/LoginScreen/LoginScreen.login';
import { LoginScreen as RegistrationScreen } from '@/screens/LoginScreen/LoginScreen';

type AuthScreen = 'login' | 'register' | 'home' | 'forgot';

export default function Index() {
  const [currentScreen, setCurrentScreen] = useState<AuthScreen>('login');

  const handleNavigateToSignUp = () => {
    setCurrentScreen('register');
  };

  const handleNavigateToLogin = () => {
    setCurrentScreen('login');
  };

  const handleNavigateToForgotPassword = () => {
    setCurrentScreen('forgot');
  };

  const handleLoginSuccess = () => {
    setCurrentScreen('home');
  };

  if (currentScreen === 'register') {
    return (
      <RegistrationScreen 
        onNavigateBack={handleNavigateToLogin}
        onRegistrationSuccess={handleLoginSuccess}
      />
    );
  }

  if (currentScreen === 'home') {
    return <HomeScreen />;
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
