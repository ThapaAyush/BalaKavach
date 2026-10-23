import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  try {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  } catch (_) {}
});

afterEach(() => {
  try {
    cleanup();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  } catch (_) {}
});
