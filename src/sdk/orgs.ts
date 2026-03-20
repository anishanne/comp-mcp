import { SupabaseClient } from "@supabase/supabase-js";

function assertEventAllowed(eventId: number, eventIds: number[]) {
  if (!eventIds.includes(eventId)) {
    throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
  }
}

export function createOrgsSDK(supabase: SupabaseClient, eventIds: number[]) {
  return {
    /** List all orgs registered for an event */
    async list(eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("org_events")
        .select(`
          *,
          org:orgs(
            *,
            coaches:org_coaches(
              *,
              person:coaches(*)
            )
          )
        `)
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },

    /** Get org details with coaches */
    async get(orgId: number) {
      const { data, error } = await supabase
        .from("orgs")
        .select("*")
        .eq("org_id", orgId)
        .single();
      if (error) throw error;

      const { data: coaches, error: coachError } = await supabase
        .from("org_coaches")
        .select("*, person:coaches(*)")
        .eq("org_id", orgId);
      if (coachError) throw coachError;

      return { ...data, coaches };
    },

    /** Full org details: coaches, teams, event registration */
    async getDetails(orgId: number, eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: org, error: orgError } = await supabase
        .from("orgs")
        .select("*")
        .eq("org_id", orgId)
        .single();
      if (orgError) throw orgError;

      const { data: coaches, error: coachError } = await supabase
        .from("org_coaches")
        .select("*, person:coaches(*)")
        .eq("org_id", orgId);
      if (coachError) throw coachError;

      // Get teams with members
      const { data: teams, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("org_id", orgId)
        .eq("event_id", eventId);
      if (teamError) throw teamError;

      for (const team of teams as any[]) {
        const { data: members, error: membersError } = await supabase
          .from("student_events")
          .select("*, person:students(*)")
          .eq("team_id", team.team_id)
          .order("front_id", { ascending: true });
        if (membersError) throw membersError;
        team.members = members;
      }

      // Get org_event
      const { data: orgEvent, error: oeError } = await supabase
        .from("org_events")
        .select("*, event:events(*)")
        .eq("event_id", eventId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (oeError) throw oeError;

      return { ...org, coaches, teams, orgEvent };
    },

    /** Get org's teams with members */
    async getTeams(orgId: number, eventId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: teams, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("org_id", orgId)
        .eq("event_id", eventId);
      if (teamError) throw teamError;

      for (const team of teams as any[]) {
        const { data: members, error } = await supabase
          .from("student_events")
          .select("*, person:students(*)")
          .eq("team_id", team.team_id)
          .order("front_id", { ascending: true });
        if (error) throw error;
        team.members = members;
      }

      return teams;
    },

    /** Get net available tickets for an org */
    async getTicketCount(eventId: number, orgId: number) {
      assertEventAllowed(eventId, eventIds);

      const { data: activeTickets, error: activeError } = await supabase
        .from("ticket_orders")
        .select("quantity")
        .eq("org_id", orgId)
        .eq("event_id", eventId);
      if (activeError) throw activeError;

      const totalActive = activeTickets?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

      const { data: refundedTickets, error: refundError } = await supabase
        .from("refund_requests")
        .select("quantity, ticket_orders!inner(id, org_id, event_id)")
        .in("refund_status", ["PENDING", "APPROVED"])
        .eq("ticket_orders.org_id", orgId)
        .eq("ticket_orders.event_id", eventId);
      if (refundError) throw refundError;

      const totalRefunded = refundedTickets?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;

      return totalActive - totalRefunded;
    },

    /** Get all ticket orders + refund requests for an org */
    async getTicketOrders(orgId: number, eventId: number) {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("*, refund_requests(*)")
        .eq("org_id", orgId)
        .eq("event_id", eventId);
      if (error) throw error;
      return data;
    },

    /** Remove student from org (clears org_id and team_id) */
    async removeStudent(studentEventId: number) {
      const { data, error } = await supabase
        .from("student_events")
        .update({ org_id: null, team_id: null })
        .eq("student_event_id", studentEventId)
        .select("*, person:students(*)")
        .single();
      if (error) throw error;
      return data;
    },
  };
}
