import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import Header from "@/src/components/Header";

export const metadata: Metadata = {
  metadataBase: new URL("https://bidroom.live"),
  title: "Bidroom",
  description: "Fair room bidding for group trips.",
  openGraph: {
    title: "Bidroom",
    description: "Fair room bidding for group trips.",
    url: "https://bidroom.live",
    siteName: "Bidroom",
    type: "website",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "Bidroom",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bidroom",
    description: "Fair room bidding for group trips.",
    images: ["/og.svg"],
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
