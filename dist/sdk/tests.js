import { resolveTestScores } from "./scoring.js";
function assertEventAllowed(eventId, eventIds) {
    if (!eventIds.includes(eventId)) {
        throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
    }
}
/**
 * Resolve test_taker_id → { front_id, taker_name, student_id, team_id }.
 * front_id is always a number (or null), pulled from the canonical source:
 * student_events.front_id for individuals, teams.front_id for team tests.
 */
export async function enrichTakers(supabase, takerIds) {
    const out = new Map();
    if (takerIds.length === 0)
        return out;
    const { data: takers, error: tErr } = await supabase
        .from("test_takers_detailed")
        .select("test_taker_id, test_id, student_id, team_id, taker_name")
        .in("test_taker_id", takerIds);
    if (tErr)
        throw tErr;
    const studentIds = [
        ...new Set((takers || [])
            .map((t) => t.student_id)
            .filter((x) => x != null)),
    ];
    const teamIds = [
        ...new Set((takers || [])
            .map((t) => t.team_id)
            .filter((x) => x != null)),
    ];
    const studentFrontId = new Map();
    const teamFrontId = new Map();
    if (studentIds.length > 0) {
        const { data: se, error: seErr } = await supabase
            .from("student_events")
            .select("student_id, front_id")
            .in("student_id", studentIds);
        if (seErr)
            throw seErr;
        for (const r of se || [])
            studentFrontId.set(r.student_id, r.front_id);
    }
    if (teamIds.length > 0) {
        const { data: tm, error: tmErr } = await supabase
            .from("teams")
            .select("team_id, front_id")
            .in("team_id", teamIds);
        if (tmErr)
            throw tmErr;
        for (const r of tm || [])
            teamFrontId.set(r.team_id, r.front_id);
    }
    for (const t of takers || []) {
        const fid = t.team_id != null
            ? teamFrontId.get(t.team_id) ?? null
            : t.student_id != null
                ? studentFrontId.get(t.student_id) ?? null
                : null;
        out.set(t.test_taker_id, {
            test_taker_id: t.test_taker_id,
            student_id: t.student_id,
            team_id: t.team_id,
            taker_name: t.taker_name,
            front_id: fid,
        });
    }
    return out;
}
export function createTestsSDK(supabase, eventIds) {
    return {
        /** List all tests for an event */
        async list(eventId) {
            assertEventAllowed(eventId, eventIds);
            const { data, error } = await supabase
                .from("tests")
                .select("*")
                .eq("event_id", eventId)
                .order("test_name");
            if (error)
                throw error;
            return data;
        },
        /** Get test details */
        async get(testId) {
            const { data, error } = await supabase
                .from("tests_detailed")
                .select("*")
                .eq("test_id", testId)
                .single();
            if (error)
                throw error;
            if (data.event_id)
                assertEventAllowed(data.event_id, eventIds);
            return data;
        },
        /** Get test problems */
        async getProblems(testId) {
            const { data, error } = await supabase
                .from("test_problems")
                .select("*")
                .eq("test_id", testId)
                .order("problem_number");
            if (error)
                throw error;
            return data;
        },
        /** Get test takers with details */
        async getTestTakers(testId) {
            // Get test info first to check is_team
            const { data: testInfo, error: testError } = await supabase
                .from("tests")
                .select("is_team, event_id")
                .eq("test_id", testId)
                .single();
            if (testError)
                throw testError;
            assertEventAllowed(testInfo.event_id, eventIds);
            const { data, error } = await supabase
                .from("test_takers_detailed")
                .select("*")
                .eq("test_id", testId);
            if (error)
                throw error;
            // For individual tests, enrich with front_id
            if (!testInfo.is_team) {
                const studentIds = data
                    .map((t) => t.student_id)
                    .filter((id) => id != null);
                if (studentIds.length > 0) {
                    const { data: studentData, error: studentError } = await supabase
                        .from("student_events")
                        .select("front_id, student_id")
                        .in("student_id", studentIds)
                        .eq("event_id", testInfo.event_id);
                    if (studentError)
                        throw studentError;
                    if (studentData) {
                        for (const t of data) {
                            const student = studentData.find((s) => s.student_id === t.student_id);
                            if (student)
                                t.front_id = student.front_id;
                        }
                    }
                }
            }
            return data;
        },
        /** Get graded test answers */
        async getResults(testId) {
            const { data, error } = await supabase
                .from("graded_test_answers")
                .select("*")
                .eq("test_id", testId);
            if (error)
                throw error;
            return data;
        },
        /** Get scan grading progress stats */
        async getScanGradeStats(testId) {
            const { data, error } = await supabase.rpc("get_test_problem_scans_state", {
                in_test_id: testId,
                target_grader: null,
            });
            if (error)
                throw error;
            const total = data.length;
            const graded = data.filter((row) => (row.distinct_grades === 1 && row.unsure_grades === 0) ||
                (row.overriden && row.total_grades >= 2)).length;
            const conflicts = data.filter((row) => (row.distinct_grades > 1 || row.unsure_grades > 0) && !row.overriden).length;
            return { totalProblems: total, gradedProblems: graded, conflictProblems: conflicts };
        },
        /**
         * Unified leaderboard. Works for online tests (graded_test_answers),
         * in-person scan-graded tests (scan_grades), and Guts / manual-graded tests
         * (manual_grades) — including hybrid tests that mix sources.
         *
         * Every row has front_id (user-facing) + display_name. `scoreBreakdown`
         * shows where the points came from. Ties broken by earliest contributing
         * timestamp (online edit / scan-grade time / manual_grades.graded_at).
         */
        async getLeaderboard(testId, options = {}) {
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            const result = await resolveTestScores(supabase, testId);
            const rows = result.entities.map((e, i) => ({
                rank: i + 1,
                front_id: e.front_id,
                display_name: e.display_name,
                entity_type: e.entity_type,
                test_taker_id: e.test_taker_id,
                student_id: e.student_id,
                team_id: e.team_id,
                totalScore: e.totalScore,
                problemCount: e.problemCount,
                lastSubmittedAt: e.lastSubmittedAt,
                scoreBreakdown: e.scoreBreakdown,
            }));
            return options.limit ? rows.slice(0, options.limit) : rows;
        },
        /**
         * Per-problem stats across all 3 sources (online + scan + manual).
         * `attempted` = entities with any non-unanswered state for this problem;
         * `correct` = entities whose final state is "correct"; `unsure` /
         * `conflict` / `ungraded` are reported separately so analysts can spot
         * stuck problems on in-person tests.
         */
        async getProblemStats(testId) {
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            const result = await resolveTestScores(supabase, testId);
            const byProblem = new Map();
            const make = () => ({
                attempted: 0,
                correct: 0,
                incorrect: 0,
                unsure: 0,
                conflict: 0,
                ungraded: 0,
                scoreSum: 0,
            });
            for (const e of result.entities) {
                for (const ps of Object.values(e.perProblem)) {
                    if (!byProblem.has(ps.test_problem_id))
                        byProblem.set(ps.test_problem_id, make());
                    const b = byProblem.get(ps.test_problem_id);
                    if (ps.state !== "unanswered")
                        b.attempted += 1;
                    if (ps.state === "correct")
                        b.correct += 1;
                    else if (ps.state === "incorrect")
                        b.incorrect += 1;
                    else if (ps.state === "unsure")
                        b.unsure += 1;
                    else if (ps.state === "conflict")
                        b.conflict += 1;
                    else if (ps.state === "ungraded")
                        b.ungraded += 1;
                    b.scoreSum += ps.points;
                }
            }
            return result.problems.map((p) => {
                const b = byProblem.get(p.test_problem_id) || make();
                return {
                    test_problem_id: p.test_problem_id,
                    problem_number: p.problem_number,
                    page_number: p.page_number,
                    totalPoints: p.points,
                    attempted: b.attempted,
                    correct: b.correct,
                    incorrect: b.incorrect,
                    unsure: b.unsure,
                    conflict: b.conflict,
                    ungraded: b.ungraded,
                    avgScore: b.attempted > 0
                        ? Math.round((b.scoreSum / b.attempted) * 100) / 100
                        : null,
                };
            });
        },
        /**
         * Find all takers who submitted an exact answer to a specific problem (or anywhere in a test).
         * Provide either `test_problem_id` directly, or `testId` + `problem_number`.
         * Returns graded_test_answers rows enriched with taker (student_id / team_id / taker_name).
         */
        async findAnswers(params) {
            let testProblemId = params.test_problem_id;
            const testId = params.testId;
            if (!testProblemId && params.problem_number != null) {
                if (!testId)
                    throw new Error("testId is required when searching by problem_number");
                const { data: problem, error } = await supabase
                    .from("test_problems")
                    .select("test_problem_id, test_id")
                    .eq("test_id", testId)
                    .eq("problem_number", params.problem_number)
                    .maybeSingle();
                if (error)
                    throw error;
                if (!problem)
                    throw new Error(`Problem ${params.problem_number} not found in test ${testId}`);
                testProblemId = problem.test_problem_id;
            }
            // Auth: resolve event from test (or from problem's test) and assert.
            if (testId) {
                const { data: t, error } = await supabase
                    .from("tests")
                    .select("event_id")
                    .eq("test_id", testId)
                    .single();
                if (error)
                    throw error;
                assertEventAllowed(t.event_id, eventIds);
            }
            else if (testProblemId) {
                const { data: tp, error } = await supabase
                    .from("test_problems")
                    .select("test_id, tests!inner(event_id)")
                    .eq("test_problem_id", testProblemId)
                    .single();
                if (error)
                    throw error;
                assertEventAllowed(tp.tests.event_id, eventIds);
            }
            else {
                throw new Error("Provide testId, test_problem_id, or testId + problem_number");
            }
            let query = supabase
                .from("graded_test_answers")
                .select("*")
                .eq("answer_latex", params.answer);
            if (testProblemId)
                query = query.eq("test_problem_id", testProblemId);
            else if (testId)
                query = query.eq("test_id", testId);
            if (params.limit)
                query = query.limit(params.limit);
            const { data: answers, error: aErr } = await query;
            if (aErr)
                throw aErr;
            if (!answers || answers.length === 0)
                return [];
            const takerIds = [
                ...new Set(answers
                    .map((a) => a.test_taker_id)
                    .filter((id) => id != null)),
            ];
            const takerMap = await enrichTakers(supabase, takerIds);
            return answers.map((a) => ({
                ...a,
                taker: takerMap.get(a.test_taker_id) || null,
            }));
        },
        /**
         * Find groups of takers who submitted the same answer to the same problem.
         * When `windowSeconds` > 0, only takers whose `last_edited_time` fits in a sliding
         * window of that size are grouped together (collusion / simultaneous-submission detection).
         * When `windowSeconds` is 0 (default), every matching-answer cohort is returned regardless of time.
         */
        async findAnswerCollisions(testId, options = {}) {
            const windowMs = (options.windowSeconds ?? 0) * 1000;
            const minGroup = options.minGroupSize ?? 2;
            const { data: test, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(test.event_id, eventIds);
            let problemIdFilter = null;
            if (options.problemNumbers && options.problemNumbers.length > 0) {
                const { data: problems, error: pErr } = await supabase
                    .from("test_problems")
                    .select("test_problem_id, problem_number")
                    .eq("test_id", testId)
                    .in("problem_number", options.problemNumbers);
                if (pErr)
                    throw pErr;
                problemIdFilter = (problems || []).map((p) => p.test_problem_id);
            }
            let query = supabase
                .from("graded_test_answers")
                .select("test_taker_id, test_problem_id, test_problem_number, answer_latex, last_edited_time, score:points, correct")
                .eq("test_id", testId)
                .not("answer_latex", "is", null);
            if (problemIdFilter)
                query = query.in("test_problem_id", problemIdFilter);
            if (options.onlyIncorrect)
                query = query.eq("correct", false);
            const { data: answers, error: aErr } = await query;
            if (aErr)
                throw aErr;
            const bucket = new Map();
            for (const a of answers || []) {
                if (!a.answer_latex)
                    continue;
                const key = `${a.test_problem_id}::${a.answer_latex}`;
                if (!bucket.has(key))
                    bucket.set(key, []);
                bucket.get(key).push(a);
            }
            const collisions = [];
            const rawByIndex = [];
            const allTakerIds = new Set();
            for (const rows of bucket.values()) {
                if (rows.length < minGroup)
                    continue;
                if (windowMs === 0) {
                    rows.forEach((r) => allTakerIds.add(r.test_taker_id));
                    const times = rows
                        .map((r) => (r.last_edited_time ? new Date(r.last_edited_time).getTime() : null))
                        .filter((t) => t != null);
                    const span = times.length >= 2
                        ? (Math.max(...times) - Math.min(...times)) / 1000
                        : null;
                    collisions.push({
                        test_problem_id: rows[0].test_problem_id,
                        problem_number: rows[0].test_problem_number,
                        answer_latex: rows[0].answer_latex,
                        windowSpanSeconds: span,
                        takers: [],
                    });
                    rawByIndex.push(rows);
                    continue;
                }
                const sorted = rows
                    .filter((r) => r.last_edited_time != null)
                    .map((r) => ({ row: r, ts: new Date(r.last_edited_time).getTime() }))
                    .sort((a, b) => a.ts - b.ts);
                let i = 0;
                while (i < sorted.length) {
                    const group = [sorted[i]];
                    let j = i + 1;
                    while (j < sorted.length && sorted[j].ts - group[0].ts <= windowMs) {
                        group.push(sorted[j]);
                        j++;
                    }
                    if (group.length >= minGroup) {
                        group.forEach((g) => allTakerIds.add(g.row.test_taker_id));
                        collisions.push({
                            test_problem_id: group[0].row.test_problem_id,
                            problem_number: group[0].row.test_problem_number,
                            answer_latex: group[0].row.answer_latex,
                            windowSpanSeconds: (group[group.length - 1].ts - group[0].ts) / 1000,
                            takers: [],
                        });
                        rawByIndex.push(group.map((g) => g.row));
                        i = j;
                    }
                    else {
                        i++;
                    }
                }
            }
            if (allTakerIds.size > 0) {
                const takerMap = await enrichTakers(supabase, [...allTakerIds]);
                collisions.forEach((c, idx) => {
                    c.takers = rawByIndex[idx].map((r) => {
                        const t = takerMap.get(r.test_taker_id);
                        return {
                            front_id: t?.front_id ?? null,
                            display_name: t?.taker_name ?? null,
                            test_taker_id: r.test_taker_id,
                            student_id: t?.student_id ?? null,
                            team_id: t?.team_id ?? null,
                            last_edited_time: r.last_edited_time,
                            score: r.score,
                            correct: r.correct,
                        };
                    });
                });
            }
            collisions.sort((a, b) => b.takers.length - a.takers.length);
            return collisions;
        },
        /**
         * Full per-problem score breakdown for ONE entity on this test.
         * Looks up by front_id (preferred) or test_taker_id. Returns the merged
         * online + scan + manual view. `perProblem` is keyed by problem_number.
         */
        async getTakerScore(testId, params) {
            if (params.front_id == null && params.test_taker_id == null) {
                throw new Error("Provide front_id or test_taker_id");
            }
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            const result = await resolveTestScores(supabase, testId);
            const e = result.entities.find((x) => params.front_id != null
                ? x.front_id === params.front_id
                : x.test_taker_id === params.test_taker_id);
            if (!e)
                return null;
            const perProblem = {};
            for (const ps of Object.values(e.perProblem)) {
                const key = ps.problem_number ?? ps.test_problem_id;
                perProblem[key] = {
                    test_problem_id: ps.test_problem_id,
                    problem_number: ps.problem_number,
                    source: ps.source,
                    state: ps.state,
                    points: ps.points,
                    answer_latex: ps.answer_latex,
                    lastEditedAt: ps.lastEditedAt,
                };
            }
            const rank = result.entities.findIndex((x) => params.front_id != null
                ? x.front_id === params.front_id
                : x.test_taker_id === params.test_taker_id) + 1;
            return {
                rank,
                front_id: e.front_id,
                display_name: e.display_name,
                entity_type: e.entity_type,
                test_taker_id: e.test_taker_id,
                student_id: e.student_id,
                team_id: e.team_id,
                totalScore: e.totalScore,
                problemCount: e.problemCount,
                lastSubmittedAt: e.lastSubmittedAt,
                scoreBreakdown: e.scoreBreakdown,
                perProblem,
            };
        },
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
        async getScanGradingProgress(testId) {
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            const [{ data: problems, error: pErr }, { data: scans, error: sErr }] = await Promise.all([
                supabase
                    .from("test_problems")
                    .select("test_problem_id, problem_number, page_number, points")
                    .eq("test_id", testId)
                    .order("problem_number"),
                supabase
                    .from("scans")
                    .select("scan_id, taker_id, page_number")
                    .eq("test_id", testId),
            ]);
            if (pErr)
                throw pErr;
            if (sErr)
                throw sErr;
            const scanIds = (scans || []).map((s) => s.scan_id).filter((x) => x != null);
            let grades = [];
            if (scanIds.length > 0) {
                const { data, error } = await supabase
                    .from("scan_grades")
                    .select("scan_id, test_problem_id, grade, is_override")
                    .in("scan_id", scanIds);
                if (error)
                    throw error;
                grades = data || [];
            }
            const cell = new Map();
            for (const g of grades) {
                if (g.scan_id == null || g.test_problem_id == null)
                    continue;
                const k = `${g.test_problem_id}::${g.scan_id}`;
                if (!cell.has(k))
                    cell.set(k, { rows: [] });
                cell.get(k).rows.push({ grade: g.grade, is_override: g.is_override });
            }
            const totalScans = (scans || []).length;
            const make = () => ({
                scansTotal: totalScans,
                graded: 0,
                conflicts: 0,
                overridden: 0,
                ungraded: 0,
                unsure: 0,
                correct: 0,
                incorrect: 0,
            });
            const byProblem = new Map();
            for (const p of problems || [])
                byProblem.set(p.test_problem_id, make());
            for (const [k, c] of cell) {
                const tpid = Number(k.split("::")[0]);
                const stat = byProblem.get(tpid);
                if (!stat)
                    continue;
                const ovd = c.rows.find((r) => r.is_override);
                let final = null;
                if (ovd) {
                    stat.overridden += 1;
                    final = ovd.grade;
                }
                else {
                    const distinct = [
                        ...new Set(c.rows.map((r) => r.grade).filter((g) => g != null)),
                    ];
                    if (distinct.length === 0)
                        final = null;
                    else if (distinct.length === 1)
                        final = distinct[0];
                    else
                        final = "conflict";
                }
                if (final == null)
                    stat.ungraded += 1;
                else if (final === "conflict")
                    stat.conflicts += 1;
                else {
                    stat.graded += 1;
                    if (final === "Correct")
                        stat.correct += 1;
                    else if (final === "Incorrect")
                        stat.incorrect += 1;
                    else if (final === "Unsure")
                        stat.unsure += 1;
                }
            }
            // For (problem, scan) cells with no scan_grades row, count as ungraded.
            const recordedByProblem = new Map();
            for (const k of cell.keys()) {
                const tpid = Number(k.split("::")[0]);
                recordedByProblem.set(tpid, (recordedByProblem.get(tpid) ?? 0) + 1);
            }
            for (const p of problems || []) {
                const stat = byProblem.get(p.test_problem_id);
                const missing = totalScans - (recordedByProblem.get(p.test_problem_id) ?? 0);
                if (missing > 0)
                    stat.ungraded += missing;
            }
            return problems?.map((p) => ({
                test_problem_id: p.test_problem_id,
                problem_number: p.problem_number,
                page_number: p.page_number,
                totalPoints: p.points,
                ...byProblem.get(p.test_problem_id),
            })) ?? [];
        },
        /**
         * Guts / manual scoreboard. Reads manual_grades directly so callers see
         * raw status strings ("correct", "incorrect", null, ...) per (team, problem).
         * For the unified score, prefer getLeaderboard.
         */
        async getGutsScoreboard(testId) {
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id, is_team")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            const { data: grades, error: gErr } = await supabase
                .from("manual_grades")
                .select("team_id, test_problem_id, status, answer_latex, score, graded_at, test_problems(problem_number, points)")
                .eq("test_id", testId);
            if (gErr)
                throw gErr;
            const teamIds = [
                ...new Set((grades || []).map((g) => g.team_id).filter((x) => x != null)),
            ];
            const teamInfo = new Map();
            if (teamIds.length > 0) {
                const { data: teams, error: tmErr } = await supabase
                    .from("teams")
                    .select("team_id, front_id, team_name")
                    .in("team_id", teamIds);
                if (tmErr)
                    throw tmErr;
                for (const t of teams || []) {
                    teamInfo.set(t.team_id, { front_id: t.front_id ?? null, team_name: t.team_name ?? null });
                }
            }
            const byTeam = new Map();
            for (const g of grades || []) {
                if (g.team_id == null)
                    continue;
                const info = teamInfo.get(g.team_id) || { front_id: null, team_name: null };
                if (!byTeam.has(g.team_id)) {
                    byTeam.set(g.team_id, {
                        front_id: info.front_id,
                        team_id: g.team_id,
                        team_name: info.team_name,
                        totalScore: 0,
                        correctCount: 0,
                        problems: {},
                        lastGradedAt: null,
                    });
                }
                const row = byTeam.get(g.team_id);
                const pn = g.test_problems?.problem_number ?? null;
                const points = g.status === "correct"
                    ? typeof g.score === "number"
                        ? g.score
                        : g.test_problems?.points ?? 0
                    : 0;
                if (pn != null) {
                    row.problems[pn] = {
                        status: g.status,
                        score: points,
                        answer_latex: g.answer_latex,
                        graded_at: g.graded_at,
                    };
                }
                if (g.status === "correct")
                    row.correctCount += 1;
                row.totalScore += points;
                if (g.graded_at && (!row.lastGradedAt || g.graded_at > row.lastGradedAt)) {
                    row.lastGradedAt = g.graded_at;
                }
            }
            const rows = [...byTeam.values()].sort((a, b) => {
                if (b.totalScore !== a.totalScore)
                    return b.totalScore - a.totalScore;
                if (a.lastGradedAt && b.lastGradedAt) {
                    return a.lastGradedAt < b.lastGradedAt ? -1 : 1;
                }
                return 0;
            });
            return rows.map((r, i) => ({ rank: i + 1, ...r }));
        },
        /**
         * Frequency histogram of every distinct answer to one problem, with
         * correctness and total takers behind each. Powerful for spotting:
         *   - clusters of identical wrong answers (collusion / shared notes)
         *   - off-by-one popular answers (taught the wrong method)
         *   - high concentration on a single distractor
         */
        async getAnswerHistogram(testId, problem_number) {
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            const { data: problem, error: pErr } = await supabase
                .from("test_problems")
                .select("test_problem_id")
                .eq("test_id", testId)
                .eq("problem_number", problem_number)
                .maybeSingle();
            if (pErr)
                throw pErr;
            if (!problem)
                throw new Error(`Problem ${problem_number} not found in test ${testId}`);
            const { data: answers, error: aErr } = await supabase
                .from("graded_test_answers")
                .select("answer_latex, correct, score:points")
                .eq("test_problem_id", problem.test_problem_id);
            if (aErr)
                throw aErr;
            const buckets = new Map();
            let totalAttempts = 0;
            for (const a of answers || []) {
                if (a.answer_latex == null || a.answer_latex === "")
                    continue;
                totalAttempts += 1;
                const key = a.answer_latex;
                if (!buckets.has(key)) {
                    buckets.set(key, {
                        answer_latex: a.answer_latex,
                        count: 0,
                        correct: a.correct ?? null,
                        pointsEach: typeof a.score === "number" ? a.score : 0,
                    });
                }
                buckets.get(key).count += 1;
            }
            const rows = [...buckets.values()].sort((a, b) => b.count - a.count);
            return {
                test_problem_id: problem.test_problem_id,
                problem_number,
                totalAttempts,
                distinctAnswers: rows.length,
                answers: rows.map((r) => ({
                    answer_latex: r.answer_latex,
                    count: r.count,
                    frequency: totalAttempts > 0 ? r.count / totalAttempts : 0,
                    correct: r.correct,
                    pointsEach: r.pointsEach,
                })),
            };
        },
        /**
         * Chronological submission timeline for ONE taker on this test. Returns
         * every graded_test_answers row sorted by last_edited_time. Forensic
         * tool: spot bursts, long gaps, weird ordering, end-of-test cramming.
         *
         * Online-only — scan grades and manual grades have no per-submission
         * timestamps from the taker (only from the grader).
         */
        async getTakerTimeline(testId, params) {
            if (params.front_id == null && params.test_taker_id == null) {
                throw new Error("Provide front_id or test_taker_id");
            }
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            // Resolve front_id → test_taker_id if needed via the unified resolver
            // (handles both team and individual tests).
            let testTakerId = params.test_taker_id;
            if (testTakerId == null && params.front_id != null) {
                const result = await resolveTestScores(supabase, testId);
                const e = result.entities.find((x) => x.front_id === params.front_id);
                if (!e || e.test_taker_id == null)
                    return null;
                testTakerId = e.test_taker_id;
            }
            const { data: rows, error: rErr } = await supabase
                .from("graded_test_answers")
                .select("test_problem_id, test_problem_number, answer_latex, correct, score:points, last_edited_time")
                .eq("test_id", testId)
                .eq("test_taker_id", testTakerId);
            if (rErr)
                throw rErr;
            const events = (rows || [])
                .filter((r) => r.last_edited_time)
                .sort((a, b) => a.last_edited_time < b.last_edited_time ? -1 : a.last_edited_time > b.last_edited_time ? 1 : 0);
            let prev = null;
            const enriched = events.map((e) => {
                const ts = new Date(e.last_edited_time).getTime();
                const gap = prev != null ? (ts - prev) / 1000 : null;
                prev = ts;
                return {
                    test_problem_id: e.test_problem_id,
                    problem_number: e.test_problem_number,
                    answer_latex: e.answer_latex,
                    correct: e.correct,
                    score: e.score,
                    last_edited_time: e.last_edited_time,
                    secondsSincePrev: gap,
                };
            });
            return {
                test_taker_id: testTakerId,
                front_id: params.front_id ?? null,
                events: enriched,
            };
        },
        /**
         * Find takers who submitted a burst of `minAnswers` answers within
         * `withinSeconds`. Catches bulk-paste / scripted-submit / "answered
         * everything in the last 10 seconds" patterns.
         */
        async findRapidSubmissions(testId, options = {}) {
            const minAnswers = options.minAnswers ?? 5;
            const window = (options.withinSeconds ?? 10) * 1000;
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            let query = supabase
                .from("graded_test_answers")
                .select("test_taker_id, test_problem_id, test_problem_number, answer_latex, correct, score:points, last_edited_time")
                .eq("test_id", testId)
                .not("last_edited_time", "is", null)
                .not("answer_latex", "is", null);
            if (options.onlyIncorrect)
                query = query.eq("correct", false);
            const { data: answers, error: aErr } = await query;
            if (aErr)
                throw aErr;
            const byTaker = new Map();
            for (const r of answers || []) {
                if (r.test_taker_id == null)
                    continue;
                if (!byTaker.has(r.test_taker_id))
                    byTaker.set(r.test_taker_id, []);
                byTaker.get(r.test_taker_id).push(r);
            }
            const bursts = [];
            const allTakerIds = new Set();
            for (const [takerId, rows] of byTaker) {
                const sorted = rows.sort((a, b) => a.last_edited_time < b.last_edited_time ? -1 : 1);
                let i = 0;
                while (i < sorted.length) {
                    const t0 = new Date(sorted[i].last_edited_time).getTime();
                    let j = i + 1;
                    while (j < sorted.length &&
                        new Date(sorted[j].last_edited_time).getTime() - t0 <= window)
                        j++;
                    if (j - i >= minAnswers) {
                        const slice = sorted.slice(i, j);
                        const startedAt = slice[0].last_edited_time;
                        const endedAt = slice[slice.length - 1].last_edited_time;
                        const spanSeconds = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000;
                        bursts.push({ test_taker_id: takerId, startedAt, endedAt, spanSeconds, answers: slice });
                        allTakerIds.add(takerId);
                        i = j;
                    }
                    else {
                        i++;
                    }
                }
            }
            const takerMap = allTakerIds.size > 0 ? await enrichTakers(supabase, [...allTakerIds]) : new Map();
            bursts.sort((a, b) => b.answers.length - a.answers.length);
            return bursts.map((b) => {
                const t = takerMap.get(b.test_taker_id);
                return {
                    front_id: t?.front_id ?? null,
                    display_name: t?.taker_name ?? null,
                    test_taker_id: b.test_taker_id,
                    student_id: t?.student_id ?? null,
                    team_id: t?.team_id ?? null,
                    startedAt: b.startedAt,
                    endedAt: b.endedAt,
                    spanSeconds: b.spanSeconds,
                    answerCount: b.answers.length,
                    answersPerSecond: b.spanSeconds > 0 ? b.answers.length / b.spanSeconds : null,
                    answers: b.answers.map((a) => ({
                        problem_number: a.test_problem_number,
                        answer_latex: a.answer_latex,
                        correct: a.correct,
                        score: a.score,
                        last_edited_time: a.last_edited_time,
                    })),
                };
            });
        },
        /**
         * Pairwise similarity across all takers on this test: how many problems
         * they answered identically. Strong cheating signal when sustained across
         * many problems, especially incorrect ones (matching wrong answers is
         * far more diagnostic than matching correct ones — distractors aren't
         * uniformly distributed but right answers are).
         *
         * Returns pairs sorted by score (sharedIncorrect weighted 3x).
         */
        async findSimilarTakers(testId, options = {}) {
            const minShared = options.minShared ?? 3;
            const limit = options.limit ?? 50;
            const { data: testInfo, error: tErr } = await supabase
                .from("tests")
                .select("event_id")
                .eq("test_id", testId)
                .single();
            if (tErr)
                throw tErr;
            assertEventAllowed(testInfo.event_id, eventIds);
            let problemIdFilter = null;
            if (options.problemNumbers && options.problemNumbers.length > 0) {
                const { data: ps, error: pErr } = await supabase
                    .from("test_problems")
                    .select("test_problem_id, problem_number")
                    .eq("test_id", testId)
                    .in("problem_number", options.problemNumbers);
                if (pErr)
                    throw pErr;
                problemIdFilter = (ps || []).map((p) => p.test_problem_id);
            }
            let query = supabase
                .from("graded_test_answers")
                .select("test_taker_id, test_problem_id, test_problem_number, answer_latex, correct")
                .eq("test_id", testId)
                .not("answer_latex", "is", null);
            if (problemIdFilter)
                query = query.in("test_problem_id", problemIdFilter);
            const { data: answers, error: aErr } = await query;
            if (aErr)
                throw aErr;
            const byAnswer = new Map();
            for (const r of answers || []) {
                if (r.test_taker_id == null)
                    continue;
                const key = `${r.test_problem_id}::${r.answer_latex}`;
                if (!byAnswer.has(key))
                    byAnswer.set(key, []);
                byAnswer.get(key).push(r);
            }
            const pairs = new Map();
            const allTakerIds = new Set();
            for (const rows of byAnswer.values()) {
                if (rows.length < 2)
                    continue;
                // Each pair within this cohort shares this (problem, answer).
                for (let i = 0; i < rows.length; i++) {
                    for (let j = i + 1; j < rows.length; j++) {
                        const ai = rows[i].test_taker_id;
                        const aj = rows[j].test_taker_id;
                        if (ai === aj)
                            continue;
                        const lo = Math.min(ai, aj);
                        const hi = Math.max(ai, aj);
                        const key = `${lo}::${hi}`;
                        allTakerIds.add(ai);
                        allTakerIds.add(aj);
                        if (!pairs.has(key)) {
                            pairs.set(key, {
                                a: lo,
                                b: hi,
                                sharedTotal: 0,
                                sharedCorrect: 0,
                                sharedIncorrect: 0,
                                sharedProblems: [],
                            });
                        }
                        const p = pairs.get(key);
                        p.sharedTotal += 1;
                        if (rows[i].correct === true)
                            p.sharedCorrect += 1;
                        else if (rows[i].correct === false)
                            p.sharedIncorrect += 1;
                        p.sharedProblems.push({
                            problem_number: rows[i].test_problem_number,
                            test_problem_id: rows[i].test_problem_id,
                            answer_latex: rows[i].answer_latex,
                            correct: rows[i].correct,
                        });
                    }
                }
            }
            const filtered = [...pairs.values()].filter((p) => p.sharedTotal >= minShared);
            const scored = filtered
                .map((p) => ({
                ...p,
                score: p.sharedCorrect + 3 * p.sharedIncorrect,
            }))
                .sort((a, b) => {
                if (b.score !== a.score)
                    return b.score - a.score;
                return b.sharedTotal - a.sharedTotal;
            })
                .slice(0, limit);
            const takerMap = allTakerIds.size > 0 ? await enrichTakers(supabase, [...allTakerIds]) : new Map();
            return scored.map((p) => {
                const ta = takerMap.get(p.a);
                const tb = takerMap.get(p.b);
                return {
                    score: p.score,
                    sharedTotal: p.sharedTotal,
                    sharedCorrect: p.sharedCorrect,
                    sharedIncorrect: p.sharedIncorrect,
                    takerA: {
                        front_id: ta?.front_id ?? null,
                        display_name: ta?.taker_name ?? null,
                        test_taker_id: p.a,
                        student_id: ta?.student_id ?? null,
                        team_id: ta?.team_id ?? null,
                    },
                    takerB: {
                        front_id: tb?.front_id ?? null,
                        display_name: tb?.taker_name ?? null,
                        test_taker_id: p.b,
                        student_id: tb?.student_id ?? null,
                        team_id: tb?.team_id ?? null,
                    },
                    sharedProblems: p.sharedProblems,
                };
            });
        },
    };
}
//# sourceMappingURL=tests.js.map