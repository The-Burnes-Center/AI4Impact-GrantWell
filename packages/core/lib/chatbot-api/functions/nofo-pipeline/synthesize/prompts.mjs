export const DEADLINE_EXTRACTION_PROMPT = `Find the application submission deadline in the list below. Ignore every other kind of date (letter of intent, notification, award, project period, reporting).

Reply with the deadline's calendar date as YYYY-MM-DD, exactly as the source states it. Do not convert time zones: the stored value is a date, so a deadline of 11:59 PM ET on June 30 is June 30. If the list has no application submission deadline, reply with null. Reply with only the date or null, for example 2026-06-30 or null.`;
