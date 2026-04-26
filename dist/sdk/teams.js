function assertEventAllowed(eventId, eventIds) {
    if (!eventIds.includes(eventId)) {
        throw new Error(`Event ${eventId} is not accessible. Allowed: ${eventIds.join(", ")}`);
    }
}
export function createTeamsSDK(supabase, eventIds) {
    return {
        /** List all teams with member count for an event */
        async list(eventId) {
            assertEventAllowed(eventId, eventIds);
            const { data, error } = await supabase
                .from("teams")
                .select("*")
                .eq("event_id", eventId);
            if (error)
                throw error;
            return data;
        },
        /** Get team details with members */
        async get(teamId) {
            const { data: teamData, error: teamError } = await supabase
                .from("teams")
                .select("*")
                .eq("team_id", teamId)
                .single();
            if (teamError)
                throw teamError;
            assertEventAllowed(teamData.event_id, eventIds);
            const { data: members, error: membersError } = await supabase
                .from("student_events")
                .select("*, person:students(*)")
                .eq("team_id", teamId)
                .order("front_id", { ascending: true });
            if (membersError)
                throw membersError;
            return { ...teamData, members };
        },
        /** Search by team name, join code, or front_id */
        async search(eventId, params) {
            assertEventAllowed(eventId, eventIds);
            let query = supabase
                .from("teams")
                .select("*")
                .eq("event_id", eventId);
            if (params.name) {
                query = query.ilike("team_name", `%${params.name}%`);
            }
            if (params.joinCode) {
                query = query.eq("join_code", params.joinCode);
            }
            if (params.frontId !== undefined) {
                query = query.eq("front_id", params.frontId);
            }
            const { data, error } = await query;
            if (error)
                throw error;
            return data;
        },
        /**
         * Resolve a team by front_id (the user-facing ID). Returns team with members or null.
         */
        async getByFrontId(eventId, frontId) {
            assertEventAllowed(eventId, eventIds);
            const { data: team, error } = await supabase
                .from("teams")
                .select("*")
                .eq("event_id", eventId)
                .eq("front_id", frontId)
                .maybeSingle();
            if (error)
                throw error;
            if (!team)
                return null;
            const { data: members, error: mErr } = await supabase
                .from("student_events")
                .select("*, person:students(*)")
                .eq("team_id", team.team_id)
                .order("front_id", { ascending: true });
            if (mErr)
                throw mErr;
            return { ...team, members };
        },
        /** Get team members */
        async getMembers(teamId) {
            const { data, error } = await supabase
                .from("student_events")
                .select("*, person:students(*)")
                .eq("team_id", teamId)
                .order("front_id", { ascending: true });
            if (error)
                throw error;
            return data;
        },
        /** Get team ticket pool (total tickets minus refunds) */
        async getAvailableTickets(teamId, eventId) {
            assertEventAllowed(eventId, eventIds);
            const { data: teamMembers, error: tmError } = await supabase
                .from("student_events")
                .select("student_id")
                .eq("team_id", teamId)
                .eq("event_id", eventId);
            if (tmError)
                throw tmError;
            if (!teamMembers || teamMembers.length === 0)
                return { pool: 0, used: 0 };
            const studentIds = teamMembers.map((m) => m.student_id);
            const { data: tickets, error: tError } = await supabase
                .from("ticket_orders")
                .select("quantity")
                .eq("event_id", eventId)
                .in("student_id", studentIds);
            if (tError)
                throw tError;
            const totalTickets = tickets?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;
            const { data: refunds, error: rError } = await supabase
                .from("refund_requests")
                .select("quantity, ticket_orders!inner(student_id, event_id)")
                .in("refund_status", ["PENDING", "APPROVED"])
                .eq("ticket_orders.event_id", eventId)
                .in("ticket_orders.student_id", studentIds);
            if (rError)
                throw rError;
            const totalRefunds = refunds?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;
            return { pool: totalTickets - totalRefunds, used: teamMembers.length };
        },
        /** Transfer team to org (uses RPC for transactional safety) */
        async transferToOrg(teamId, orgId) {
            const { data, error } = await supabase.rpc("transfer_team_to_organization", {
                p_team_id: teamId,
                p_new_org_id: orgId === -1 ? null : orgId,
            });
            if (error)
                throw error;
            return { team: data.team, students: data.students || [] };
        },
        /** Create a new team */
        async create(eventId, teamData) {
            assertEventAllowed(eventId, eventIds);
            const { data, error } = await supabase
                .from("teams")
                .insert({ event_id: eventId, ...teamData })
                .select()
                .single();
            if (error)
                throw error;
            return data;
        },
        /** Update team name */
        async update(teamId, data) {
            const { data: updated, error } = await supabase
                .from("teams")
                .update(data)
                .eq("team_id", teamId)
                .select()
                .single();
            if (error)
                throw error;
            return updated;
        },
        /** Delete team from event */
        async delete(teamId, deleteStudents = false) {
            // Find students in this team
            const { data: students, error: studentsError } = await supabase
                .from("student_events")
                .select("student_event_id")
                .eq("team_id", teamId);
            if (studentsError)
                throw studentsError;
            if (students.length > 0) {
                if (deleteStudents) {
                    for (const student of students) {
                        await supabase.from("custom_field_values").delete().eq("student_event_id", student.student_event_id);
                        await supabase.from("student_events").delete().eq("student_event_id", student.student_event_id);
                    }
                }
                else {
                    const { error } = await supabase
                        .from("student_events")
                        .update({ team_id: null })
                        .eq("team_id", teamId);
                    if (error)
                        throw error;
                }
            }
            // Delete team custom field values
            await supabase.from("custom_field_values").delete().eq("team_id", teamId);
            // Delete team
            const { error } = await supabase.from("teams").delete().eq("team_id", teamId);
            if (error)
                throw error;
            return { success: true, affectedStudents: students.length, deletedStudents: deleteStudents ? students.length : 0 };
        },
    };
}
//# sourceMappingURL=teams.js.map