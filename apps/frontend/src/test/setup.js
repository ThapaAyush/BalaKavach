import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  try {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  } catch (_) {}
});

afterEach(() => {
  try {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  } catch (_) {}
});
