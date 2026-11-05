export const metadata = { title: 'Painel', robots: { index: false, follow: false } };

// Sem guarda aqui de propósito: /admin/login, /admin/login/2fa e /admin/seguranca precisam abrir sem AAL2.
// O painel protegido fica em app/admin/(painel), cujo layout e páginas chamam exigirAdmin().
export default function AdminRaiz({ children }: { children: React.ReactNode }) {
  return children;
}
