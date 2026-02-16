import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import Header from "@/src/components/Header";

const ogVersion = process.env.NEXT_PUBLIC_OG_VERSION ?? "1";
const ogImageUrl = `https://bidroom.live/og.png?v=${encodeURIComponent(ogVersion)}`;

export const metadata: Metadata = {
  metadataBase: new URL("https://bidroom.live"),
  title: "Bidroom",
  description: "Bidroom",
  openGraph: {
    title: "Bidroom",
    description: "Bidroom",
    url: "https://bidroom.live/",
    siteName: "Bidroom",
    type: "website",
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: "Bidroom",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bidroom",
    description: "Bidroom",
    images: [ogImageUrl],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="app-shell">
            <Header />
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
