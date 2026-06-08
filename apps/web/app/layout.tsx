import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Samayak Admin Panel — Academic Operations Platform',
  description: 'Academic operations platform for BIT Mesra CSE Spring 2026. Manage departments, rooms, courses, faculty, timetables, and PDF ingestion.',
  keywords: ['academic', 'admin', 'timetable', 'BIT Mesra', 'Samayak', 'Anugat AI'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
