import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// CSV dos relatórios (lê as views; só admin). Separador ";" e decimal com vírgula, com BOM: abre certo no Excel em português.
// Texto que começaria com = + - @ ganha um apóstrofo na frente (evita injeção de fórmula no Excel).
const reais = (c: unknown) => (Number(c ?? 0) / 100).toFixed(2).replace('.', ',');
const cel = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dia = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Não autorizado', { status: 401 });
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (perfil?.role !== 'admin') return new NextResponse('Não encontrado', { status: 404 });

  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (nivel?.currentLevel !== 'aal2') return new NextResponse('2FA necessário', { status: 403 });

  const tipo = request.nextUrl.searchParams.get('tipo');
  let cab: string[] = [], linhas: unknown[][] = [];
  if (tipo === 'diario') {
    const { data } = await supabase.from('sales_summary').select('*').order('sale_date', { ascending: false });
    cab = ['Dia', 'Pedidos', 'Cancelados', 'Faturamento (R$)', 'Ticket médio (R$)'];
    linhas = (data ?? []).map(d => [dia(d.sale_date), d.total_orders, d.cancelled_orders, reais(d.revenue_cents), reais(d.average_ticket_cents)]);
  } else if (tipo === 'mensal') {
    const { data } = await supabase.from('monthly_sales').select('*').order('month', { ascending: false });
    cab = ['Mês', 'Pedidos', 'Faturamento (R$)'];
    linhas = (data ?? []).map(m => [(m.month ?? '').slice(0, 7).split('-').reverse().join('/'), m.total_orders, reais(m.revenue_cents)]);
  } else if (tipo === 'produtos') {
    const { data } = await supabase.from('best_selling_products').select('*').order('units_sold', { ascending: false });
    cab = ['Produto', 'Unidades', 'Receita (R$)', 'Pedidos'];
    linhas = (data ?? []).map(t => [t.product_name, t.units_sold, reais(t.revenue_cents), t.orders_count]);
  } else {
    return new NextResponse('Tipo inválido', { status: 400 });
  }

  const csv = '﻿' + [cab, ...linhas].map(l => l.map(cel).join(';')).join('\r\n') + '\r\n';
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mdogao-${tipo}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
