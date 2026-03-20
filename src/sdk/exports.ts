import { SupabaseClient } from "@supabase/supabase-js";

function assertEventAllowed(eventId: number, eventIds: number[]) {
  if (!eventIds.includes(eventId)) {
    throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
  }
}

function toCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export function createExportsSDK(supabase: SupabaseClient, eventIds: number[]) {
  return {
    /** Export student list */
    async students(eventId: number, format: "json" | "csv" = "json") {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("student_events")
        .select("student_event_id, front_id, team_id, org_id, waiver, person:students(student_id, first_name, last_name, email, grade)")
        .eq("event_id", eventId)
        .order("front_id", { ascending: true });
      if (error) throw error;

      const flat = (data || []).map((row: any) => ({
        student_event_id: row.student_event_id,
        front_id: row.front_id,
        student_id: row.person?.student_id,
        first_name: row.person?.first_name,
        last_name: row.person?.last_name,
        email: row.person?.email,
        grade: row.person?.grade,
        team_id: row.team_id,
        org_id: row.org_id,
        waiver: row.waiver ? "yes" : "no",
      }));

      return format === "csv" ? toCSV(flat) : flat;
    },

    /** Export teams with members */
    async teams(eventId: number, format: "json" | "csv" = "json") {
      assertEventAllowed(eventId, eventIds);
      const { data: teams, error: tErr } = await supabase
        .from("teams")
        .select("team_id, team_name, org_id, join_code, front_id")
        .eq("event_id", eventId);
      if (tErr) throw tErr;

      if (format === "csv") {
        const rows = [];
        for (const team of teams || []) {
          const { data: members, error: mErr } = await supabase
            .from("student_events")
            .select("person:students(first_name, last_name, email)")
            .eq("team_id", team.team_id);
          if (mErr) throw mErr;

          for (const m of members || []) {
            rows.push({
              team_id: team.team_id,
              team_name: team.team_name,
              org_id: team.org_id,
              member_name: `${(m as any).person?.first_name || ""} ${(m as any).person?.last_name || ""}`.trim(),
              member_email: (m as any).person?.email,
            });
          }
        }
        return toCSV(rows);
      }

      // JSON: include members nested
      for (const team of teams as any[]) {
        const { data: members, error: mErr } = await supabase
          .from("student_events")
          .select("*, person:students(*)")
          .eq("team_id", team.team_id)
          .order("front_id", { ascending: true });
        if (mErr) throw mErr;
        team.members = members;
      }
      return teams;
    },

    /** Export organizations */
    async orgs(eventId: number, format: "json" | "csv" = "json") {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("org_events")
        .select("org_event_id, org_id, join_code, org:orgs(name, address)")
        .eq("event_id", eventId);
      if (error) throw error;

      const flat = (data || []).map((row: any) => ({
        org_event_id: row.org_event_id,
        org_id: row.org_id,
        org_name: row.org?.name,
        address: row.org?.address,
        join_code: row.join_code,
      }));

      return format === "csv" ? toCSV(flat) : flat;
    },

    /** Export ticket orders */
    async ticketOrders(eventId: number, format: "json" | "csv" = "json") {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("id, student_id, org_id, quantity, order_id, ticket_service, created_at")
        .eq("event_id", eventId);
      if (error) throw error;

      return format === "csv" ? toCSV(data || []) : data;
    },

    /** Export refund requests */
    async refundRequests(eventId: number, format: "json" | "csv" = "json") {
      assertEventAllowed(eventId, eventIds);
      const { data, error } = await supabase
        .from("refund_requests")
        .select("id, ticket_id, quantity, refund_status, request_reason, response_reason, created_at, ticket:ticket_orders!inner(event_id)")
        .eq("ticket_orders.event_id", eventId);
      if (error) throw error;

      const flat = (data || []).map((row: any) => ({
        refund_id: row.id,
        ticket_id: row.ticket_id,
        quantity: row.quantity,
        status: row.refund_status,
        request_reason: row.request_reason,
        response_reason: row.response_reason,
        created_at: row.created_at,
      }));

      return format === "csv" ? toCSV(flat) : flat;
    },
  };
}
