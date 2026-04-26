import { SupabaseClient } from "@supabase/supabase-js";
export declare function createAnalyticsSDK(supabase: SupabaseClient, eventIds: number[]): {
    /** Registration summary: total students, teams, orgs, independent students */
    registrationSummary(eventId: number): Promise<{
        totalStudents: number;
        totalTeams: number;
        totalOrgs: number;
        independentStudents: number;
        studentsWithoutTeam: number;
    }>;
    /** Distribution of team sizes */
    teamSizeDistribution(eventId: number): Promise<{
        teamSize: number;
        count: number;
    }[]>;
    /** Students per org, teams per org */
    orgBreakdown(eventId: number): Promise<{
        orgId: any;
        orgName: any;
        students: number;
        teams: number;
    }[]>;
    /** Ticket summary: sold, refunded, pending, net revenue */
    ticketSummary(eventId: number): Promise<{
        ticketPriceCents: any;
        totalSold: number;
        totalRefunded: number;
        totalPendingRefund: number;
        netTickets: number;
        grossRevenueCents: number;
        netRevenueCents: number;
    }>;
    /** Per-test grade summary */
    gradeSummary(eventId: number): Promise<{
        testId: any;
        testName: any;
        isTeam: any;
        testTakers: number;
        gradedAnswers: number;
        averageScore: number | null;
    }[]>;
    /** Registrations over time (by day) */
    registrationTimeline(eventId: number): Promise<{
        date: string;
        newRegistrations: number;
        cumulative: number;
    }[]>;
    /** Count of unassigned students */
    studentsWithoutTeam(eventId: number): Promise<number>;
    /**
     * Per-student score grid across every individual (non-team) test in the event.
     * Returns `{ tests, rows }` where each row has `scores: { [testName]: number | null }`.
     * Intended for cross-test analysis ("top scorer on X is top-N on Y?"). Scores are totals
     * across all graded answers; null means the student did not sit that test.
     */
    studentTestMatrix(eventId: number): Promise<{
        tests: {
            testId: any;
            testName: any;
        }[];
        rows: {
            front_id: any;
            name: any;
            team_name: string | null;
            student_id: any;
            email: any;
            team_id: any;
            scores: Record<string, number | null>;
        }[];
    }>;
    /**
     * Per-team score grid across every team test in the event.
     * Returns `{ tests, rows }` where each row has `scores: { [testName]: number | null }`.
     * Intended for cross-test team analysis ("team crushed Guts but flopped Team round").
     */
    teamTestMatrix(eventId: number): Promise<{
        tests: {
            testId: any;
            testName: any;
        }[];
        rows: {
            front_id: any;
            team_name: any;
            team_id: any;
            org_id: any;
            org_name: string | null;
            scores: Record<string, number | null>;
        }[];
    }>;
    /** Aggregate custom field responses */
    customFieldSummary(eventId: number, table?: "orgs" | "students" | "teams"): Promise<{
        fieldId: any;
        label: any;
        type: any;
        totalResponses: number;
        valueCounts: {
            value: string;
            count: number;
        }[];
    }[]>;
};
