import { SupabaseClient } from "@supabase/supabase-js";

function assertEventAllowed(eventId: number, eventIds: number[]) {
  if (!eventIds.includes(eventId)) {
    throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
  }
}

export function createStudentsSDK(supabase: SupabaseClient, eventIds: number[]) {
  return {
    /** List students for an event with optional pagination and team/org info */
    async list(eventId: number, options?: { limit?: number; offset?: number; withDetails?: boolean }) {
      assertEventAllowed(eventId, eventIds);
      const select = options?.withDetails
        ? "*, person:students(*), team:teams(*), org_event:org_events(*, org:orgs(*))"
        : "*, person:students(*)";
      let query = supabase
        .from("student_events")
        .select(select)
        .eq("event_id", eventId)
        .order("front_id", { ascending: true });
      if (options?.limit) query = query.limit(options.limit);
      if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    /** Get student event details (team, org, waiver) */
    async get(studentId: string, eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("student_events")
        .select("*, student:students(*), team:teams(*, student_event:student_events(*, student:students(*))), org_event:org_events(*, org:orgs(*))")
        .eq("student_id", studentId)
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    /** Search students by name, email, or front_id */
    async search(params: { eventId: number; name?: string; email?: string; frontId?: number }) {
      assertEventAllowed(params.eventId, eventIds);
      let query = supabase
        .from("student_events")
        .select("*, person:students!inner(*)")
        .eq("event_id", params.eventId);

      if (params.name) {
        query = query.or(
          `first_name.ilike.%${params.name}%,last_name.ilike.%${params.name}%`,
          { referencedTable: "students" }
        );
      }
      if (params.email) {
        query = query.eq("students.email", params.email);
      }
      if (params.frontId !== undefined) {
        query = query.eq("front_id", params.frontId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    /** Get students not assigned to teams */
    async getWithoutTeam(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("student_events")
        .select("*, person:students(*)")
        .eq("event_id", eventId)
        .is("team_id", null);
      if (error) throw error;
      return data;
    },

    /** Get student's ticket order + refund status */
    async getTicketOrder(studentId: string, eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("*, refund_requests(*)")
        .eq("student_id", studentId)
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    /** Get net available tickets for a student */
    async getAvailableTickets(studentId: string, eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: activeTickets, error: activeError } = await supabase
        .from("ticket_orders")
        .select("quantity")
        .eq("student_id", studentId)
        .eq("event_id", eventId);
      if (activeError) throw activeError;

      const totalActive = activeTickets?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

      const { data: refundedTickets, error: refundError } = await supabase
        .from("refund_requests")
        .select("quantity, ticket_orders!inner(id, student_id, event_id)")
        .in("refund_status", ["APPROVED"])
        .eq("ticket_orders.student_id", studentId)
        .eq("ticket_orders.event_id", eventId);
      if (refundError) throw refundError;

      const totalRefunded = refundedTickets?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

      return totalActive - totalRefunded;
    },

    /** Move student to a team */
    async transferToTeam(studentEventId: number, teamId: number) {
      // If teamId is -1, remove team affiliation
      if (teamId === -1) {
        const { data, error } = await supabase
          .from("student_events")
          .update({ team_id: null })
          .eq("student_event_id", studentEventId)
          .select("*, person:students(*)")
          .single();
        if (error) throw error;
        return data;
      }

      // Get the team's org to sync
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("org_id, event_id")
        .eq("team_id", teamId)
        .single();
      if (teamError) throw teamError;

      // Validate event
      assertEventAllowed(team.event_id, eventIds);

      const { data, error } = await supabase
        .from("student_events")
        .update({ team_id: teamId, org_id: team.org_id })
        .eq("student_event_id", studentEventId)
        .select("*, person:students(*)")
        .single();
      if (error) throw error;
      return data;
    },

    /** Move student to an org (removes team affiliation) */
    async transferToOrg(studentEventId: number, orgId: number) {
      const { data, error } = await supabase
        .from("student_events")
        .update({
          org_id: orgId === -1 ? null : orgId,
          team_id: null,
        })
        .eq("student_event_id", studentEventId)
        .select("*, person:students(*)")
        .single();
      if (error) throw error;
      return data;
    },

    /** Remove student from team (keep event registration) */
    async removeFromTeam(studentEventId: number) {
      const { data, error } = await supabase
        .from("student_events")
        .update({ team_id: null })
        .eq("student_event_id", studentEventId)
        .select("*, person:students(*)")
        .single();
      if (error) throw error;
      return data;
    },

    /** Delete student registration from event */
    async removeFromEvent(studentEventId: number) {
      // Delete custom field values first
      const { error: cfError } = await supabase
        .from("custom_field_values")
        .delete()
        .eq("student_event_id", studentEventId);
      if (cfError) throw cfError;

      const { error } = await supabase
        .from("student_events")
        .delete()
        .eq("student_event_id", studentEventId);
      if (error) throw error;

      return { success: true };
    },
  };
}
