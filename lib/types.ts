export type Avenue = "impact" | "accountability" | "data-first";

export const NONE_OF_ABOVE_INDEX = -1;

export type Suggestion = {
  headline: string;
  avenue: Avenue;
  confidence: number;
  rationale: string;
  risk_note: "laag" | "middel" | "hoog";
  evidence_needed: string;
};

export type RoundPayload = {
  round_number: number;
  suggestions: Suggestion[];
  selected_indices: number[];
  feedback_text: string;
  direction_tags: string[];
  user_revision_text: string;
};

