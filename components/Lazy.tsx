'use client';
import dynamic from 'next/dynamic';

// Cookies e Runtime (Alpine + GSAP) não bloqueiam a renderização inicial.
const Cookies = dynamic(() => import('./Cookies'), { ssr: false });
const Runtime = dynamic(() => import('./Runtime'), { ssr: false });

export default function Lazy() {
  return <><Cookies /><Runtime /></>;
}
