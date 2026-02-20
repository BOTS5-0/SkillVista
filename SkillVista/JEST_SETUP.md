# Jest Testing Setup

Jest has been configured for your SkillVista project. You can now write and run tests continuously.

## Available Commands

- **`npm test`** - Run all tests once
- **`npm run test:watch`** - Run tests in watch mode (re-runs on file changes)
- **`npm run test:coverage`** - Run tests and generate coverage report

## File Structure

Tests should be placed in the `src/__tests__/` directory or alongside your source files with `.test.ts` or `.spec.ts` extensions.

### Example paths:
- `src/__tests__/example.test.ts` - Tests in dedicated test directory
- `src/components/Button.test.ts` - Tests co-located with source

## Writing Tests

Here's a basic test example:

```typescript
describe('MyComponent', () => {
  it('should render correctly', () => {
    const result = myFunction();
    expect(result).toBe(expectedValue);
  });
});
```

## Configuration Files

- **`jest.config.js`** - Main Jest configuration
- **`jest.setup.js`** - Global test setup file (runs before all tests)
- **`.babelrc`** - Babel configuration for transforming TypeScript/JSX

## Path Aliases

The Jest configuration supports your TypeScript path alias:
- `@/*` maps to `src/*`

You can import using: `import { something } from '@/components/...'`

## Coverage Reports

When you run `npm run test:coverage`, a coverage report is generated showing:
- Statement coverage
- Branch coverage
- Function coverage
- Line coverage

## Next Steps

1. Replace the example test with your own tests
2. Create test files for your components
3. Run `npm run test:watch` during development for instant feedback
