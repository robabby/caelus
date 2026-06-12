export const metadata = {
  title: "caelus starter",
  description: "Natal charts in the browser — caelus + caelus-birth + caelus-wheel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        background: "#13101e",
        color: "#e8e4f0",
        fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
        margin: 0,
        lineHeight: 1.6,
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.2rem" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
