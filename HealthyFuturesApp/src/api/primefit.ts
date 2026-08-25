import { apiPost } from "./client";

export type PrimeFitResultPayload = {
  source: string;
  score: number;
  strongestArea: string;
  weakestArea: string;
  recommendation: string;
  summary: string;
};

export async function savePrimeFitResult(
  payload: PrimeFitResultPayload,
  token?: string | null
): Promise<{ success: boolean; record?: unknown }> {
  return apiPost<{ success: boolean; record?: unknown }>("/primefit-results", payload, token);
}
