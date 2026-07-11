import type { Metadata } from "next";
import "./globals.css";

const title = "Music With No Names · Sound Labs";
export const dynamic = "force-static";
const description =
  "Audible, visual explorations of frequency ratios, harmonic fields, pulse cycles, and the physical relationships beneath musical labels.";

const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    "https://nathaniel-mahieu.github.io/music-with-no-names/",
);
const imageUrl = new URL("og.png", metadataBase).toString();
const iconUrl = new URL("favicon.svg", metadataBase).toString();

export const metadata: Metadata = {
  metadataBase,
  title,
  description,
  icons: { icon: iconUrl },
  openGraph: {
    title,
    description,
    type: "website",
    images: [{ url: imageUrl, width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [imageUrl],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
