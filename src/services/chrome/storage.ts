export async function getLocal<T>(key: string): Promise<T | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const res = await chrome.storage.local.get(key);
  return (res[key] as T | undefined) ?? null;
}

export async function setLocal(key: string, value: unknown): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [key]: value });
}
