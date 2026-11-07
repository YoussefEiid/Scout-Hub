import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { siteBranding } from "@/config/branding";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-cairo",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#173C32",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://alfanar-scouts.org'),
  title: {
    default: `${siteBranding.nameAr} | ${siteBranding.nameEn}`,
    template: `%s | ${siteBranding.nameAr}`,
  },
  description: `${siteBranding.fullTitleAr} - ${siteBranding.descriptionAr}`,
  applicationName: siteBranding.nameAr,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteBranding.nameAr,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: `${siteBranding.nameAr} | ${siteBranding.nameEn}`,
    description: siteBranding.fullTitleAr,
    siteName: siteBranding.nameAr,
    images: [
      {
        url: siteBranding.logoUrl,
        width: 1024,
        height: 1024,
        alt: siteBranding.logoAlt,
      },
    ],
    locale: "ar_EG",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`}>
      <body className="min-h-full flex flex-col font-cairo bg-cream text-charcoal selection:bg-orange selection:text-white">
        {children}
      </body>
    </html>
  );
}
