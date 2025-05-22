import { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Mr Kato - Realtime Patient Simulator",
  description: "A demo app from OpenAI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
