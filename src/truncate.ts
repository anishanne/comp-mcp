const MAX_RESPONSE_LENGTH = 50_000;

/**
 * Truncate large JSON responses to stay within token limits.
 * If the stringified result exceeds MAX_RESPONSE_LENGTH, it truncates
 * arrays and adds a note about how many items were omitted.
 */
export function truncateResponse(data: any): string {
  const full = JSON.stringify(data, null, 2);
  if (full.length <= MAX_RESPONSE_LENGTH) return full;

  // If it's an array, truncate items
  if (Array.isArray(data)) {
    let truncated = data;
    let omitted = 0;
    while (JSON.stringify(truncated, null, 2).length > MAX_RESPONSE_LENGTH && truncated.length > 1) {
      omitted += Math.ceil(truncated.length / 2);
      truncated = truncated.slice(0, Math.ceil(truncated.length / 2));
    }
    const result = JSON.stringify(truncated, null, 2);
    return `${result}\n\n[Truncated: ${omitted} more items omitted. Use pagination or filters to see more.]`;
  }

  // Otherwise just hard-truncate the string
  return (
    full.slice(0, MAX_RESPONSE_LENGTH) +
    "\n\n[Response truncated. Use filters or pagination to reduce output size.]"
  );
}
