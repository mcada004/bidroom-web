import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";
import Header from "@/src/components/Header";

export const metadata: Metadata = {
  title: "Bidroom",
  description: "Room auctions for group trips",
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
