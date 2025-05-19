"use client";

import React from 'react';

export default function KatoCaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // All providers have been moved to client-layout.tsx
  // This layout now simply renders its children.
  return <>{children}</>;
} 