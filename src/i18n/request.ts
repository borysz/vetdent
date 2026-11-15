import { getRequestConfig } from "next-intl/server";
import { defaultLocale, timeZone } from "./config";

/**
 * next-intl request configuration. The locale is a constant for now (no locale
 * in the URL); when a second language is added it will come from the user's
 * profile instead.
 */
export default getRequestConfig(async () => {
  const locale = defaultLocale;

  return {
    locale,
    timeZone,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
