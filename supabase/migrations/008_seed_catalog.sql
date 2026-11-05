-- 008: dados iniciais (cardápio, extras, loja e horários) copiados do site.
-- GERADO por supabase/tools/gerar-seed-cardapio.mjs a partir de lib/menu.ts e lib/info.ts. Não edite à mão:
-- mudou o cardápio no código? Rode o gerador de novo. Idempotente (upsert). Cardápio de janeiro/2025.
-- Preços em centavos; vazio = "valor a confirmar". Preço único fica em products.price_cents; várias opções (P/G...)
-- ficam em product_variants.
-- ATENÇÃO: reaplicar este arquivo sobrescreve nome, descrição, preço e ordem. Alterações feitas pelo painel admin nesses campos se perdem.

insert into public.sections (slug, name, sort_order)
values
  ('hamburgueres', 'Hambúrgueres', 1),
  ('hot-dog', 'Hot Dog', 2),
  ('pasteis', 'Pastéis', 3),
  ('porcoes', 'Porções', 4),
  ('refeicoes', 'Refeições', 5),
  ('combos', 'Combos', 6),
  ('rodizio', 'Rodízio', 7),
  ('adicionais', 'Adicionais', 8),
  ('bebidas', 'Bebidas', 9)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.categories (section_id, slug, name, short_label, description, note, sort_order)
select s.id, v.slug, v.name, nullif(v.short_label, ''), nullif(v.description, ''), nullif(v.note, ''), v.sort_order
from (values
  ('hamburgueres', 'burguers-tradicionais', 'Burguers Tradicionais', 'Tradicionais', 'Hambúrguer artesanal sabor picanha, com os adicionais que você quiser.', '', 1),
  ('hamburgueres', 'burguers-classicos', 'Burguers Clássicos', 'Clássicos', 'Os clássicos da casa, do jeito que a gente faz desde 1995.', '', 2),
  ('hamburgueres', 'lanches-diversos', 'Lanches Diversos', 'Diversos', 'Para quem quer variar: lanches de todos os jeitos.', '', 3),
  ('hamburgueres', 'mini-lanches', 'Mini Lanches', 'Mini lanches', 'Pequenos na medida, grandes no sabor. Ótimos para dividir.', '', 4),
  ('hamburgueres', 'lanche-do-dia', 'Lanche do Dia', 'Lanche do dia', 'A sugestão especial da casa.', '', 5),
  ('hot-dog', 'hot-dog', 'Hot Dog', '', 'O dogão que deu nome à casa.', '', 6),
  ('pasteis', 'pasteis', 'Pastéis', '', 'Pastéis sequinhos, doces e salgados.', '', 7),
  ('porcoes', 'porcoes', 'Porções', '', 'Para a mesa toda beliscar.', 'P serve cerca de 3 pessoas; G, cerca de 5.', 8),
  ('refeicoes', 'refeicoes', 'Refeições', '', 'Pratos que matam a fome de verdade.', 'Valores do prato feito, do quilo e das marmitex (pequena, média e grande): consulte no WhatsApp.', 9),
  ('combos', 'combos', 'Combos', 'Combos', 'Lanche + acompanhamento pelo melhor preço.', '', 10),
  ('combos', 'combo-kids', 'Combo Kids', 'Kids', 'Feito para os pequenos.', '', 11),
  ('rodizio', 'rodizio', 'Rodízio', '', 'Mini hot dogs e mini burguers à vontade, com entrada e acompanhamentos.', 'Segunda a domingo, das 18h às 24h. Valores do rodízio e das bebidas: confirme no WhatsApp.', 12),
  ('adicionais', 'adicionais', 'Adicionais', '', 'Turbine o seu lanche.', 'Valem para burguers, lanches diversos, hot dogs e lanche do dia.', 13),
  ('bebidas', 'bebidas', 'Bebidas', '', 'Para acompanhar o seu pedido.', '', 14)
) as v (section_slug, slug, name, short_label, description, note, sort_order)
join public.sections s on s.slug = v.section_slug
on conflict (slug) do update
  set section_id = excluded.section_id, name = excluded.name, short_label = excluded.short_label,
      description = excluded.description, note = excluded.note, sort_order = excluded.sort_order;

insert into public.products (category_id, group_label, name, description, is_informational, requires_doneness, price_cents, sort_order)
select c.id, v.group_label, v.name, nullif(v.description, ''), v.is_informational, v.requires_doneness, nullif(v.price_cents, '')::integer, v.sort_order
from (values
  ('burguers-tradicionais', '', 'X-Burguer', '01 hambúrguer 90g sabor picanha, queijo, molho especial, catchup, maionese temperada e orégano', false, true, '2300', 1),
  ('burguers-tradicionais', '', 'X-Salada', '01 hambúrguer 90g sabor picanha, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano', false, true, '2800', 2),
  ('burguers-tradicionais', '', 'Ragonha', '01 hambúrguer, bacon, ovo, queijo, molho especial, catchup, maionese temperada e orégano', false, true, '3800', 3),
  ('burguers-tradicionais', '', 'X-Bacon', '01 hambúrguer, bacon, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano', false, true, '3500', 4),
  ('burguers-tradicionais', '', 'Double Burguer', '02 hambúrgueres 90g sabor picanha, queijo, molho especial, catchup, maionese temperada e orégano', false, true, '3500', 5),
  ('burguers-tradicionais', '', 'Double Cheddar', '02 hambúrgueres 90g sabor picanha, cheddar, molho especial, catchup e maionese temperada', false, true, '3500', 6),
  ('burguers-tradicionais', '', 'X-Podrão', '02 hambúrgueres, calabresa, presunto, bacon, 2 ovos, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano', false, true, '4500', 7),
  ('burguers-tradicionais', '', 'Ostentação', '03 hambúrgueres, bacon, queijo, molho especial, catchup e maionese temperada', false, true, '4999', 8),
  ('burguers-tradicionais', '', 'X-Laricão', '04 hambúrgueres 90g sabor picanha, filé de frango, molho especial, alface, tomate, queijo, presunto, bacon, calabresa, 04 ovos, cheddar, catupiry, catchup, maionese temperada e orégano', false, true, '13900', 9),
  ('burguers-classicos', '', 'Clássico Burguer', 'Pão de brioche, 01 hambúrguer de carne 100% bovina 150g, queijo mussarela derretido, maionese da casa', false, true, '3500', 1),
  ('burguers-classicos', '', 'Clássico Salada', 'Pão de brioche, 01 hambúrguer de carne 100% bovina 150g, queijo mussarela derretido, alface, tomate e cebola roxa, maionese da casa', false, true, '3500', 2),
  ('burguers-classicos', '', 'Clássico Bacon Barbecue', 'Pão de brioche, 01 hambúrguer de carne 100% bovina 150g, bacon crocante, barbecue, queijo cheddar derretido, maionese da casa', false, true, '4000', 3),
  ('burguers-classicos', '', 'Clássico Frango', 'Pão de brioche, frango empanado, queijo mussarela, catupiry, alface e tomate', false, true, '4000', 4),
  ('burguers-classicos', '', 'Clássico Insano', 'Pão de brioche, 02 hambúrgueres de carne 100% bovina 150g, queijo cheddar, bacon crocante, cebola caramelizada, maionese da casa', false, true, '5000', 5),
  ('lanches-diversos', 'Todos no pão de 20 cm', 'Desfiadão', 'Carne desfiada, queijo, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '3500', 1),
  ('lanches-diversos', 'Todos no pão de 20 cm', 'X-Frango', 'Filé de frango, queijo, catupiry, orégano, alface, tomate, catchup e maionese temperada', false, true, '3500', 2),
  ('lanches-diversos', 'Todos no pão de 20 cm', 'Americano', 'Presunto, bacon, ovo, queijo, orégano, alface, tomate, catchup e maionese temperada', false, true, '3500', 3),
  ('lanches-diversos', 'Todos no pão de 20 cm', 'X-Calabresa', 'Calabresa, queijo, orégano, alface, tomate, catchup e maionese temperada', false, true, '3500', 4),
  ('lanches-diversos', 'Todos no pão de 20 cm', 'Galinhão', 'Frango desfiado, catupiry, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '3000', 5),
  ('mini-lanches', 'A partir de R$ 7,50 cada', 'Burguer', '', false, true, '', 1),
  ('mini-lanches', 'A partir de R$ 7,50 cada', 'Burguer doce', '', false, true, '', 2),
  ('mini-lanches', 'A partir de R$ 7,50 cada', 'Hotdog', '', false, true, '', 3),
  ('mini-lanches', 'A partir de R$ 7,50 cada', 'Hotdog doce', '', false, true, '', 4),
  ('hot-dog', 'Pão de 20 cm', 'Dogão', '02 salsichas, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '2750', 1),
  ('hot-dog', 'Pão de 20 cm', 'Calabresa e Bacon', '02 salsichas, calabresa, bacon, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '3500', 2),
  ('hot-dog', 'Pão de 20 cm', 'Cheddar e Catupiry', '02 salsichas, cheddar, catupiry, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '3500', 3),
  ('hot-dog', 'Pão de 20 cm', 'Dogão Loko', '02 salsichas, carne desfiada, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '3500', 4),
  ('hot-dog', 'Pão de 20 cm', 'Dogão Especial', '02 salsichas, calabresa, bacon, queijo, orégano, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '3900', 5),
  ('hot-dog', 'Pão de 20 cm', 'Dogão no Prato', '04 salsichas, calabresa, bacon, frango desfiado, cheddar, catupiry, alface, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '6000', 6),
  ('hot-dog', 'Pão de 15 cm', 'Doguinho', '01 salsicha, purê de batata, batata palha, catchup e maionese temperada', false, true, '1500', 7),
  ('hot-dog', 'Pão de 15 cm', 'Dog', '01 salsicha, purê de batata, batata palha, vinagrete, milho, ervilha, catchup e maionese temperada', false, true, '2000', 8),
  ('pasteis', 'Salgados', 'Queijo', '', false, true, '1500', 1),
  ('pasteis', 'Salgados', 'Carne', '', false, true, '1500', 2),
  ('pasteis', 'Salgados', 'Calabresa', '', false, true, '1500', 3),
  ('pasteis', 'Salgados', 'Bauru', '', false, true, '1600', 4),
  ('pasteis', 'Salgados', 'Pizza', '', false, true, '1600', 5),
  ('pasteis', 'Salgados', 'Frango', '', false, true, '1600', 6),
  ('pasteis', 'Salgados', 'Frango com catupiry', '', false, true, '1800', 7),
  ('pasteis', 'Salgados', 'Carne com queijo', '', false, true, '1800', 8),
  ('pasteis', 'Salgados', 'Calabresa com queijo', '', false, true, '1800', 9),
  ('pasteis', 'Doces', 'Chocolate', '', true, false, '', 10),
  ('pasteis', 'Doces', 'Chocolate com queijo', '', true, false, '', 11),
  ('pasteis', 'Doces', 'Nutella', '', true, false, '', 12),
  ('pasteis', 'Doces', 'Nutella com queijo', '', true, false, '', 13),
  ('porcoes', 'Entrada', 'Tábua Mini Waffles', 'Tamanho único', false, true, '2500', 1),
  ('porcoes', 'Batatas e anéis', 'Batata frita simples', '', false, true, '', 2),
  ('porcoes', 'Batatas e anéis', 'Batata frita cheddar e bacon', '', false, true, '', 3),
  ('porcoes', 'Batatas e anéis', 'Onion ring', 'Anéis de cebola empanados e fritos', false, true, '', 4),
  ('porcoes', 'Carnes', 'Calabresa', 'Alface, tomate, pão tostado, cebola e batatas', false, true, '', 5),
  ('porcoes', 'Carnes', 'Coxão mole', 'Alface, tomate, pão tostado, cebola e batatas', false, true, '', 6),
  ('porcoes', 'Carnes', 'Contra filé', 'Alface, tomate, pão tostado, cebola e batatas', false, true, '', 7),
  ('porcoes', 'Carnes', 'Da casa', 'Coxão mole, calabresa, onion rings, bacia de cheddar, alface, tomate, pão tostado, cebolas e batata-frita', false, true, '', 8),
  ('refeicoes', 'Almoço · segunda a sábado, 11h às 16h', 'Por quilo', '', true, false, '', 1),
  ('refeicoes', 'Almoço · segunda a sábado, 11h às 16h', 'À vontade', '', true, false, '', 2),
  ('refeicoes', 'Almoço · segunda a sábado, 11h às 16h', 'Prato feito', '', true, false, '', 3),
  ('refeicoes', 'Almoço · segunda a sábado, 11h às 16h', 'Feijoada às quartas e sábados', '', true, false, '', 4),
  ('refeicoes', 'Jantar · segunda a sábado', 'Prato feito', '', true, false, '', 5),
  ('refeicoes', 'Marmitex', 'Omelete recheado', '', false, true, '', 6),
  ('refeicoes', 'Marmitex', 'Frango ao molho', '', false, true, '', 7),
  ('refeicoes', 'Marmitex', 'Filé de frango', '', false, true, '', 8),
  ('refeicoes', 'Marmitex', 'Calabresa', '', false, true, '', 9),
  ('refeicoes', 'Marmitex', 'Filé de frango à parmegiana', '', false, true, '', 10),
  ('refeicoes', 'Marmitex', 'Bisteca', '', false, true, '', 11),
  ('refeicoes', 'Marmitex', 'Calabresa acebolada', '', false, true, '', 12),
  ('refeicoes', 'Marmitex', 'Linguiça', '', false, true, '', 13),
  ('refeicoes', 'Marmitex', 'Picadinho ou costela', '', false, true, '', 14),
  ('refeicoes', 'Marmitex', 'Bife coxão mole', '', false, true, '', 15),
  ('refeicoes', 'Marmitex', 'Bife a cavalo', '', false, true, '', 16),
  ('refeicoes', 'Marmitex', 'Bife acebolado', '', false, true, '', 17),
  ('refeicoes', 'Marmitex', 'Bife contra-filé', '', false, true, '', 18),
  ('refeicoes', 'Marmitex', 'Bife à parmegiana', '', false, true, '', 19),
  ('combos', 'Monte o seu (lanche à escolha da promoção: X-Salada ou Dogão)', 'Combo Solteiro', '1 X-Salada ou 1 Dogão, 1 batata-frita individual e 1 refrigerante lata 350 ml', false, true, '3750', 1),
  ('combos', 'Monte o seu (lanche à escolha da promoção: X-Salada ou Dogão)', 'Combo Casal', '2 lanches da promoção, 2 batatas-fritas individuais e 2 refrigerantes lata 350 ml', false, true, '7500', 2),
  ('combos', 'Monte o seu (lanche à escolha da promoção: X-Salada ou Dogão)', 'Combo Trio', '3 lanches da promoção, 3 batatas-fritas individuais e 3 refrigerantes lata 350 ml', false, true, '10500', 3),
  ('combos', 'Monte o seu (lanche à escolha da promoção: X-Salada ou Dogão)', 'Combo Família', '4 lanches da promoção, 1 batata-frita grande com cheddar e bacon e 1 Coca-Cola 2 litros', false, true, '16000', 4),
  ('combo-kids', 'Combo', 'Combo Kids', '01 Hamburguinho ou Doguinho, 01 refrigerante 200 ml ou suquinho, 01 batata-frita pequena e 01 bala Fini', false, true, '2500', 1),
  ('combo-kids', 'Kids', 'Burguinho', 'Lanche pequeno: hambúrguer e queijo', false, true, '999', 2),
  ('combo-kids', 'Kids', 'Doguinho', 'Lanche pequeno: salsicha, purê de batata, batata palha, catchup e maionese temperada', false, true, '999', 3),
  ('combo-kids', 'Sobremesa', 'Bolo de pote', '', false, true, '1000', 4),
  ('combo-kids', 'Sobremesa', 'Pudim no copo', '', false, true, '1500', 5),
  ('lanche-do-dia', '', 'Domingo · X-Laricão', '04 hambúrgueres, filé de frango, molho especial, alface, tomate, queijo, presunto, bacon, calabresa, 04 ovos, cheddar, catupiry, catchup, maionese temperada e orégano', false, true, '11900', 1),
  ('lanche-do-dia', '', 'Segunda · Desfiadão', 'Pão 20 cm, carne desfiada, queijo, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '3250', 2),
  ('lanche-do-dia', '', 'Terça · Galinhão', 'Pão 20 cm, frango desfiado, catupiry, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '2750', 3),
  ('lanche-do-dia', '', 'Quarta · Dogão', 'Pão 20 cm, 02 salsichas, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '2450', 4),
  ('lanche-do-dia', '', 'Quinta · X-Bacon', '01 hambúrguer, bacon, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano', false, true, '2990', 5),
  ('lanche-do-dia', '', 'Sexta · Dogão no Prato', 'Pão 20 cm, 04 salsichas, calabresa, bacon, frango desfiado, cheddar, catupiry, alface, purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada', false, true, '4990', 6),
  ('lanche-do-dia', '', 'Sábado · Ostentação', '03 hambúrgueres, bacon, queijo, molho especial, catchup e maionese temperada', false, true, '4499', 7),
  ('rodizio', 'Incluso', '01 entrada de mini waffles', '', true, false, '', 1),
  ('rodizio', 'Incluso', '01 piscininha de cheddar', '', true, false, '', 2),
  ('rodizio', 'Incluso', 'Porção de anéis de cebola', '', true, false, '', 3),
  ('rodizio', 'Incluso', 'Porção de batata-frita', '', true, false, '', 4),
  ('rodizio', 'Mini hot dogs', 'Mini Dog', '', true, false, '', 5),
  ('rodizio', 'Mini hot dogs', 'Mini Dog Bacon', '', true, false, '', 6),
  ('rodizio', 'Mini hot dogs', 'Mini Dog Cheddar', '', true, false, '', 7),
  ('rodizio', 'Mini hot dogs', 'Mini Dog Catupiry', '', true, false, '', 8),
  ('rodizio', 'Mini burguers', 'Mini Burguer', '', true, false, '', 9),
  ('rodizio', 'Mini burguers', 'Mini Burguer Bacon', '', true, false, '', 10),
  ('rodizio', 'Mini burguers', 'Mini Burguer Cheddar', '', true, false, '', 11),
  ('rodizio', 'Mini burguers', 'Mini Burguer Salada', '', true, false, '', 12),
  ('rodizio', 'Mini burguers', 'Mini Burguer Onion', '', true, false, '', 13),
  ('rodizio', 'Mini burguers', 'Mini Burguer Caramelizado', '', true, false, '', 14),
  ('rodizio', 'Doces', 'Mini Hotdog Doce: chocolate ou chocolate com M&Ms', '', true, false, '', 15),
  ('rodizio', 'Doces', 'Mini Burguer Doce: chocolate ou chocolate com M&Ms', '', true, false, '', 16),
  ('rodizio', 'Regras', 'Desperdício', 'Caso haja, serão cobrados R$ 7,50 por lanche', true, false, '', 17),
  ('rodizio', 'Regras', 'Crianças', 'De 5 a 10 anos pagam meia e bebida à vontade por + R$ 7,50', true, false, '', 18),
  ('rodizio', 'Regras', 'Reservas', 'Tolerância de 15 minutos', true, false, '', 19),
  ('adicionais', '', 'Cheddar', '', false, false, '1000', 1),
  ('adicionais', '', 'Catupiry', '', false, false, '1000', 2),
  ('adicionais', '', 'Frango desfiado', '', false, false, '1200', 3),
  ('adicionais', '', 'Carne desfiada', '', false, false, '1500', 4),
  ('adicionais', '', 'Calabresa', '', false, false, '1000', 5),
  ('adicionais', '', 'Bacon', '', false, false, '1000', 6),
  ('adicionais', '', 'Queijo', '', false, false, '1000', 7),
  ('adicionais', '', 'Presunto', '', false, false, '900', 8),
  ('adicionais', '', 'Burguer picanha', '', false, false, '800', 9),
  ('adicionais', '', 'Burguer artesanal', '', false, false, '1200', 10),
  ('adicionais', 'Adicione ao seu pedido', 'Batata-frita P', '', false, false, '999', 11),
  ('adicionais', 'Adicione ao seu pedido', 'Piscininha de cheddar', '', false, false, '1499', 12),
  ('bebidas', 'Sem álcool', 'Água', '', false, false, '500', 1),
  ('bebidas', 'Sem álcool', 'Água com gás', '', false, false, '600', 2),
  ('bebidas', 'Sem álcool', 'H2OH', '', false, false, '900', 3),
  ('bebidas', 'Sem álcool', 'Dollynho', '', false, false, '500', 4),
  ('bebidas', 'Sem álcool', 'Suco Ponchito', '', false, false, '700', 5),
  ('bebidas', 'Sem álcool', 'Soda italiana', '', false, false, '1500', 6),
  ('bebidas', 'Sem álcool', 'Suco natural (garrafa)', '', false, false, '', 7),
  ('bebidas', 'Sem álcool', 'Suco lata Del Valle', '', false, false, '900', 8),
  ('bebidas', 'Sem álcool', 'Refrigerante lata', '', false, false, '900', 9),
  ('bebidas', 'Sem álcool', 'Coca-Cola KS', '', false, false, '', 10),
  ('bebidas', 'Sem álcool', 'Refrigerante 600 ml', '', false, false, '1350', 11),
  ('bebidas', 'Sem álcool', 'Coca-Cola 1 L', '', false, false, '1500', 12),
  ('bebidas', 'Sem álcool', 'Tiss 2 L', '', false, false, '1350', 13),
  ('bebidas', 'Sem álcool', 'Dolly 2 L', '', false, false, '1400', 14),
  ('bebidas', 'Sem álcool', 'Sukita 2 L', '', false, false, '1500', 15),
  ('bebidas', 'Sem álcool', 'Coca-Cola 2 L', '', false, false, '2500', 16),
  ('bebidas', 'Sem álcool', 'Energético', '', false, false, '1500', 17),
  ('bebidas', 'Cervejas (a partir de)', 'Cerveja lata', 'Valor a partir de: confirme a marca', false, false, '600', 18),
  ('bebidas', 'Cervejas (a partir de)', 'Cerveja long neck', 'Valor a partir de: confirme a marca', false, false, '1200', 19),
  ('bebidas', 'Cervejas (a partir de)', 'Cerveja 600 ml', 'Valor a partir de: confirme a marca', false, false, '1600', 20)
) as v (category_slug, group_label, name, description, is_informational, requires_doneness, price_cents, sort_order)
join public.categories c on c.slug = v.category_slug
on conflict (category_id, group_label, name) do update
  set description = excluded.description, is_informational = excluded.is_informational,
      requires_doneness = excluded.requires_doneness, price_cents = excluded.price_cents, sort_order = excluded.sort_order;

insert into public.product_variants (product_id, label, price_cents, sort_order)
select p.id, v.label, nullif(v.price_cents, '')::integer, v.sort_order
from (values
  ('porcoes', 'Batatas e anéis', 'Batata frita simples', 'P', '1500', 1),
  ('porcoes', 'Batatas e anéis', 'Batata frita simples', 'G', '3500', 2),
  ('porcoes', 'Batatas e anéis', 'Batata frita cheddar e bacon', 'P', '2500', 1),
  ('porcoes', 'Batatas e anéis', 'Batata frita cheddar e bacon', 'G', '6000', 2),
  ('porcoes', 'Batatas e anéis', 'Onion ring', 'P', '1500', 1),
  ('porcoes', 'Batatas e anéis', 'Onion ring', 'G', '2500', 2),
  ('porcoes', 'Carnes', 'Calabresa', 'P', '6000', 1),
  ('porcoes', 'Carnes', 'Calabresa', 'G', '9500', 2),
  ('porcoes', 'Carnes', 'Coxão mole', 'P', '7500', 1),
  ('porcoes', 'Carnes', 'Coxão mole', 'G', '12000', 2),
  ('porcoes', 'Carnes', 'Contra filé', 'P', '9000', 1),
  ('porcoes', 'Carnes', 'Contra filé', 'G', '13500', 2),
  ('porcoes', 'Carnes', 'Da casa', 'P', '15000', 1),
  ('porcoes', 'Carnes', 'Da casa', 'G', '20000', 2),
  ('bebidas', 'Sem álcool', 'Suco natural (garrafa)', '500 ml', '1250', 1),
  ('bebidas', 'Sem álcool', 'Suco natural (garrafa)', '1 L', '2500', 2),
  ('bebidas', 'Sem álcool', 'Coca-Cola KS', '290 ml', '800', 1),
  ('bebidas', 'Sem álcool', 'Coca-Cola KS', '1 L', '1200', 2)
) as v (category_slug, group_label, product_name, label, price_cents, sort_order)
join public.categories c on c.slug = v.category_slug
join public.products p on p.category_id = c.id and p.group_label = v.group_label and p.name = v.product_name
on conflict (product_id, label) do update set price_cents = excluded.price_cents, sort_order = excluded.sort_order;

insert into public.extras (type, name, price_cents, sort_order)
select v.type::public.extra_type, v.name, nullif(v.price_cents, '')::integer, v.sort_order
from (values
  ('sauce', 'Cheddar', '1000', 1),
  ('sauce', 'Catupiry', '1000', 2),
  ('sauce', 'Catchup', '', 3),
  ('sauce', 'Maionese temperada', '', 4),
  ('sauce', 'Molho especial', '', 5),
  ('sauce', 'Barbecue', '', 6),
  ('addon', 'Cheddar', '1000', 1),
  ('addon', 'Catupiry', '1000', 2),
  ('addon', 'Frango desfiado', '1200', 3),
  ('addon', 'Carne desfiada', '1500', 4),
  ('addon', 'Calabresa', '1000', 5),
  ('addon', 'Bacon', '1000', 6),
  ('addon', 'Queijo', '1000', 7),
  ('addon', 'Presunto', '900', 8),
  ('addon', 'Burguer picanha', '800', 9),
  ('addon', 'Burguer artesanal', '1200', 10),
  ('complement', 'Batata-frita P', '999', 1),
  ('complement', 'Piscininha de cheddar', '1499', 2)
) as v (type, name, price_cents, sort_order)
on conflict (type, name) do update set price_cents = excluded.price_cents, sort_order = excluded.sort_order;

insert into public.store_settings (id, name, whatsapp, email, instagram_url, address_street, address_district, address_zip, founded_year, menu_notice)
values (true, 'MDogão Itapevi', '5511976708155', 'marciodogaoitapevi@gmail.com', 'https://www.instagram.com/mdogaoitapevi/', 'R. José Michelotti, 146', 'Cidade da Saúde, Itapevi - SP, 06693-005', '06693005', 1995,
        'Cardápio de janeiro/2025. Valores sujeitos a alteração: o pedido é confirmado, e o pagamento combinado, pelo WhatsApp.')
on conflict (id) do update
  set name = excluded.name, whatsapp = excluded.whatsapp, email = excluded.email, instagram_url = excluded.instagram_url,
      address_street = excluded.address_street, address_district = excluded.address_district, address_zip = excluded.address_zip,
      founded_year = excluded.founded_year, menu_notice = excluded.menu_notice;

insert into public.business_hours (weekday, opens_at, closes_at, closes_next_day, closed)
values
  (0, '18:00', '01:00', true, false),
  (1, '11:00', '01:00', true, false),
  (2, '11:00', '01:00', true, false),
  (3, '11:00', '01:00', true, false),
  (4, '11:00', '01:00', true, false),
  (5, '11:00', '01:00', true, false),
  (6, '18:00', '01:00', true, false)
on conflict (weekday) do update
  set opens_at = excluded.opens_at, closes_at = excluded.closes_at, closes_next_day = excluded.closes_next_day, closed = excluded.closed;
