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

// Criteria the server scores automatically. A coach can still force any of them
// on or off; sending null hands control back to the score.
export type AutoCriterion = "character" | "effort" | "skill";

export type CriteriaCard = {
  items: CriterionItem[];
  met_count: number;
  total: number;
  attendance_pct: number;
  character_points: number;
  character_points_target: number;
  zenfit_checkins: number;
  effort_score: number | null;
  effort_target: number;
  effort_clips: number;
  skill_score: number;
  skill_target: number;
  skill_breakdown: { companion: string; direction: string; points: number }[];
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
  ratings: Partial<Record<RatedCriterion, boolean>> & {
    note?: string | null;
    // null = follow the score again.
    character_override?: boolean | null;
    effort_override?: boolean | null;
    skill_override?: boolean | null;
  },
  token?: string | null
): Promise<CriteriaCard> {
  return apiPut<CriteriaCard>("/criteria", { student_id: studentId, ...ratings }, token);
}
