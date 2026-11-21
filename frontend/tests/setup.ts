import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetMockState } from '../src/adapters/mock/store';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetMockState();
  window.history.replaceState({}, '', '/');
});
