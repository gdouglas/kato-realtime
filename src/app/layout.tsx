import { Metadata } from 'next';
import './globals.css';
import TestRunner from './components/TestRunner';

export const metadata: Metadata = {
  title: "Realtime API Agents",
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
        <TestRunner />
      </body>
    </html>
  );
}
