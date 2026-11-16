/**
 * Text keys of the dental codes. The code and its grade come from data
 * (`domain/dental/codes.ts`), so the typed message keys cannot follow them;
 * `keys.test.ts` checks that every code, grade and quick button has its text.
 */

export const levelKey = (code: string, level: string) => `levels.${code}.${level}` as never;

export const quickKey = (id: string) => `quick.${id}` as never;
