export type ThemeMode = "light" | "dark";

export type HeaderSettingsV1 = {
  version: 1;
  displayName: string | null;
  theme: ThemeMode;
  pinned: boolean;
  language: 'en' | 'ru';
};

export const HEADER_SETTINGS_KEY = "header-settings:v1";

export const DEFAULT_HEADER_SETTINGS: HeaderSettingsV1 = {
  version: 1,
  displayName: null,
  theme: "dark",
  pinned: true,
  language: 'en',
};
