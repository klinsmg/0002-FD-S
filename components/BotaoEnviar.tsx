'use client';
import { useFormStatus } from 'react-dom';

// Botão de envio que avisa enquanto a Server Action roda (evita clique duplo e a sensação de "travou").
export default function BotaoEnviar({ children, pendente, className = 'btn btn-p' }: { children: React.ReactNode; pendente: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} aria-busy={pending}>{pending ? pendente : children}</button>;
}
