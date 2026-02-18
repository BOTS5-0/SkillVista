import {
  validateUsername,
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateLoginForm,
} from '@/utils/validators';
import { LoginCredentials } from '@/types/auth';

describe('Validators', () => {
  describe('validateUsername', () => {
    it('should return error for empty username', () => {
      expect(validateUsername('')).toBe('Username is required');
    });

    it('should return error for whitespace only username', () => {
      expect(validateUsername('   ')).toBe('Username is required');
    });

    it('should return error for username less than 3 characters', () => {
      const error = validateUsername('ab');
      expect(error).toContain('3-20 characters');
    });

    it('should return error for username more than 20 characters', () => {
      const error = validateUsername('a'.repeat(21));
      expect(error).toContain('3-20 characters');
    });

    it('should return error for username with invalid characters', () => {
      const error = validateUsername('user@name');
      expect(error).toContain('letters, numbers, and underscores');
    });

    it('should accept valid username with letters', () => {
      expect(validateUsername('validuser')).toBeNull();
    });

    it('should accept valid username with numbers', () => {
      expect(validateUsername('user123')).toBeNull();
    });

    it('should accept valid username with underscores', () => {
      expect(validateUsername('valid_user')).toBeNull();
    });
  });

  describe('validateEmail', () => {
    it('should return error for empty email', () => {
      expect(validateEmail('')).toBe('Email is required');
    });

    it('should return error for invalid email format', () => {
      expect(validateEmail('invalidemail')).toContain('valid email');
      expect(validateEmail('invalid@')).toContain('valid email');
      expect(validateEmail('@invalid.com')).toContain('valid email');
    });

    it('should accept valid email', () => {
      expect(validateEmail('user@example.com')).toBeNull();
    });

    it('should accept email with subdomain', () => {
      expect(validateEmail('user@mail.example.com')).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should return error for empty password', () => {
      expect(validatePassword('')).toBe('Password is required');
    });

    it('should return error for password less than 8 characters', () => {
      expect(validatePassword('Pass1')).toContain('at least 8 characters');
    });

    it('should return error for password without uppercase letter', () => {
      expect(validatePassword('password123')).toContain('uppercase letter');
    });

    it('should return error for password without number', () => {
      expect(validatePassword('Password')).toContain('at least one number');
    });

    it('should accept valid password', () => {
      expect(validatePassword('ValidPass123')).toBeNull();
    });

    it('should accept valid password with special characters', () => {
      expect(validatePassword('ValidPass@123')).toBeNull();
    });
  });

  describe('validateConfirmPassword', () => {
    it('should return error for empty confirm password', () => {
      expect(validateConfirmPassword('Password123', '')).toContain('confirm');
    });

    it('should return error when passwords do not match', () => {
      expect(validateConfirmPassword('Password123', 'Password124')).toContain(
        'do not match'
      );
    });

    it('should accept matching passwords', () => {
      expect(validateConfirmPassword('Password123', 'Password123')).toBeNull();
    });
  });

  describe('validateLoginForm', () => {
    it('should return no errors for valid form', () => {
      const credentials: LoginCredentials = {
        username: 'validuser',
        email: 'user@example.com',
        password: 'ValidPass123',
        confirmPassword: 'ValidPass123',
      };
      const errors = validateLoginForm(credentials);
      expect(Object.keys(errors).length).toBe(0);
    });

    it('should return errors for all empty fields', () => {
      const credentials: LoginCredentials = {
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
      };
      const errors = validateLoginForm(credentials);
      expect(errors.username).toBeDefined();
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();
      expect(errors.confirmPassword).toBeDefined();
    });

    it('should return error for invalid email only', () => {
      const credentials: LoginCredentials = {
        username: 'validuser',
        email: 'invalidemail',
        password: 'ValidPass123',
        confirmPassword: 'ValidPass123',
      };
      const errors = validateLoginForm(credentials);
      expect(errors.email).toBeDefined();
      expect(errors.username).toBeUndefined();
      expect(errors.password).toBeUndefined();
    });

    it('should return error for mismatched passwords', () => {
      const credentials: LoginCredentials = {
        username: 'validuser',
        email: 'user@example.com',
        password: 'ValidPass123',
        confirmPassword: 'ValidPass124',
      };
      const errors = validateLoginForm(credentials);
      expect(errors.confirmPassword).toBeDefined();
    });
  });
});
