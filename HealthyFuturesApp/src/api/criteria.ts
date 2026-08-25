import { apiGet, apiPut } from "./client";

export type RatedCriterion =
  | "attitude"
  | "effort"
  | "coachability"
  | "skill"
  | "character"
  | "academics";

export type CriterionItem = {
  key: RatedCriterion | "attendance";
  label: string;
  met: boolean;
  auto: boolean;
  detail: string | null;
};

export type CriteriaCard = {
  items: CriterionItem[];
  met_count: number;
  total: number;
  attendance_pct: number;
  note: string | null;
  rated: boolean;
  updated_at: string | null;
};

export const RATED_CRITERIA: RatedCriterion[] = [
  "attitude",
  "effort",
  "coachability",
  "skill",
  "character",
  "academics",
];

export async function getCriteria(
  studentId: string | undefined,
  token?: string | null
): Promise<CriteriaCard> {
  const query = studentId ? `?student_id=${encodeURIComponent(studentId)}` : "";
  return apiGet<CriteriaCard>(`/criteria${query}`, token);
}

export async function rateCriteria(
  studentId: string,
  ratings: Partial<Record<RatedCriterion, boolean>> & { note?: string | null },
  token?: string | null
): Promise<CriteriaCard> {
  return apiPut<CriteriaCard>("/criteria", { student_id: studentId, ...ratings }, token);
}
