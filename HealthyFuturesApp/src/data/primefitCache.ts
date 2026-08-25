import * as SecureStore from "expo-secure-store";

const KEY = "healthy_futures_last_primefit_score";

export async function cacheLatestPrimeFitScore(score: number): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ score, savedAt: Date.now() }));
}

export async function getLatestPrimeFitScore(): Promise<{ score: number; savedAt: number } | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
