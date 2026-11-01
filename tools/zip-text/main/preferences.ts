import { validateZipSettings } from './zip-validation';

export function validatePreferences(key: string, value: unknown) {
  if (key === 'zipTextSettings') validateZipSettings(value);
}
