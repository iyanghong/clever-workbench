import { expect, test } from 'vitest';
import { modelDownloadProgress } from '../electron/local-ollama';

test('model layer changes reset byte counts and cannot report over 100 percent', () => {
  const weights = modelDownloadProgress(
    { digest: '', completed: 0, total: 0 },
    { digest: 'weights', total: 2_500_000_000, completed: 2_500_000_000 },
  );
  const license = modelDownloadProgress(weights, { digest: 'license', total: 1512 });
  expect(license).toEqual({ digest: 'license', total: 1512, completed: 0 });
  expect(
    modelDownloadProgress(license, { digest: 'license', total: 1512, completed: 5000 }).completed,
  ).toBe(1512);
});
