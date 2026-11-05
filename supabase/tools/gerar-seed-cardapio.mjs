// Gera supabase/migrations/008_seed_catalog.sql a partir do cardápio do site (lib/menu.ts) e de lib/info.ts.
// Rode na raiz do projeto (Node 22.18+ lê .ts direto):  node supabase/tools/gerar-seed-cardapio.mjs
// O SQL gerado é idempotente (upsert): pode ser aplicado mais de uma vez sem duplicar nada.
// Preços saem em CENTAVOS. Preço vazio = "valor a confirmar".
import { writeFileSync } from 'node:fs';
import { cats, pais, variantes, adicionais, complemento, molhos } from '../../lib/menu.ts';
import { info } from '../../lib/info.ts';

const q = v => (v === null || v === undefined || v === '' ? "''" : `'${String(v).replace(/'/g, "''")}'`);
const cents = p => (p === null || p === undefined ? '' : String(Math.round(p * 100)));
const SEM_PONTO = new Set(['bebidas', 'adicionais']); // categorias em que o ponto da carne não se aplica

const sections = pais.map((p, i) => `(${q(p.id)}, ${q(p.nome)}, ${i + 1})`);

const categories = [];
pais.forEach(p => p.subs.forEach(([slug, rotulo]) => {
  const c = cats.find(x => x.id === slug);
  categories.push(`(${q(p.id)}, ${q(slug)}, ${q(c.nome)}, ${q(p.subs.length > 1 ? rotulo : '')}, ${q(c.desc)}, ${q(c.nota)}, ${categories.length + 1})`);
}));

const products = [], variants = [], vistos = new Set();
for (const c of cats) {
  let ordem = 0;
  for (const g of c.grupos) {
    for (const i of g.itens) {
      const chave = `${c.id}|${g.t ?? ''}|${i.n}`;
      if (vistos.has(chave)) throw new Error(`Item repetido no cardápio: ${chave}`);
      vistos.add(chave);
      ordem += 1;
      const informativo = !!g.info;
      const vs = informativo ? [] : variantes(i);
      // preço único e sem rótulo vai em products.price_cents; várias opções (P/G...) vão em product_variants
      const unico = vs.length === 1 && vs[0].l === '';
      products.push(`(${q(c.id)}, ${q(g.t ?? '')}, ${q(i.n)}, ${q(i.d)}, ${informativo}, ${!informativo && !SEM_PONTO.has(c.id)}, ${q(unico ? cents(vs[0].p) : '')}, ${ordem})`);
      if (!informativo && !unico) vs.forEach((v, k) => variants.push(`(${q(c.id)}, ${q(g.t ?? '')}, ${q(i.n)}, ${q(v.l)}, ${q(cents(v.p))}, ${k + 1})`));
    }
  }
}

const extras = [];
molhos.forEach((m, i) => extras.push(`('sauce', ${q(m.n)}, ${q(cents(variantes(m)[0].p))}, ${i + 1})`));
adicionais.forEach((m, i) => extras.push(`('addon', ${q(m.n)}, ${q(cents(variantes(m)[0].p))}, ${i + 1})`));
complemento.forEach((m, i) => extras.push(`('complement', ${q(m.n)}, ${q(cents(variantes(m)[0].p))}, ${i + 1})`));

// 0 = domingo ... 6 = sábado. Seg-sex 11h-01h; sáb e dom 18h-01h (fecha na madrugada do dia seguinte).
const hours = [[0, '18:00', '01:00'], [1, '11:00', '01:00'], [2, '11:00', '01:00'], [3, '11:00', '01:00'], [4, '11:00', '01:00'], [5, '11:00', '01:00'], [6, '18:00', '01:00']]
  .map(([d, a, f]) => `(${d}, '${a}', '${f}', true, false)`);

const sql = `-- 008: dados iniciais (cardápio, extras, loja e horários) copiados do site.
-- GERADO por supabase/tools/gerar-seed-cardapio.mjs a partir de lib/menu.ts e lib/info.ts. Não edite à mão:
-- mudou o cardápio no código? Rode o gerador de novo. Idempotente (upsert). Cardápio de janeiro/2025.
-- Preços em centavos; vazio = "valor a confirmar". Preço único fica em products.price_cents; várias opções (P/G...)
-- ficam em product_variants.
-- ATENÇÃO: reaplicar este arquivo sobrescreve nome, descrição, preço e ordem. Alterações feitas pelo painel admin nesses campos se perdem.

insert into public.sections (slug, name, sort_order)
values
  ${sections.join(',\n  ')}
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.categories (section_id, slug, name, short_label, description, note, sort_order)
select s.id, v.slug, v.name, nullif(v.short_label, ''), nullif(v.description, ''), nullif(v.note, ''), v.sort_order
from (values
  ${categories.join(',\n  ')}
) as v (section_slug, slug, name, short_label, description, note, sort_order)
join public.sections s on s.slug = v.section_slug
on conflict (slug) do update
  set section_id = excluded.section_id, name = excluded.name, short_label = excluded.short_label,
      description = excluded.description, note = excluded.note, sort_order = excluded.sort_order;

insert into public.products (category_id, group_label, name, description, is_informational, requires_doneness, price_cents, sort_order)
select c.id, v.group_label, v.name, nullif(v.description, ''), v.is_informational, v.requires_doneness, nullif(v.price_cents, '')::integer, v.sort_order
from (values
  ${products.join(',\n  ')}
) as v (category_slug, group_label, name, description, is_informational, requires_doneness, price_cents, sort_order)
join public.categories c on c.slug = v.category_slug
on conflict (category_id, group_label, name) do update
  set description = excluded.description, is_informational = excluded.is_informational,
      requires_doneness = excluded.requires_doneness, price_cents = excluded.price_cents, sort_order = excluded.sort_order;

insert into public.product_variants (product_id, label, price_cents, sort_order)
select p.id, v.label, nullif(v.price_cents, '')::integer, v.sort_order
from (values
  ${variants.join(',\n  ')}
) as v (category_slug, group_label, product_name, label, price_cents, sort_order)
join public.categories c on c.slug = v.category_slug
join public.products p on p.category_id = c.id and p.group_label = v.group_label and p.name = v.product_name
on conflict (product_id, label) do update set price_cents = excluded.price_cents, sort_order = excluded.sort_order;

insert into public.extras (type, name, price_cents, sort_order)
select v.type::public.extra_type, v.name, nullif(v.price_cents, '')::integer, v.sort_order
from (values
  ${extras.join(',\n  ')}
) as v (type, name, price_cents, sort_order)
on conflict (type, name) do update set price_cents = excluded.price_cents, sort_order = excluded.sort_order;

insert into public.store_settings (id, name, whatsapp, email, instagram_url, address_street, address_district, address_zip, founded_year, menu_notice)
values (true, ${q(info.nome)}, ${q(info.wa)}, ${q(info.email)}, ${q(info.insta)}, ${q(info.rua)}, ${q(info.bairro)}, '06693005', 1995,
        'Cardápio de janeiro/2025. Valores sujeitos a alteração: o pedido é confirmado, e o pagamento combinado, pelo WhatsApp.')
on conflict (id) do update
  set name = excluded.name, whatsapp = excluded.whatsapp, email = excluded.email, instagram_url = excluded.instagram_url,
      address_street = excluded.address_street, address_district = excluded.address_district, address_zip = excluded.address_zip,
      founded_year = excluded.founded_year, menu_notice = excluded.menu_notice;

insert into public.business_hours (weekday, opens_at, closes_at, closes_next_day, closed)
values
  ${hours.join(',\n  ')}
on conflict (weekday) do update
  set opens_at = excluded.opens_at, closes_at = excluded.closes_at, closes_next_day = excluded.closes_next_day, closed = excluded.closed;
`;

writeFileSync(new URL('../migrations/008_seed_catalog.sql', import.meta.url), sql);
console.log(`ok: ${sections.length} seções, ${categories.length} categorias, ${products.length} produtos, ${variants.length} variantes, ${extras.length} extras`);
