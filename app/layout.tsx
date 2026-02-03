import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/src/context/AuthContext";

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
            <header className="top-nav">
              <div className="brand">Bidroom</div>
              <div className="nav-actions">
                <span>Room auctions</span>
                <span className="pill">Preview</span>
              </div>
            </header>
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
