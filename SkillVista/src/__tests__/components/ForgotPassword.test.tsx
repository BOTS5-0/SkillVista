import { validateLoginEmail } from '@/utils/loginValidators';

/**
 * Forgot Password Form Tests
 * Tests focus on email validation for password reset
 */

describe('Forgot Password Form Logic', () => {
  describe('Email validation for password reset', () => {
    it('should require email to be filled', () => {
      expect(validateLoginEmail('')).toBe('Email is required');
    });

    it('should validate email format', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
      ];

      invalidEmails.forEach((email) => {
        expect(validateLoginEmail(email)).toContain('valid email');
      });
    });

    it('should accept valid emails for password reset', () => {
      expect(validateLoginEmail('user@example.com')).toBeNull();
      expect(validateLoginEmail('reset@company.co.uk')).toBeNull();
      expect(validateLoginEmail('support+help@site.com')).toBeNull();
    });

    it('should handle edge case emails', () => {
      expect(validateLoginEmail('a@b.c')).toBeNull();
      expect(validateLoginEmail('test.email@domain.co.uk')).toBeNull();
    });
  });

  describe('Password reset flow scenarios', () => {
    it('should validate single email field', () => {
      const email = 'user@example.com';
      const error = validateLoginEmail(email);
      expect(error).toBeNull();
    });

    it('should reject invalid email variations', () => {
      const invalidVariations = [
        'user',
        'user@',
        '@domain.com',
        'user@domain',
        'user @domain.com',
        'user@domain .com',
      ];

      invalidVariations.forEach((email) => {
        expect(validateLoginEmail(email)).not.toBeNull();
      });
    });
  });
});
