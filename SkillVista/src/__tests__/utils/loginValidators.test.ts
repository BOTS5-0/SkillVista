import {
  validateLoginEmail,
  validateLoginPassword,
  validateLoginForm,
} from '@/utils/loginValidators';
import { LoginCredentials } from '@/utils/loginValidators';

describe('Login Validators', () => {
  describe('validateLoginEmail', () => {
    it('should return error for empty email', () => {
      expect(validateLoginEmail('')).toBe('Email is required');
    });

    it('should return error for whitespace only email', () => {
      expect(validateLoginEmail('   ')).toBe('Email is required');
    });

    it('should return error for invalid email format', () => {
      expect(validateLoginEmail('invalidemail')).toContain('valid email');
      expect(validateLoginEmail('invalid@')).toContain('valid email');
      expect(validateLoginEmail('@invalid.com')).toContain('valid email');
    });

    it('should accept valid email', () => {
      expect(validateLoginEmail('user@example.com')).toBeNull();
    });

    it('should accept email with subdomain', () => {
      expect(validateLoginEmail('user@mail.example.com')).toBeNull();
    });
  });

  describe('validateLoginPassword', () => {
    it('should return error for empty password', () => {
      expect(validateLoginPassword('')).toBe('Password is required');
    });

    it('should return error for password less than 8 characters', () => {
      expect(validateLoginPassword('Pass1')).toContain('at least 8 characters');
    });

    it('should accept valid password', () => {
      expect(validateLoginPassword('ValidPass123')).toBeNull();
    });

    it('should accept password with special characters', () => {
      expect(validateLoginPassword('ValidPass@123')).toBeNull();
    });

    it('should accept exact 8 character password', () => {
      expect(validateLoginPassword('Pass1234')).toBeNull();
    });
  });

  describe('validateLoginForm', () => {
    it('should return no errors for valid form', () => {
      const credentials: LoginCredentials = {
        email: 'user@example.com',
        password: 'ValidPass123',
      };
      const errors = validateLoginForm(credentials);
      expect(Object.keys(errors).length).toBe(0);
    });

    it('should return errors for all empty fields', () => {
      const credentials: LoginCredentials = {
        email: '',
        password: '',
      };
      const errors = validateLoginForm(credentials);
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();
    });

    it('should return error for invalid email only', () => {
      const credentials: LoginCredentials = {
        email: 'invalidemail',
        password: 'ValidPass123',
      };
      const errors = validateLoginForm(credentials);
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeUndefined();
    });

    it('should return error for weak password only', () => {
      const credentials: LoginCredentials = {
        email: 'user@example.com',
        password: 'weak',
      };
      const errors = validateLoginForm(credentials);
      expect(errors.password).toBeDefined();
      expect(errors.email).toBeUndefined();
    });
  });
});
