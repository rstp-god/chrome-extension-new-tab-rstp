import { getLocal, setLocal } from '@/services/chrome/storage.ts';
import { DEFAULT_HEADER_SETTINGS, HEADER_SETTINGS_KEY, HeaderSettingsV1 } from '@/types/header.ts';

export async function loadHeaderSettings(): Promise<HeaderSettingsV1> {
  return (await getLocal<HeaderSettingsV1>(HEADER_SETTINGS_KEY)) ?? DEFAULT_HEADER_SETTINGS;
}

export async function saveHeaderSettings(next: HeaderSettingsV1): Promise<void> {
  await setLocal(HEADER_SETTINGS_KEY, next);
}
