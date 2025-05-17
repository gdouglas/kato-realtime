"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function KatoPageRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/cases/kato/speak');
  }, [router]);

  // Render null or a loading indicator while redirecting
  return null; 
}