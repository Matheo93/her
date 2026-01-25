import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Eva - Ton Compagnon IA Vocale",
  description: "Parle avec Eva, une IA compagnon chaleureuse et empathique. Conversations vocales naturelles, avatar expressif animé, et interactions personnalisées. Inspirée du film Her.",
  keywords: ["IA", "assistant vocal", "compagnon IA", "Her", "Eva", "conversation", "voice AI"],
  authors: [{ name: "EVA-VOICE" }],
  openGraph: {
    title: "Eva - Ton Compagnon IA Vocale",
    description: "Parle avec Eva, une IA compagnon chaleureuse. Conversations naturelles avec avatar expressif.",
    type: "website",
    locale: "fr_FR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
