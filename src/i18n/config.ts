/**
 * Supported interface languages. Hungarian is the only one for now; adding a
 * language means adding it here and providing `messages/<locale>.json`.
 */
export const locales = ["hu"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "hu";

/** Used for date, time and number formatting across the app. */
export const timeZone = "Europe/Budapest";
