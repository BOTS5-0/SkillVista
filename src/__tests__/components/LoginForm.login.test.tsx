import { validateLoginForm } from '@/utils/loginValidators';
import { LoginCredentials } from '@/utils/loginValidators';

/**
 * Login Form Tests
 * Tests focus on the form's validation logic and data handling
 */

describe('Login Form Logic', () => {
  describe('Form submission handling', () => {
    it('should validate form before submission', () => {
      const credentials: LoginCredentials = {
        email: '',
        password: '',
      };

      const errors = validateLoginForm(credentials);
      expect(Object.keys(errors).length).toBeGreaterThan(0);
    });

    it('should allow submission with valid data', () => {
      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'ValidPass123',
      };

      const errors = validateLoginForm(credentials);
      expect(Object.keys(errors).length).toBe(0);
    });
  });

  describe('Input validation scenarios', () => {
    it('should validate all fields required', () => {
      const credentials: LoginCredentials = {
        email: '',
        password: '',
      };

      const errors = validateLoginForm(credentials);
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();
    });

    it('should validate email format strictly', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
      ];

      invalidEmails.forEach((email) => {
        const credentials: LoginCredentials = {
          email: email,
          password: 'ValidPass123',
        };

        const errors = validateLoginForm(credentials);
        expect(errors.email).toBeDefined();
        expect(errors.email).toContain('valid email');
      });
    });

    it('should validate password length requirement', () => {
      const credentials: LoginCredentials = {
        email: 'user@example.com',
        password: 'short',
      };

      const errors = validateLoginForm(credentials);
      expect(errors.password).toBeDefined();
      expect(errors.password).toContain('at least 8 characters');
    });

    it('should accept valid credentials without errors', () => {
      const validCases = [
        {
          email: 'simple@example.com',
          password: 'Password1',
        },
        {
          email: 'user.name@company.co.uk',
          password: 'MyP@ssw0rd2024',
        },
        {
          email: 'test+tag@example.com',
          password: 'SecurePass123',
        },
      ];

      validCases.forEach((credentials) => {
        const errors = validateLoginForm(credentials);
        expect(Object.keys(errors).length).toBe(0);
      });
    });
  });

  describe('Form state transitions', () => {
    it('should handle valid to invalid transitions', () => {
      let credentials: LoginCredentials = {
        email: 'user@example.com',
        password: 'ValidPass123',
      };

      let errors = validateLoginForm(credentials);
      expect(Object.keys(errors).length).toBe(0);

      // Change password to invalid
      credentials.password = 'short';
      errors = validateLoginForm(credentials);
      expect(errors.password).toBeDefined();
    });

    it('should clear specific field errors independently', () => {
      const credentials: LoginCredentials = {
        email: 'invalidemail',
        password: 'weak',
      };

      let errors = validateLoginForm(credentials);
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();

      // Fix password
      credentials.password = 'ValidPass123';
      errors = validateLoginForm(credentials);
      expect(errors.password).toBeUndefined();
      expect(errors.email).toBeDefined(); // Email error should still exist
    });

    it('should handle minimum length password edge case', () => {
      const credentials: LoginCredentials = {
        email: 'user@example.com',
        password: '7CharPass', // Exactly 9 characters
      };

      const errors = validateLoginForm(credentials);
      expect(errors.password).toBeUndefined();
    });
  });
});
