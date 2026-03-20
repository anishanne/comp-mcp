import { SupabaseClient } from "@supabase/supabase-js";

function assertEventAllowed(eventId: number, eventIds: number[]) {
  if (!eventIds.includes(eventId)) {
    throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
  }
}

export function createAnalyticsSDK(supabase: SupabaseClient, eventIds: number[]) {
  return {
    /** Registration summary: total students, teams, orgs, independent students */
    async registrationSummary(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { count: studentCount, error: sErr } = await supabase
        .from("student_events")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);
      if (sErr) throw sErr;

      const { count: teamCount, error: tErr } = await supabase
        .from("teams")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);
      if (tErr) throw tErr;

      const { count: orgCount, error: oErr } = await supabase
        .from("org_events")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);
      if (oErr) throw oErr;

      const { count: independentCount, error: iErr } = await supabase
        .from("student_events")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .is("org_id", null);
      if (iErr) throw iErr;

      const { count: withoutTeamCount, error: wtErr } = await supabase
        .from("student_events")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .is("team_id", null);
      if (wtErr) throw wtErr;

      return {
        totalStudents: studentCount || 0,
        totalTeams: teamCount || 0,
        totalOrgs: orgCount || 0,
        independentStudents: independentCount || 0,
        studentsWithoutTeam: withoutTeamCount || 0,
      };
    },

    /** Distribution of team sizes */
    async teamSizeDistribution(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: teams, error: tErr } = await supabase
        .from("teams")
        .select("team_id")
        .eq("event_id", eventId);
      if (tErr) throw tErr;

      const distribution: Record<number, number> = {};
      for (const team of teams || []) {
        const { count, error } = await supabase
          .from("student_events")
          .select("*", { count: "exact", head: true })
          .eq("team_id", team.team_id);
        if (error) throw error;
        const size = count || 0;
        distribution[size] = (distribution[size] || 0) + 1;
      }

      return Object.entries(distribution)
        .map(([size, count]) => ({ teamSize: Number(size), count }))
        .sort((a, b) => a.teamSize - b.teamSize);
    },

    /** Students per org, teams per org */
    async orgBreakdown(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: orgs, error: oErr } = await supabase
        .from("org_events")
        .select("org_id, org:orgs(name)")
        .eq("event_id", eventId);
      if (oErr) throw oErr;

      const result = [];
      for (const org of orgs || []) {
        const { count: studentCount, error: sErr } = await supabase
          .from("student_events")
          .select("*", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("org_id", org.org_id);
        if (sErr) throw sErr;

        const { count: teamCount, error: tErr } = await supabase
          .from("teams")
          .select("*", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("org_id", org.org_id);
        if (tErr) throw tErr;

        result.push({
          orgId: org.org_id,
          orgName: (org.org as any)?.name || "Unknown",
          students: studentCount || 0,
          teams: teamCount || 0,
        });
      }

      return result.sort((a, b) => b.students - a.students);
    },

    /** Ticket summary: sold, refunded, pending, net revenue */
    async ticketSummary(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: event, error: eErr } = await supabase
        .from("events")
        .select("ticket_price_cents")
        .eq("event_id", eventId)
        .single();
      if (eErr) throw eErr;

      const { data: orders, error: oErr } = await supabase
        .from("ticket_orders")
        .select("quantity")
        .eq("event_id", eventId);
      if (oErr) throw oErr;
      const totalSold = orders?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

      const { data: approvedRefunds, error: arErr } = await supabase
        .from("refund_requests")
        .select("quantity, ticket_orders!inner(event_id)")
        .eq("refund_status", "APPROVED")
        .eq("ticket_orders.event_id", eventId);
      if (arErr) throw arErr;
      const totalRefunded = approvedRefunds?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;

      const { data: pendingRefunds, error: prErr } = await supabase
        .from("refund_requests")
        .select("quantity, ticket_orders!inner(event_id)")
        .eq("refund_status", "PENDING")
        .eq("ticket_orders.event_id", eventId);
      if (prErr) throw prErr;
      const totalPending = pendingRefunds?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;

      const priceCents = event.ticket_price_cents || 0;

      return {
        ticketPriceCents: priceCents,
        totalSold,
        totalRefunded,
        totalPendingRefund: totalPending,
        netTickets: totalSold - totalRefunded,
        grossRevenueCents: totalSold * priceCents,
        netRevenueCents: (totalSold - totalRefunded) * priceCents,
      };
    },

    /** Per-test grade summary */
    async gradeSummary(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: tests, error: tErr } = await supabase
        .from("tests")
        .select("test_id, test_name, is_team")
        .eq("event_id", eventId)
        .order("test_name");
      if (tErr) throw tErr;

      const results = [];
      for (const test of tests || []) {
        const { count: takerCount, error: tkErr } = await supabase
          .from("test_takers")
          .select("*", { count: "exact", head: true })
          .eq("test_id", test.test_id);
        if (tkErr) throw tkErr;

        const { data: graded, error: gErr } = await supabase
          .from("graded_test_answers")
          .select("score")
          .eq("test_id", test.test_id);
        if (gErr) throw gErr;

        const scores = (graded || []).map((g: any) => g.score).filter((s: any) => s != null);
        const avgScore = scores.length > 0
          ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
          : null;

        results.push({
          testId: test.test_id,
          testName: test.test_name,
          isTeam: test.is_team,
          testTakers: takerCount || 0,
          gradedAnswers: graded?.length || 0,
          averageScore: avgScore !== null ? Math.round(avgScore * 100) / 100 : null,
        });
      }

      return results;
    },

    /** Registrations over time (by day) */
    async registrationTimeline(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data, error } = await supabase
        .from("student_events")
        .select("created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const byDay: Record<string, number> = {};
      for (const row of data || []) {
        const day = (row.created_at as string).slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
      }

      let cumulative = 0;
      return Object.entries(byDay).map(([date, count]) => {
        cumulative += count;
        return { date, newRegistrations: count, cumulative };
      });
    },

    /** Count of unassigned students */
    async studentsWithoutTeam(eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { count, error } = await supabase
        .from("student_events")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .is("team_id", null);
      if (error) throw error;
      return count || 0;
    },

    /** Aggregate custom field responses */
    async customFieldSummary(eventId: number, table: "orgs" | "students" | "teams" = "students") {
      assertEventAllowed(eventId, eventIds);

      // Get custom fields for this event
      const { data: fields, error: fErr } = await supabase
        .from("event_custom_fields")
        .select("*, custom_fields!inner(*)")
        .eq("event_id", eventId)
        .eq("custom_fields.custom_field_table", table)
        .order("ordering");
      if (fErr) throw fErr;

      const results = [];
      for (const field of fields || []) {
        const cf = (field as any).custom_fields;
        const { data: values, error: vErr } = await supabase
          .from("custom_field_values")
          .select("value")
          .eq("event_custom_field_id", field.event_custom_field_id);
        if (vErr) throw vErr;

        const valueCounts: Record<string, number> = {};
        let totalResponses = 0;
        for (const v of values || []) {
          if (v.value) {
            totalResponses++;
            valueCounts[v.value] = (valueCounts[v.value] || 0) + 1;
          }
        }

        results.push({
          fieldId: cf.custom_field_id,
          label: cf.label,
          type: cf.custom_field_type,
          totalResponses,
          valueCounts: Object.entries(valueCounts)
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count),
        });
      }

      return results;
    },
  };
}
