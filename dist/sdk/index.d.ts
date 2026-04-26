import { SupabaseClient } from "@supabase/supabase-js";
export declare function createAPI(supabase: SupabaseClient, eventIds: number[]): {
    events: {
        list(): Promise<any[]>;
        get(eventId: number): Promise<any>;
        getTests(eventId: number): Promise<any[]>;
        getOrganizations(eventId: number): Promise<any[]>;
        getTeams(eventId: number): Promise<any[]>;
        getStudents(eventId: number): Promise<any[]>;
        getIndependentTeams(eventId: number): Promise<any[]>;
        getTicketCount(eventId: number): Promise<number>;
        getCustomFields(eventId: number, table?: "orgs" | "students" | "teams"): Promise<any[]>;
    };
    students: {
        list(eventId: number, options?: {
            limit?: number;
            offset?: number;
            withDetails?: boolean;
        }): Promise<({
            error: true;
        } & ("Unexpected input: " | "Unexpected input: , team:teams(*), org_event:org_events(*, org:orgs(*))"))[]>;
        get(studentId: string, eventId: number): Promise<any>;
        getByFrontId(eventId: number, frontId: number): Promise<any>;
        search(params: {
            eventId: number;
            name?: string;
            email?: string;
            frontId?: number;
        }): Promise<any[]>;
        getWithoutTeam(eventId: number): Promise<any[]>;
        getTicketOrder(studentId: string, eventId: number): Promise<any>;
        getAvailableTickets(studentId: string, eventId: number): Promise<number>;
        transferToTeam(studentEventId: number, teamId: number): Promise<any>;
        transferToOrg(studentEventId: number, orgId: number): Promise<any>;
        removeFromTeam(studentEventId: number): Promise<any>;
        removeFromEvent(studentEventId: number): Promise<{
            success: boolean;
        }>;
    };
    teams: {
        list(eventId: number): Promise<any[]>;
        get(teamId: number): Promise<any>;
        search(eventId: number, params: {
            name?: string;
            joinCode?: string;
            frontId?: number;
        }): Promise<any[]>;
        getByFrontId(eventId: number, frontId: number): Promise<any>;
        getMembers(teamId: number): Promise<any[]>;
        getAvailableTickets(teamId: number, eventId: number): Promise<{
            pool: number;
            used: number;
        }>;
        transferToOrg(teamId: number, orgId: number): Promise<{
            team: any;
            students: any;
        }>;
        create(eventId: number, teamData: {
            team_name?: string;
            org_id?: number;
        }): Promise<any>;
        update(teamId: number, data: {
            team_name?: string;
        }): Promise<any>;
        delete(teamId: number, deleteStudents?: boolean): Promise<{
            success: boolean;
            affectedStudents: number;
            deletedStudents: number;
        }>;
    };
    orgs: {
        list(eventId: number): Promise<any[]>;
        get(orgId: number): Promise<any>;
        getDetails(orgId: number, eventId: number): Promise<any>;
        getTeams(orgId: number, eventId: number): Promise<any[]>;
        getTicketCount(eventId: number, orgId: number): Promise<number>;
        getTicketOrders(orgId: number, eventId: number): Promise<any[]>;
        removeStudent(studentEventId: number): Promise<any>;
    };
    tickets: {
        listOrders(eventId: number): Promise<any[]>;
        getOrder(ticketId: number): Promise<any>;
        listRefundRequests(eventId: number, status?: "PENDING" | "APPROVED" | "DENIED"): Promise<any[]>;
        getRefundRequest(refundId: number): Promise<any>;
        approveRefund(refundId: number, quantity: number, responseMessage?: string): Promise<any>;
        denyRefund(refundId: number, responseMessage?: string): Promise<any>;
        getEventRevenue(eventId: number): Promise<{
            ticketPriceCents: any;
            totalSold: number;
            totalRefunded: number;
            netTickets: number;
            grossRevenueCents: number;
            refundedCents: number;
            netRevenueCents: number;
        }>;
    };
    tests: {
        list(eventId: number): Promise<any[]>;
        get(testId: number): Promise<any>;
        getProblems(testId: number): Promise<any[]>;
        getTestTakers(testId: number): Promise<any[]>;
        getResults(testId: number): Promise<any[]>;
        getScanGradeStats(testId: number): Promise<{
            totalProblems: any;
            gradedProblems: any;
            conflictProblems: any;
        }>;
        getLeaderboard(testId: number, options?: {
            limit?: number;
        }): Promise<{
            rank: number;
            front_id: number | null;
            display_name: string | null;
            entity_type: "student" | "team";
            test_taker_id: number | null;
            student_id: string | null;
            team_id: number | null;
            totalScore: number;
            problemCount: number;
            lastSubmittedAt: string | null;
            scoreBreakdown: Record<import("./scoring.js").ScoreSource, number>;
        }[]>;
        getProblemStats(testId: number): Promise<{
            test_problem_id: number;
            problem_number: number;
            page_number: number;
            totalPoints: number;
            attempted: number;
            correct: number;
            incorrect: number;
            unsure: number;
            conflict: number;
            ungraded: number;
            avgScore: number | null;
        }[]>;
        findAnswers(params: {
            testId?: number;
            test_problem_id?: number;
            problem_number?: number;
            answer: string;
            limit?: number;
        }): Promise<any[]>;
        findAnswerCollisions(testId: number, options?: {
            windowSeconds?: number;
            minGroupSize?: number;
            problemNumbers?: number[];
            onlyIncorrect?: boolean;
        }): Promise<{
            test_problem_id: number;
            problem_number: number | null;
            answer_latex: string;
            windowSpanSeconds: number | null;
            takers: Array<{
                front_id: number | null;
                display_name: string | null;
                test_taker_id: number;
                student_id: string | null;
                team_id: number | null;
                last_edited_time: string | null;
                score: number | null;
                correct: boolean | null;
            }>;
        }[]>;
        getTakerScore(testId: number, params: {
            front_id?: number;
            test_taker_id?: number;
        }): Promise<{
            rank: number;
            front_id: number | null;
            display_name: string | null;
            entity_type: "student" | "team";
            test_taker_id: number | null;
            student_id: string | null;
            team_id: number | null;
            totalScore: number;
            problemCount: number;
            lastSubmittedAt: string | null;
            scoreBreakdown: Record<import("./scoring.js").ScoreSource, number>;
            perProblem: Record<number, {
                test_problem_id: number;
                problem_number: number | null;
                source: string;
                state: string;
                points: number;
                answer_latex: string | null | undefined;
                lastEditedAt: string | null;
            }>;
        } | null>;
        getScanGradingProgress(testId: number): Promise<{
            scansTotal: number;
            graded: number;
            conflicts: number;
            overridden: number;
            ungraded: number;
            unsure: number;
            correct: number;
            incorrect: number;
            test_problem_id: any;
            problem_number: any;
            page_number: any;
            totalPoints: any;
        }[]>;
        getGutsScoreboard(testId: number): Promise<{
            front_id: number | null;
            team_id: number;
            team_name: string | null;
            totalScore: number;
            correctCount: number;
            problems: Record<number, {
                status: string | null;
                score: number;
                answer_latex: string | null;
                graded_at: string | null;
            }>;
            lastGradedAt: string | null;
            rank: number;
        }[]>;
        getAnswerHistogram(testId: number, problem_number: number): Promise<{
            test_problem_id: any;
            problem_number: number;
            totalAttempts: number;
            distinctAnswers: number;
            answers: {
                answer_latex: string;
                count: number;
                frequency: number;
                correct: boolean | null;
                pointsEach: number;
            }[];
        }>;
        getTakerTimeline(testId: number, params: {
            front_id?: number;
            test_taker_id?: number;
        }): Promise<{
            test_taker_id: number | undefined;
            front_id: number | null;
            events: {
                test_problem_id: any;
                problem_number: any;
                answer_latex: any;
                correct: any;
                score: any;
                last_edited_time: any;
                secondsSincePrev: number | null;
            }[];
        } | null>;
        findRapidSubmissions(testId: number, options?: {
            minAnswers?: number;
            withinSeconds?: number;
            onlyIncorrect?: boolean;
        }): Promise<{
            front_id: any;
            display_name: any;
            test_taker_id: number;
            student_id: any;
            team_id: any;
            startedAt: string;
            endedAt: string;
            spanSeconds: number;
            answerCount: number;
            answersPerSecond: number | null;
            answers: {
                problem_number: number | null;
                answer_latex: string;
                correct: boolean | null;
                score: number | null;
                last_edited_time: string;
            }[];
        }[]>;
        findSimilarTakers(testId: number, options?: {
            minShared?: number;
            limit?: number;
            problemNumbers?: number[];
        }): Promise<{
            score: number;
            sharedTotal: number;
            sharedCorrect: number;
            sharedIncorrect: number;
            takerA: {
                front_id: any;
                display_name: any;
                test_taker_id: number;
                student_id: any;
                team_id: any;
            };
            takerB: {
                front_id: any;
                display_name: any;
                test_taker_id: number;
                student_id: any;
                team_id: any;
            };
            sharedProblems: {
                problem_number: number | null;
                test_problem_id: number;
                answer_latex: string;
                correct: boolean | null;
            }[];
        }[]>;
    };
    analytics: {
        registrationSummary(eventId: number): Promise<{
            totalStudents: number;
            totalTeams: number;
            totalOrgs: number;
            independentStudents: number;
            studentsWithoutTeam: number;
        }>;
        teamSizeDistribution(eventId: number): Promise<{
            teamSize: number;
            count: number;
        }[]>;
        orgBreakdown(eventId: number): Promise<{
            orgId: any;
            orgName: any;
            students: number;
            teams: number;
        }[]>;
        ticketSummary(eventId: number): Promise<{
            ticketPriceCents: any;
            totalSold: number;
            totalRefunded: number;
            totalPendingRefund: number;
            netTickets: number;
            grossRevenueCents: number;
            netRevenueCents: number;
        }>;
        gradeSummary(eventId: number): Promise<{
            testId: any;
            testName: any;
            isTeam: any;
            testTakers: number;
            gradedAnswers: number;
            averageScore: number | null;
        }[]>;
        registrationTimeline(eventId: number): Promise<{
            date: string;
            newRegistrations: number;
            cumulative: number;
        }[]>;
        studentsWithoutTeam(eventId: number): Promise<number>;
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
    export: {
        students(eventId: number, format?: "json" | "csv"): Promise<string | {
            student_event_id: any;
            front_id: any;
            student_id: any;
            first_name: any;
            last_name: any;
            email: any;
            grade: any;
            team_id: any;
            org_id: any;
            waiver: string;
        }[]>;
        teams(eventId: number, format?: "json" | "csv"): Promise<string | {
            team_id: any;
            team_name: any;
            org_id: any;
            join_code: any;
            front_id: any;
        }[]>;
        orgs(eventId: number, format?: "json" | "csv"): Promise<string | {
            org_event_id: any;
            org_id: any;
            org_name: any;
            address: any;
            join_code: any;
        }[]>;
        ticketOrders(eventId: number, format?: "json" | "csv"): Promise<string | {
            id: any;
            student_id: any;
            org_id: any;
            quantity: any;
            order_id: any;
            ticket_service: any;
            created_at: any;
        }[]>;
        refundRequests(eventId: number, format?: "json" | "csv"): Promise<string | {
            refund_id: any;
            ticket_id: any;
            quantity: any;
            status: any;
            request_reason: any;
            response_reason: any;
            created_at: any;
        }[]>;
    };
};
export type CompAPI = ReturnType<typeof createAPI>;
/**
 * Return a copy of `api` with every write method replaced by a function that
 * throws. Read methods pass through unchanged. The list of write methods is
 * sourced from WRITE_METHOD_PATHS in the API spec.
 */
export declare function createReadOnlyAPI(api: CompAPI): CompAPI;
