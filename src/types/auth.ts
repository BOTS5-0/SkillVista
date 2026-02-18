export interface LoginCredentials {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export type AuthMode = 'login' | 'signup';
