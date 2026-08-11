/**
 * Session timing, shared so the browser and the API cannot drift apart.
 *
 * The API's session cookie is rolling: every request resets the clock (§7.1).
 * Filling in a long form issues no requests at all, so a 59-field participant
 * create page can sit past the timeout and only discover it when Save returns
 * 401 — which is how staff lost whole forms. The browser warns before that
 * happens, and it has to warn against the same number the server enforces.
 */

/** Idle window before the API invalidates a session. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * How long before expiry to warn. Three minutes is enough to finish a sentence
 * and press a button, without nagging someone who is simply reading.
 */
export const SESSION_WARN_BEFORE_MS = 3 * 60 * 1000;
