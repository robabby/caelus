export const metadata = {
  title: "caelus",
  description: "Astrological ephemeris. ~85 KB, client-side, checked to ~1″ vs Swiss Ephemeris.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-monospace, monospace", maxWidth: 720, margin: "3rem auto", padding: "0 1rem", background: "#0c0a14", color: "#e8e4f0" }}>
        {children}
      </body>
    </html>
  );
}
