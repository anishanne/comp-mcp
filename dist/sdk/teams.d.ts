import { SupabaseClient } from "@supabase/supabase-js";
export declare function createTeamsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** List all teams with member count for an event */
    list(eventId: number): Promise<any[]>;
    /** Get team details with members */
    get(teamId: number): Promise<any>;
    /** Search by team name, join code, or front_id */
    search(eventId: number, params: {
        name?: string;
        joinCode?: string;
        frontId?: number;
    }): Promise<any[]>;
    /**
     * Resolve a team by front_id (the user-facing ID). Returns team with members or null.
     */
    getByFrontId(eventId: number, frontId: number): Promise<any>;
    /** Get team members */
    getMembers(teamId: number): Promise<any[]>;
    /** Get team ticket pool (total tickets minus refunds) */
    getAvailableTickets(teamId: number, eventId: number): Promise<{
        pool: number;
        used: number;
    }>;
    /** Transfer team to org (uses RPC for transactional safety) */
    transferToOrg(teamId: number, orgId: number): Promise<{
        team: any;
        students: any;
    }>;
    /** Create a new team */
    create(eventId: number, teamData: {
        team_name?: string;
        org_id?: number;
    }): Promise<any>;
    /** Update team name */
    update(teamId: number, data: {
        team_name?: string;
    }): Promise<any>;
    /** Delete team from event */
    delete(teamId: number, deleteStudents?: boolean): Promise<{
        success: boolean;
        affectedStudents: number;
        deletedStudents: number;
    }>;
};
