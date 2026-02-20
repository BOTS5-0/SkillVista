import { LoginCredentials as RegCredentials } from '@/types/auth';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginErrors {
  email?: string;
  password?: string;
  form?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateLoginEmail = (email: string): string | null => {
  if (!email || email.trim() === '') {
    return 'Email is required';
  }
  if (!EMAIL_REGEX.test(email)) {
    return 'Please enter a valid email address';
  }
  return null;
};

export const validateLoginPassword = (password: string): string | null => {
  if (!password || password === '') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  return null;
};

export const validateLoginForm = (
  credentials: LoginCredentials
): LoginErrors => {
  const errors: LoginErrors = {};

  const emailError = validateLoginEmail(credentials.email);
  if (emailError) errors.email = emailError;

  const passwordError = validateLoginPassword(credentials.password);
  if (passwordError) errors.password = passwordError;

  return errors;
};
