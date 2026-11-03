import { ALT } from '@/lib/alt';
import Image from 'next/image';
export default function Logo({ size = 56, priority = false }: { size?: number; priority?: boolean }) {
  return <Image src="/logo-dogao.webp" alt={ALT.logo} width={size} height={size} priority={priority} />;
}
