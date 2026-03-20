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
  };
}
