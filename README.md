# SkillVista

SkillVista is an Expo + React Native app with a frontend-only authentication flow (login, registration, forgot password) and a simple home screen. Routing is handled in-app via state (no backend auth yet).

## Features
- Login form with validation
- Registration form with validation
- Forgot password flow
- Frontend-only navigation between auth screens and home
- Jest test suite for validators and components

## Tech Stack
- Expo
- React Native
- TypeScript
- Jest + @testing-library/react-native

## Getting Started

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npx expo start
```

Clear cache if needed:

```bash
npx expo start -c
```

## Tests

Run all tests:

```bash
npm test
```

## Project Structure

```text
src/
	app/
		index.tsx
		_layout.tsx
	components/
		LoginForm/
	screens/
		ForgotPasswordScreen/
		HomeScreen/
		LoginScreen/
	utils/
	types/
	__tests__/
```

## Navigation Flow

Navigation is controlled via local component state in `src/app/index.tsx`.

Screens:
- login (default)
- register
- forgot
- home

## Notes
- Backend integration is not wired yet.
- Authentication persistence is not implemented yet.