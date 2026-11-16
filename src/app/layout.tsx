import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ServiceWorkerRegistration } from "@/components/offline/service-worker-registration";
import "./globals.css";

// `latin-ext` is required for the Hungarian ő and ű.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");

  return {
    title: {
      default: `${t("name")} – ${t("tagline")}`,
      template: `%s · ${t("name")}`,
    },
    description: t("description"),
    applicationName: t("name"),
    appleWebApp: {
      capable: true,
      title: t("name"),
      statusBarStyle: "default",
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
