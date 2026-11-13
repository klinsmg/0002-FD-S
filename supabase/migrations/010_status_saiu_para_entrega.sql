-- 010: novo status "Saiu para entrega" (entre Pronto e Entregue), usado no quadro da loja.
-- Só acrescenta um valor ao enum: pedidos existentes, views de relatório (filtram por <> 'cancelled') e funções não mudam.
alter type public.order_status add value if not exists 'out_for_delivery' after 'ready';
