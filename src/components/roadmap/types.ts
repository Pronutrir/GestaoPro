export interface RoadmapItem {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  status: string;
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  score: number | null;
  target_quarter: string | null;
  project_id: string | null;
  created_at: string;
}
