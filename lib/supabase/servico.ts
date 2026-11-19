import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// Cliente com a chave SECRETA (service_role). Uso restrito a duas funções de segurança que não podem confiar em quem
// chama a API (access_check e log_denied, migração 019): o servidor informa o IP e o usuário já verificado.
// NUNCA usar para ler/gravar dados de clientes (isso continua com o cliente do usuário + RLS).
// 'server-only' quebra o build se alguém importar isto num componente do navegador.
let cache: ReturnType<typeof createClient<Database>> | null | undefined;
export function clienteServico() {
  if (cache !== undefined) return cache;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cache = url && chave ? createClient<Database>(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  if (!cache) console.error('[seguranca] SUPABASE_SERVICE_ROLE_KEY ausente: limites de tentativa desligados');
  return cache;
}

// IP pela metade para logs (LGPD: o registro completo fica só no banco, por 7 dias)
export const ipLog = (ip: string | null) => (ip ? ip.replace(/(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x').replace(/^([0-9a-f]+:[0-9a-f]+):.*$/i, '$1:…') : null);
