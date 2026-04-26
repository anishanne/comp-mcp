/**
 * Truncate large JSON responses to stay within token limits.
 * If the stringified result exceeds MAX_RESPONSE_LENGTH, it truncates
 * arrays and adds a note about how many items were omitted.
 */
export declare function truncateResponse(data: any): string;
