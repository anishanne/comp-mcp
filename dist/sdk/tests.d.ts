import { SupabaseClient } from "@supabase/supabase-js";
/**
 * Resolve test_taker_id → { front_id, taker_name, student_id, team_id }.
 * front_id is always a number (or null), pulled from the canonical source:
 * student_events.front_id for individuals, teams.front_id for team tests.
 */
export declare function enrichTakers(supabase: SupabaseClient, takerIds: number[]): Promise<Map<number, {
    test_taker_id: number;
    student_id: string | null;
    team_id: number | null;
    taker_name: string | null;
    front_id: number | null;
}>>;
export declare function createTestsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** List all tests for an event */
    list(eventId: number): Promise<any[]>;
    /** Get test details */
    get(testId: number): Promise<any>;
    /** Get test problems */
    getProblems(testId: number): Promise<any[]>;
    /** Get test takers with details */
    getTestTakers(testId: number): Promise<any[]>;
    /** Get graded test answers */
    getResults(testId: number): Promise<any[]>;
    /** Get scan grading progress stats */
    getScanGradeStats(testId: number): Promise<{
        totalProblems: any;
        gradedProblems: any;
        conflictProblems: any;
    }>;
    /**
     * Unified leaderboard. Works for online tests (graded_test_answers),
     * in-person scan-graded tests (scan_grades), and Guts / manual-graded tests
     * (manual_grades) — including hybrid tests that mix sources.
     *
     * Every row has front_id (user-facing) + display_name. `scoreBreakdown`
     * shows where the points came from. Ties broken by earliest contributing
     * timestamp (online edit / scan-grade time / manual_grades.graded_at).
     */
    getLeaderboard(testId: number, options?: {
        limit?: number;
    }): Promise<{
        rank: number;
        front_id: number | null;
        display_name: string | null;
        entity_type: "student" | "team";
        test_taker_id: number | null;
        student_id: string | null;
        team_id: number | null;
        totalScore: number;
        problemCount: number;
        lastSubmittedAt: string | null;
        scoreBreakdown: Record<import("./scoring.js").ScoreSource, number>;
    }[]>;
    /**
     * Per-problem stats across all 3 sources (online + scan + manual).
     * `attempted` = entities with any non-unanswered state for this problem;
     * `correct` = entities whose final state is "correct"; `unsure` /
     * `conflict` / `ungraded` are reported separately so analysts can spot
     * stuck problems on in-person tests.
     */
    getProblemStats(testId: number): Promise<{
        test_problem_id: number;
        problem_number: number;
        page_number: number;
        totalPoints: number;
        attempted: number;
        correct: number;
        incorrect: number;
        unsure: number;
        conflict: number;
        ungraded: number;
        avgScore: number | null;
    }[]>;
    /**
     * Find all takers who submitted an exact answer to a specific problem (or anywhere in a test).
     * Provide either `test_problem_id` directly, or `testId` + `problem_number`.
     * Returns graded_test_answers rows enriched with taker (student_id / team_id / taker_name).
     */
    findAnswers(params: {
        testId?: number;
        test_problem_id?: number;
        problem_number?: number;
        answer: string;
        limit?: number;
    }): Promise<any[]>;
    /**
     * Find groups of takers who submitted the same answer to the same problem.
     * When `windowSeconds` > 0, only takers whose `last_edited_time` fits in a sliding
     * window of that size are grouped together (collusion / simultaneous-submission detection).
     * When `windowSeconds` is 0 (default), every matching-answer cohort is returned regardless of time.
     */
    findAnswerCollisions(testId: number, options?: {
        windowSeconds?: number;
        minGroupSize?: number;
        problemNumbers?: number[];
        onlyIncorrect?: boolean;
    }): Promise<{
        test_problem_id: number;
        problem_number: number | null;
        answer_latex: string;
        windowSpanSeconds: number | null;
        takers: Array<{
            front_id: number | null;
            display_name: string | null;
            test_taker_id: number;
            student_id: string | null;
            team_id: number | null;
            last_edited_time: string | null;
            score: number | null;
            correct: boolean | null;
        }>;
    }[]>;
    /**
     * Full per-problem score breakdown for ONE entity on this test.
     * Looks up by front_id (preferred) or test_taker_id. Returns the merged
     * online + scan + manual view. `perProblem` is keyed by problem_number.
     */
    getTakerScore(testId: number, params: {
        front_id?: number;
        test_taker_id?: number;
    }): Promise<{
        rank: number;
        front_id: number | null;
        display_name: string | null;
        entity_type: "student" | "team";
        test_taker_id: number | null;
        student_id: string | null;
        team_id: number | null;
        totalScore: number;
        problemCount: number;
        lastSubmittedAt: string | null;
        scoreBreakdown: Record<import("./scoring.js").ScoreSource, number>;
        perProblem: Record<number, {
            test_problem_id: number;
            problem_number: number | null;
            source: string;
            state: string;
            points: number;
            answer_latex: string | null | undefined;
            lastEditedAt: string | null;
        }>;
    } | null>;
    /**
     * Per-problem in-person scan grading state.
     *
     * For each (test_problem_id, scan_id), report total grader claims, the
     * resolved final state (correct/incorrect/unsure/conflict/ungraded), and
     * whether the resolution came from an admin override. Aggregated to a
     * per-problem rollup: counts of fully graded / conflicted / overridden /
     * still-ungraded scans.
     *
     * Use getScanGradeStats() for the legacy 3-number summary.
     */
    getScanGradingProgress(testId: number): Promise<{
        scansTotal: number;
        graded: number;
        conflicts: number;
        overridden: number;
        ungraded: number;
        unsure: number;
        correct: number;
        incorrect: number;
        test_problem_id: any;
        problem_number: any;
        page_number: any;
        totalPoints: any;
    }[]>;
    /**
     * Guts / manual scoreboard. Reads manual_grades directly so callers see
     * raw status strings ("correct", "incorrect", null, ...) per (team, problem).
     * For the unified score, prefer getLeaderboard.
     */
    getGutsScoreboard(testId: number): Promise<{
        front_id: number | null;
        team_id: number;
        team_name: string | null;
        totalScore: number;
        correctCount: number;
        problems: Record<number, {
            status: string | null;
            score: number;
            answer_latex: string | null;
            graded_at: string | null;
        }>;
        lastGradedAt: string | null;
        rank: number;
    }[]>;
    /**
     * Frequency histogram of every distinct answer to one problem, with
     * correctness and total takers behind each. Powerful for spotting:
     *   - clusters of identical wrong answers (collusion / shared notes)
     *   - off-by-one popular answers (taught the wrong method)
     *   - high concentration on a single distractor
     */
    getAnswerHistogram(testId: number, problem_number: number): Promise<{
        test_problem_id: any;
        problem_number: number;
        totalAttempts: number;
        distinctAnswers: number;
        answers: {
            answer_latex: string;
            count: number;
            frequency: number;
            correct: boolean | null;
            pointsEach: number;
        }[];
    }>;
    /**
     * Chronological submission timeline for ONE taker on this test. Returns
     * every graded_test_answers row sorted by last_edited_time. Forensic
     * tool: spot bursts, long gaps, weird ordering, end-of-test cramming.
     *
     * Online-only — scan grades and manual grades have no per-submission
     * timestamps from the taker (only from the grader).
     */
    getTakerTimeline(testId: number, params: {
        front_id?: number;
        test_taker_id?: number;
    }): Promise<{
        test_taker_id: number | undefined;
        front_id: number | null;
        events: {
            test_problem_id: any;
            problem_number: any;
            answer_latex: any;
            correct: any;
            score: any;
            last_edited_time: any;
            secondsSincePrev: number | null;
        }[];
    } | null>;
    /**
     * Find takers who submitted a burst of `minAnswers` answers within
     * `withinSeconds`. Catches bulk-paste / scripted-submit / "answered
     * everything in the last 10 seconds" patterns.
     */
    findRapidSubmissions(testId: number, options?: {
        minAnswers?: number;
        withinSeconds?: number;
        onlyIncorrect?: boolean;
    }): Promise<{
        front_id: any;
        display_name: any;
        test_taker_id: number;
        student_id: any;
        team_id: any;
        startedAt: string;
        endedAt: string;
        spanSeconds: number;
        answerCount: number;
        answersPerSecond: number | null;
        answers: {
            problem_number: number | null;
            answer_latex: string;
            correct: boolean | null;
            score: number | null;
            last_edited_time: string;
        }[];
    }[]>;
    /**
     * Pairwise similarity across all takers on this test: how many problems
     * they answered identically. Strong cheating signal when sustained across
     * many problems, especially incorrect ones (matching wrong answers is
     * far more diagnostic than matching correct ones — distractors aren't
     * uniformly distributed but right answers are).
     *
     * Returns pairs sorted by score (sharedIncorrect weighted 3x).
     */
    findSimilarTakers(testId: number, options?: {
        minShared?: number;
        limit?: number;
        problemNumbers?: number[];
    }): Promise<{
        score: number;
        sharedTotal: number;
        sharedCorrect: number;
        sharedIncorrect: number;
        takerA: {
            front_id: any;
            display_name: any;
            test_taker_id: number;
            student_id: any;
            team_id: any;
        };
        takerB: {
            front_id: any;
            display_name: any;
            test_taker_id: number;
            student_id: any;
            team_id: any;
        };
        sharedProblems: {
            problem_number: number | null;
            test_problem_id: number;
            answer_latex: string;
            correct: boolean | null;
        }[];
    }[]>;
};
