# Inventário — MDogão Itapevi

Estado da branch `melhorias-seguranca-desempenho` (Fase 6). Perfis: **Público** (visitante), **Cliente** (logado com
Google), **Loja/Admin** (mesmo perfil: papel `admin`, e-mail+senha+2FA; a loja é única), **Entregador** (Google + liberado pelo
admin) e **Sistema** (banco/servidor). Rastreamento (GPS, mapas, rotas, Google Maps) **removido na migração 022**: o pedido
anda pelos status Novo → Em preparo → Pronto → Saiu para entrega (a loja direciona a um entregador) → Entregue (o
entregador dá baixa no app dele) / Cancelado.

## 1. Funções por perfil

### Público / visitante
| Função | Onde | O que faz |
|---|---|---|
| Ver cardápio, buscar e filtrar | `/cardapio` (Alpine, `lib/carrinho.ts`) | Cardápio com busca instantânea (debounce), filtro por categoria e carrinho no navegador |
| Montar carrinho | `/cardapio` | Itens, variantes, ponto da carne, molhos, observações; salvo no `localStorage` |
| Consultar CEP | `/cardapio` (ViaCEP) | Preenche o endereço de entrega a partir do CEP |
| Contato pelo WhatsApp | `/contato` | Abre o WhatsApp com a mensagem pronta (sem servidor) |
| Ver horários, endereço e mapa | `/`, `/contato`, rodapé | Horários lidos do banco (`lib/horarios.ts`), mapa da Embed API |
| Entrar com Google | `entrarComGoogle` | Login OAuth no servidor (PKCE, cookies httpOnly), "manter conectado" opcional |
| Ler políticas | `/politica-de-privacidade`, `/termos-de-uso`, `/politica-de-cookies` | Textos legais |

### Cliente (logado)
| Função | Onde | O que faz |
|---|---|---|
| Fazer pedido | `createOrder` | Valida o carrinho, limite de tentativas, grava pelo `create_order` (preços do banco); máx. 5/dia |
| Acompanhar pedido ao vivo | `/pedido/[id]` + `AoVivo` | Status em tempo real (WebSocket privado) e linha do tempo |
| Ver meus pedidos | `/conta`, `/conta/pedidos` | Lista paginada (15/página) com status |
| Editar perfil | `salvarPerfil` | Nome e telefone |
| Gerenciar endereços (até 5) | `createAddress`, `updateAddress`, `deleteAddress`, `setDefaultAddress` | CRUD com endereço padrão |
| Avaliar a loja | `abrirConvite`, `recusarConvite`, `enviarAvaliacao`, `registrarGoogle` | Convite após 3 pedidos entregues; nota + comentário; convite para publicar no Google |
| Sair | `sair` | Encerra a sessão |
| Token do tempo real | `tokenTempoReal` | Entrega o access token (1 h) só para abrir o canal privado do Realtime |

### Loja / Admin (e-mail + senha + 2FA)
| Função | Onde | O que faz |
|---|---|---|
| Entrar / 2FA | `entrar`, `verificarCodigo` | Senha (limite de tentativas) e código TOTP (limite de tentativas) |
| Ativar 2FA | `gerarTotp`, `confirmarTotp` | Cadastra o autenticador (QR) |
| Recuperar senha | `enviarLinkSenha`, `abrirLinkSenha`, `salvarSenha` | Link por e-mail (com limite), sessão de recuperação, nova senha (≥ 12) |
| Quadro da loja ao vivo | `/admin/loja`, `moverPedido`, `AlertaPedidos` | Colunas Novo → Em preparo → Pronto → Saiu → Encerrados; alerta sonoro de pedido novo |
| Saiu para entrega | `despacharPedido` (`dispatch_order`) | Escolhe o entregador no cartão do pedido Pronto |
| Entregadores | `salvarEntregador` (`admin_set_courier`) | Libera/desativa pelo e-mail da conta Google, em Configurações |
| Detalhe do pedido | `/admin/pedidos/[id]`, `atualizarPedido` | Status (só próximos válidos), forma de pagamento, observações |
| Taxa de entrega e desconto | `definirValores` | Recalcula o total no banco (só pedido aberto) |
| Imprimir pedido | `/admin/imprimir/[id]` | Via térmica com impressão automática |
| Lista de pedidos | `/admin/pedidos` | Paginada |
| Painel (KPIs) | `/admin` | Faturamento, pedidos, ticket, gráfico de 7 dias, top 3, situação |
| Produtos | `salvarProduto`, `alternarProduto`, `excluirProduto` | CRUD com busca instantânea e formulário recolhido |
| Categorias | `salvarCategoria`, `alternarCategoria`, `excluirCategoria` | CRUD (só exclui vazia), busca instantânea |
| Relatórios e CSV | `/admin/relatorios`, `/admin/relatorios/export` | Diário, mensal, mais vendidos, avaliações; CSV protegido contra injeção de fórmula |
| Horário de funcionamento | `salvarHorarios` | Edita os 7 dias; o site é regerado na hora |
| Auditoria | `/admin/auditoria` | Linha do tempo dos pedidos e tentativas barradas |
| Sair | `POST /admin/logout` | Encerra a sessão (só POST) |

### Entregador (Google + liberado pelo admin)
| Função | Onde | O que faz |
|---|---|---|
| Ver entregas e resumo | `/entregador` | Entregas com ele agora, entregas de hoje/7 dias e soma das taxas (atualiza a cada 20 s) |
| Dar baixa | `/entregador/[id]` (`BaixaEntrega`), `confirmarEntrega` | Confirma "Entregue"; o banco confere que a entrega é dele e está em andamento |
| Recusar / não entregue | `devolverEntrega(motivo)` | Recusar, cliente ausente, endereço não encontrado ou outro → o pedido volta para "Pronto" |
| Rota e ligação | links do Google Maps (pelo endereço) e `tel:` | Abre o app de mapas do celular; o site não coleta localização |

### Sistema / backend (banco Postgres/Supabase)
| Função | Tipo | O que faz |
|---|---|---|
| `create_order` | RPC (cliente) | Cria pedido + itens + extras numa transação, preços do catálogo |
| `create_contact` | RPC (cliente) | Mensagem de contato (com limite) |
| `admin_set_order_amounts` | RPC (admin) | Taxa e desconto, recalcula total |
| `review_invite`, `review_decline`, `review_submit`, `review_google_click` | RPC (cliente) | Convite e avaliação |
| `anonymize_customer_data` | RPC (sistema) | LGPD: anonimiza dados ao excluir a conta |
| `dispatch_order`, `courier_confirm_delivery`, `courier_return_delivery`, `admin_set_courier`, `admin_list_couriers`, `is_courier` | RPC | Despacho (admin), baixa e devolução (entregador), gestão de entregadores |
| `is_admin` (exige 2FA/aal2), `order_status_ok`, `clean_text` | Auxiliares | Usadas nas políticas e regras |
| `orders_prepare`, `order_items_prepare`, `order_items_recalc`, `order_item_extras_prepare`, `order_item_extras_recalc` | Gatilhos | Limpeza de texto, preços e totais |
| `orders_status_flow` | Gatilho | Fluxo de status válido pela API |
| `orders_daily_limit` | Gatilho | 5 pedidos/dia por cliente (com trava de concorrência) |
| `orders_log_event`, `orders_cancel_delivery` | Gatilhos | Linha do tempo dos status; cancelar encerra a entrega |
| `orders_broadcast` | Gatilho | Publicam no Realtime (`loja`, `pedido:<id>`) |
| `handle_new_user`, `profiles_clean`, `addresses_limit`, `addresses_single_default`, `set_updated_at` | Gatilhos | Perfil automático, limpeza, até 5 endereços, um padrão, datas |

## 2. Páginas e rotas
| URL | Perfil com acesso | Finalidade |
|---|---|---|
| `/` | Público | Página principal (hero, rodízio, visita, horários) |
| `/cardapio` | Público (pedido exige login) | Cardápio e carrinho |
| `/contato` | Público | Contato pelo WhatsApp, endereço, horários, mapa |
| `/login` | Público | Entrar com Google |
| `/politica-de-privacidade`, `/termos-de-uso`, `/politica-de-cookies` | Público | Textos legais |
| `/llms.txt`, `/llms-full.txt`, `/ai.txt`, `/alt.txt`, `/robots.txt`, `/sitemap.xml` | Público | Arquivos para buscadores/IA |
| `/pedido/[id]` | Cliente dono | Acompanhamento ao vivo do pedido |
| `/conta` | Cliente | Resumo e pedidos recentes |
| `/conta/pedidos` | Cliente | Todos os pedidos (paginado) |
| `/conta/configuracoes` | Cliente | Perfil e endereços |
| `/conta/enderecos` | Cliente | Endereços (atalho) |
| `/conta/seguranca` | Cliente | Sessão e conta |
| `/admin/login`, `/admin/login/2fa` | Admin (antes do 2FA) | Senha e código |
| `/admin/seguranca` | Admin (aal1) | Ativar 2FA |
| `/admin/senha` | Público com link de recuperação | Trocar a senha do admin |
| `/admin/loja` | Admin (aal2) | Quadro da loja ao vivo |
| `/admin/pedidos`, `/admin/pedidos/[id]` | Admin (aal2) | Lista e detalhe |
| `/admin` | Admin (aal2) | Painel de KPIs |
| `/admin/produtos`, `/admin/categorias` | Admin (aal2) | Catálogo |
| `/admin/relatorios` | Admin (aal2) | Relatórios |
| `/admin/auditoria` | Admin (aal2) | Auditoria |
| `/admin/configuracoes` | Admin (aal2) | Conta, 2FA, horários, entregadores |
| `/entregador`, `/entregador/[id]` | Entregador (login se não logado) | Entregas e baixa |
| `/admin/imprimir/[id]` | Admin (aal2) | Impressão térmica |
| qualquer outra | Público | 404 |

## 3. Endpoints de API
| Método | Rota | Autenticação | Finalidade |
|---|---|---|---|
| GET | `/api/sessao` | Nenhuma (responde "não logado") | Cabeçalho pergunta se há sessão (só o primeiro nome) |
| GET | `/api/enderecos` | Sessão do cliente (vazio sem sessão) | Nome e endereços salvos para o carrinho |
| GET | `/admin/relatorios/export?tipo=diario\|mensal\|produtos` | Admin com aal2 + senha | CSV dos relatórios |
| POST | `/admin/logout` | Sessão | Sair do painel |
| GET | `/auth/callback?code=` | Código OAuth/PKCE | Troca o código pela sessão; destino de lista fixa |
| GET | `/llms.txt`, `/llms-full.txt`, `/ai.txt`, `/alt.txt` | Nenhuma | Texto estático |
| POST | Server Actions (seção 1) | Conforme o perfil (verificado na ação e no banco) | Formulários e ações do site (mesma origem) |
| WSS | `wss://<projeto>.supabase.co/realtime/v1` canais `pedido:<id>` e `loja` | JWT do usuário; RLS em `realtime.messages` | Tempo real (só leitura; ninguém publica pelo navegador) |
| HTTPS | `https://<projeto>.supabase.co/rest/v1/*` | Chave publicável + JWT; RLS em todas as tabelas | API do banco usada pelo servidor (e acessível com o token do próprio usuário) |
