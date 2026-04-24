import { SupabaseClient } from "@supabase/supabase-js";

function assertEventAllowed(eventId: number, eventIds: number[]) {
  if (!eventIds.includes(eventId)) {
    throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
  }
}

export function createTestsSDK(supabase: SupabaseClient, eventIds: number[]) {
  return {
    /** List all tests for an event */
    async list(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("event_id", eventId)
        .order("test_name");
      if (error) throw error;
      return data;
    },

    /** Get test details */
    async get(testId: number) {
      const { data, error } = await supabase
        .from("tests_detailed")
        .select("*")
        .eq("test_id", testId)
        .single();
      if (error) throw error;
      if (data.event_id) assertEventAllowed(data.event_id, eventIds);
      return data;
    },

    /** Get test problems */
    async getProblems(testId: number) {
      const { data, error } = await supabase
        .from("test_problems")
        .select("*")
        .eq("test_id", testId)
        .order("problem_number");
      if (error) throw error;
      return data;
    },

    /** Get test takers with details */
    async getTestTakers(testId: number) {
      // Get test info first to check is_team
      const { data: testInfo, error: testError } = await supabase
        .from("tests")
        .select("is_team, event_id")
        .eq("test_id", testId)
        .single();
      if (testError) throw testError;
      assertEventAllowed(testInfo.event_id, eventIds);

      const { data, error } = await supabase
        .from("test_takers_detailed")
        .select("*")
        .eq("test_id", testId);
      if (error) throw error;

      // For individual tests, enrich with front_id
      if (!testInfo.is_team) {
        const studentIds = data
          .map((t: any) => t.student_id)
          .filter((id: any): id is number => id != null);

        if (studentIds.length > 0) {
          const { data: studentData, error: studentError } = await supabase
            .from("student_events")
            .select("front_id, student_id")
            .in("student_id", studentIds)
            .eq("event_id", testInfo.event_id);
          if (studentError) throw studentError;

          if (studentData) {
            for (const t of data as any[]) {
              const student = studentData.find((s: any) => s.student_id === t.student_id);
              if (student) t.front_id = student.front_id;
            }
          }
        }
      }

      return data;
    },

    /** Get graded test answers */
    async getResults(testId: number) {
      const { data, error } = await supabase
        .from("graded_test_answers")
        .select("*")
        .eq("test_id", testId);
      if (error) throw error;
      return data;
    },

    /** Get scan grading progress stats */
    async getScanGradeStats(testId: number) {
      const { data, error } = await supabase.rpc("get_test_problem_scans_state", {
        in_test_id: testId,
        target_grader: null,
      });
      if (error) throw error;

      const total = data.length;
      const graded = data.filter(
        (row: any) =>
          (row.distinct_grades === 1 && row.unsure_grades === 0) ||
          (row.overriden && row.total_grades >= 2)
      ).length;
      const conflicts = data.filter(
        (row: any) =>
          (row.distinct_grades > 1 || row.unsure_grades > 0) && !row.overriden
      ).length;

      return { totalProblems: total, gradedProblems: graded, conflictProblems: conflicts };
    },

    /**
     * Leaderboard: takers ranked by total score on a single test.
     * Ties are broken by earliest final submission (lower lastSubmittedAt wins).
     */
    async getLeaderboard(testId: number, options: { limit?: number } = {}) {
      const { data: testInfo, error: tErr } = await supabase
        .from("tests")
        .select("event_id")
        .eq("test_id", testId)
        .single();
      if (tErr) throw tErr;
      assertEventAllowed(testInfo.event_id, eventIds);

      const [{ data: answers, error: aErr }, { data: takers, error: tkErr }] =
        await Promise.all([
          supabase
            .from("graded_test_answers")
            .select("test_taker_id, score, last_edited_time")
            .eq("test_id", testId),
          supabase
            .from("test_takers_detailed")
            .select("test_taker_id, student_id, team_id, taker_name, front_id")
            .eq("test_id", testId),
        ]);
      if (aErr) throw aErr;
      if (tkErr) throw tkErr;

      const agg = new Map<
        number,
        { totalScore: number; problemCount: number; lastSubmittedAt: string | null }
      >();
      for (const ans of answers || []) {
        if (ans.test_taker_id == null) continue;
        const cur =
          agg.get(ans.test_taker_id) || {
            totalScore: 0,
            problemCount: 0,
            lastSubmittedAt: null as string | null,
          };
        if (ans.score != null) cur.totalScore += ans.score;
        cur.problemCount += 1;
        if (
          ans.last_edited_time &&
          (!cur.lastSubmittedAt || ans.last_edited_time > cur.lastSubmittedAt)
        ) {
          cur.lastSubmittedAt = ans.last_edited_time;
        }
        agg.set(ans.test_taker_id, cur);
      }

      const rows = (takers || []).map((t: any) => {
        const d = agg.get(t.test_taker_id) || {
          totalScore: 0,
          problemCount: 0,
          lastSubmittedAt: null,
        };
        return {
          test_taker_id: t.test_taker_id,
          student_id: t.student_id,
          team_id: t.team_id,
          display_name: t.taker_name,
          front_id: t.front_id,
          totalScore: d.totalScore,
          problemCount: d.problemCount,
          lastSubmittedAt: d.lastSubmittedAt,
        };
      });

      rows.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (a.lastSubmittedAt && b.lastSubmittedAt) {
          return a.lastSubmittedAt < b.lastSubmittedAt ? -1 : 1;
        }
        return 0;
      });

      const ranked = rows.map((r, i) => ({ rank: i + 1, ...r }));
      return options.limit ? ranked.slice(0, options.limit) : ranked;
    },

    /** Per-problem stats: attempted, correct, average score. */
    async getProblemStats(testId: number) {
      const { data: testInfo, error: tErr } = await supabase
        .from("tests")
        .select("event_id")
        .eq("test_id", testId)
        .single();
      if (tErr) throw tErr;
      assertEventAllowed(testInfo.event_id, eventIds);

      const [{ data: problems, error: pErr }, { data: answers, error: aErr }] =
        await Promise.all([
          supabase
            .from("test_problems")
            .select("test_problem_id, problem_number, points, page_number")
            .eq("test_id", testId)
            .order("problem_number"),
          supabase
            .from("graded_test_answers")
            .select("test_problem_id, score, correct, answer_latex")
            .eq("test_id", testId),
        ]);
      if (pErr) throw pErr;
      if (aErr) throw aErr;

      const byProblem = new Map<number, any[]>();
      for (const a of answers || []) {
        if (a.test_problem_id == null) continue;
        if (!byProblem.has(a.test_problem_id)) byProblem.set(a.test_problem_id, []);
        byProblem.get(a.test_problem_id)!.push(a);
      }

      return (problems || []).map((p: any) => {
        const rows = byProblem.get(p.test_problem_id) || [];
        const attempted = rows.filter(
          (r) => r.answer_latex != null && r.answer_latex !== ""
        ).length;
        const correct = rows.filter((r) => r.correct === true).length;
        const scores = rows
          .map((r) => r.score)
          .filter((s: any) => s != null) as number[];
        const avg =
          scores.length > 0
            ? scores.reduce((x, y) => x + y, 0) / scores.length
            : null;
        return {
          test_problem_id: p.test_problem_id,
          problem_number: p.problem_number,
          page_number: p.page_number,
          totalPoints: p.points,
          graded: rows.length,
          attempted,
          correct,
          avgScore: avg !== null ? Math.round(avg * 100) / 100 : null,
        };
      });
    },

    /**
     * Find all takers who submitted an exact answer to a specific problem (or anywhere in a test).
     * Provide either `test_problem_id` directly, or `testId` + `problem_number`.
     * Returns graded_test_answers rows enriched with taker (student_id / team_id / taker_name).
     */
    async findAnswers(params: {
      testId?: number;
      test_problem_id?: number;
      problem_number?: number;
      answer: string;
      limit?: number;
    }) {
      let testProblemId = params.test_problem_id;
      const testId = params.testId;

      if (!testProblemId && params.problem_number != null) {
        if (!testId) throw new Error("testId is required when searching by problem_number");
        const { data: problem, error } = await supabase
          .from("test_problems")
          .select("test_problem_id, test_id")
          .eq("test_id", testId)
          .eq("problem_number", params.problem_number)
          .maybeSingle();
        if (error) throw error;
        if (!problem) throw new Error(`Problem ${params.problem_number} not found in test ${testId}`);
        testProblemId = problem.test_problem_id;
      }

      // Auth: resolve event from test (or from problem's test) and assert.
      if (testId) {
        const { data: t, error } = await supabase
          .from("tests")
          .select("event_id")
          .eq("test_id", testId)
          .single();
        if (error) throw error;
        assertEventAllowed(t.event_id, eventIds);
      } else if (testProblemId) {
        const { data: tp, error } = await supabase
          .from("test_problems")
          .select("test_id, tests!inner(event_id)")
          .eq("test_problem_id", testProblemId)
          .single();
        if (error) throw error;
        assertEventAllowed((tp as any).tests.event_id, eventIds);
      } else {
        throw new Error("Provide testId, test_problem_id, or testId + problem_number");
      }

      let query = supabase
        .from("graded_test_answers")
        .select("*")
        .eq("answer_latex", params.answer);
      if (testProblemId) query = query.eq("test_problem_id", testProblemId);
      else if (testId) query = query.eq("test_id", testId);
      if (params.limit) query = query.limit(params.limit);

      const { data: answers, error: aErr } = await query;
      if (aErr) throw aErr;
      if (!answers || answers.length === 0) return [];

      const takerIds = [
        ...new Set(
          answers
            .map((a: any) => a.test_taker_id)
            .filter((id: any): id is number => id != null)
        ),
      ];
      const { data: takers, error: tkErr } = await supabase
        .from("test_takers_detailed")
        .select("test_taker_id, student_id, team_id, taker_name, front_id")
        .in("test_taker_id", takerIds);
      if (tkErr) throw tkErr;

      const takerMap = new Map((takers || []).map((t: any) => [t.test_taker_id, t]));
      return answers.map((a: any) => ({
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
    async findAnswerCollisions(
      testId: number,
      options: {
        windowSeconds?: number;
        minGroupSize?: number;
        problemNumbers?: number[];
        onlyIncorrect?: boolean;
      } = {}
    ) {
      const windowMs = (options.windowSeconds ?? 0) * 1000;
      const minGroup = options.minGroupSize ?? 2;

      const { data: test, error: tErr } = await supabase
        .from("tests")
        .select("event_id")
        .eq("test_id", testId)
        .single();
      if (tErr) throw tErr;
      assertEventAllowed(test.event_id, eventIds);

      let problemIdFilter: number[] | null = null;
      if (options.problemNumbers && options.problemNumbers.length > 0) {
        const { data: problems, error: pErr } = await supabase
          .from("test_problems")
          .select("test_problem_id, problem_number")
          .eq("test_id", testId)
          .in("problem_number", options.problemNumbers);
        if (pErr) throw pErr;
        problemIdFilter = (problems || []).map((p: any) => p.test_problem_id);
      }

      let query = supabase
        .from("graded_test_answers")
        .select(
          "test_taker_id, test_problem_id, test_problem_number, answer_latex, last_edited_time, score, correct"
        )
        .eq("test_id", testId)
        .not("answer_latex", "is", null);
      if (problemIdFilter) query = query.in("test_problem_id", problemIdFilter);
      if (options.onlyIncorrect) query = query.eq("correct", false);

      const { data: answers, error: aErr } = await query;
      if (aErr) throw aErr;

      type Row = {
        test_taker_id: number;
        test_problem_id: number;
        test_problem_number: number | null;
        answer_latex: string;
        last_edited_time: string | null;
        score: number | null;
        correct: boolean | null;
      };

      const bucket = new Map<string, Row[]>();
      for (const a of (answers as Row[]) || []) {
        if (!a.answer_latex) continue;
        const key = `${a.test_problem_id}::${a.answer_latex}`;
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key)!.push(a);
      }

      type Collision = {
        test_problem_id: number;
        problem_number: number | null;
        answer_latex: string;
        windowSpanSeconds: number | null;
        takers: Array<{
          test_taker_id: number;
          student_id: string | null;
          team_id: number | null;
          display_name: string | null;
          front_id: string | null;
          last_edited_time: string | null;
          score: number | null;
          correct: boolean | null;
        }>;
      };
      const collisions: Collision[] = [];
      const rawByIndex: Row[][] = [];
      const allTakerIds = new Set<number>();

      for (const rows of bucket.values()) {
        if (rows.length < minGroup) continue;

        if (windowMs === 0) {
          rows.forEach((r) => allTakerIds.add(r.test_taker_id));
          const times = rows
            .map((r) => (r.last_edited_time ? new Date(r.last_edited_time).getTime() : null))
            .filter((t): t is number => t != null);
          const span =
            times.length >= 2
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
          .map((r) => ({ row: r, ts: new Date(r.last_edited_time!).getTime() }))
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
          } else {
            i++;
          }
        }
      }

      if (allTakerIds.size > 0) {
        const { data: takers, error: tkErr } = await supabase
          .from("test_takers_detailed")
          .select("test_taker_id, student_id, team_id, taker_name, front_id")
          .in("test_taker_id", [...allTakerIds]);
        if (tkErr) throw tkErr;
        const takerMap = new Map((takers || []).map((t: any) => [t.test_taker_id, t]));

        collisions.forEach((c, idx) => {
          c.takers = rawByIndex[idx].map((r) => {
            const t: any = takerMap.get(r.test_taker_id);
            return {
              test_taker_id: r.test_taker_id,
              student_id: t?.student_id ?? null,
              team_id: t?.team_id ?? null,
              display_name: t?.taker_name ?? null,
              front_id: t?.front_id ?? null,
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
  };
}
