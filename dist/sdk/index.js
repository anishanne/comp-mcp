import { createEventsSDK } from "./events.js";
import { createStudentsSDK } from "./students.js";
import { createTeamsSDK } from "./teams.js";
import { createOrgsSDK } from "./orgs.js";
import { createTicketsSDK } from "./tickets.js";
import { createTestsSDK } from "./tests.js";
import { createAnalyticsSDK } from "./analytics.js";
import { createExportsSDK } from "./exports.js";
import { WRITE_METHOD_PATHS } from "../spec/api-spec.js";
export function createAPI(supabase, eventIds) {
    return {
        events: createEventsSDK(supabase, eventIds),
        students: createStudentsSDK(supabase, eventIds),
        teams: createTeamsSDK(supabase, eventIds),
        orgs: createOrgsSDK(supabase, eventIds),
        tickets: createTicketsSDK(supabase, eventIds),
        tests: createTestsSDK(supabase, eventIds),
        analytics: createAnalyticsSDK(supabase, eventIds),
        export: createExportsSDK(supabase, eventIds),
    };
}
/**
 * Return a copy of `api` with every write method replaced by a function that
 * throws. Read methods pass through unchanged. The list of write methods is
 * sourced from WRITE_METHOD_PATHS in the API spec.
 */
export function createReadOnlyAPI(api) {
    const readOnly = {};
    for (const [category, methods] of Object.entries(api)) {
        const wrappedCategory = {};
        for (const [methodName, impl] of Object.entries(methods)) {
            const path = `${category}.${methodName}`;
            if (WRITE_METHOD_PATHS.has(path)) {
                wrappedCategory[methodName] = async () => {
                    throw new Error(`api.${path} is not available in read-only mode. This connection was authorized with the read-only token.`);
                };
            }
            else {
                wrappedCategory[methodName] = impl;
            }
        }
        readOnly[category] = wrappedCategory;
    }
    return readOnly;
}
//# sourceMappingURL=index.js.map