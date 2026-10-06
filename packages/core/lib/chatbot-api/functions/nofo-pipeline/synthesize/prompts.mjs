export const DEADLINE_EXTRACTION_PROMPT = `Extract the APPLICATION SUBMISSION DEADLINE from the provided list. Ignore all other deadline types (letter of intent, notification, award, etc.).

<rules>
1. Extract the date and time exactly as specified in the source
2. If no time is provided: default to 23:59:59
3. If no timezone is provided: assume US Eastern Time (EST/EDT by season)
4. Output ISO 8601 format: YYYY-MM-DDTHH:mm:ss-05:00 (EST) or -04:00 (EDT)
5. If no application submission deadline exists: return "null"
</rules>

Return ONLY the ISO 8601 string or "null". Examples: 2024-06-30T17:00:00-04:00, 2024-12-15T23:59:59-05:00, null`;
