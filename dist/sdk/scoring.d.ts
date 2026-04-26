import { SupabaseClient } from "@supabase/supabase-js";
/**
 * Unified per-test scoring across all 3 score sources:
 *   - online   : graded_test_answers view (test_answers + answer key)
 *   - scan     : scan_grades + scans (in-person paper grading)
 *   - manual   : manual_grades (Guts / team manual grading)
 *
 * Tests can be hybrid (e.g. a Standard test could have both an online
 * portion and scanned overflow). We sum per source and report a per-source
 * breakdown so analysts can see where points came from.
 *
 * Output is keyed by the canonical user-facing entity (front_id +
 * entity_type), not by test_taker_id, because in-person scanned tests
 * frequently have no test_takers row at all (scans.taker_id is the
 * front_id, written directly).
 */
export type ScoreSource = "online" | "scan" | "manual";
export type GradeState = "correct" | "incorrect" | "unsure" | "conflict" | "ungraded" | "unanswered";
export interface ProblemScore {
    test_problem_id: number;
    problem_number: number | null;
    source: ScoreSource;
    state: GradeState;
    points: number;
    /** Latest contributing edit/grade timestamp for tie-breaking. */
    lastEditedAt: string | null;
    /** Free-text answer when known (online + manual). null for scan. */
    answer_latex?: string | null;
}
export interface EntityScore {
    /** Canonical user-facing identifier. May be null for malformed rows. */
    front_id: number | null;
    /** "team" for team tests / Guts; "student" otherwise. */
    entity_type: "team" | "student";
    display_name: string | null;
    student_id: string | null;
    team_id: number | null;
    /** Populated when an online test_takers row exists. May be null for pure-scan entities. */
    test_taker_id: number | null;
    totalScore: number;
    problemCount: number;
    lastSubmittedAt: string | null;
    /** Per-source totals (0 when source contributed nothing). */
    scoreBreakdown: Record<ScoreSource, number>;
    /** Per-test-problem-id detail. Only includes problems with a contributing row. */
    perProblem: Record<number, ProblemScore>;
}
export interface TestScores {
    testId: number;
    isTeam: boolean;
    /** Sources that contributed at least one row. */
    sources: ScoreSource[];
    problems: Array<{
        test_problem_id: number;
        problem_number: number;
        page_number: number;
        points: number;
    }>;
    /** Already sorted: highest totalScore first, earliest lastSubmittedAt as tiebreaker. */
    entities: EntityScore[];
}
export declare function resolveTestScores(supabase: SupabaseClient, testId: number): Promise<TestScores>;
