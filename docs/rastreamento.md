# Integração de rastreamento de pedidos em website

## Objetivo

Implementar em um website um sistema de rastreamento de pedidos semelhante ao iFood ou 99Food, exibindo ao cliente:

- Status atual do pedido.
- Mapa com a rota prevista.
- Posição do entregador em tempo real.
- Previsão de chegada (ETA).
- Eventos de entrega, como “saiu para entrega”, “a caminho”, “chegou” e “entregue”.

A solução deve ser segura, escalável e compatível com operação própria de entregas ou integração com a logística do iFood.

## Arquitetura recomendada

| Camada | Responsabilidade | Tecnologias sugeridas |
|---|---|---|
| Website do cliente | Exibir mapa, status, rota, marcador do entregador e ETA | React, Next.js, Vue ou HTML/JS; Google Maps JavaScript API, Mapbox ou Leaflet |
| Backend | Autenticação, pedidos, autorização, validação de GPS, ETA e regras de negócio | Node.js, NestJS, Python/FastAPI, Java/Spring ou Laravel |
| Banco de dados | Pedidos, clientes, endereços, entregas, status e histórico de posições | PostgreSQL |
| Cache e filas | Atualizações em tempo real, filas de processamento e controle de conexões | Redis, BullMQ, RabbitMQ ou Kafka |
| Tempo real | Enviar atualizações ao cliente sem recarregar a página | WebSocket, Socket.IO, Firebase Realtime Database ou Pusher |
| App do entregador | Login, lista de entregas, coleta de GPS e atualização de status | React Native, Flutter ou aplicativo nativo |
| Serviço de mapas | Geocodificação, rota, distância, tempo estimado e renderização | Google Maps Platform, Mapbox ou OSRM |
| Logística | Atribuição do entregador, rastreio e eventos de entrega | Frota própria, parceiro logístico ou API do iFood |

## Fluxo do pedido

1. O cliente finaliza o pedido no website.
2. O backend cria o pedido, salva itens, endereço, pagamento e status inicial.
3. O endereço é geocodificado para obter latitude e longitude.
4. O sistema atribui um entregador, por frota própria, parceiro logístico ou API de delivery.
5. O aplicativo do entregador envia a posição GPS periodicamente ao backend.
6. O backend valida a posição e publica atualizações apenas para o cliente autorizado.
7. O website recebe as atualizações por WebSocket seguro e atualiza o mapa, status e ETA.
8. Eventos de status alteram a interface do cliente em tempo real.

## Regras de rastreamento

### Atualização de posição

O aplicativo do entregador deve enviar dados como:

```json
POST /api/entregas/{entregaId}/posicao
{
  "latitude": -23.5505,
  "longitude": -46.6333,
  "precisaoMetros": 12,
  "velocidadeKmh": 31.4,
  "status": "EM_ROTA",
  "capturadoEm": "2026-11-13T21:45:00-03:00"
}
```

Requisitos:

- O entregador deve estar autenticado.
- O backend deve validar se o entregador está vinculado àquela entrega.
- A posição deve conter timestamp.
- A precisão do GPS deve ser registrada.
- Posições muito antigas, duplicadas ou inconsistentes devem ser descartadas.
- O histórico de posições deve ser armazenado de forma limitada, para auditoria e reconstrução do trajeto.
- A posição enviada ao cliente deve ser a mais recente e validada.

### Frequência de envio

Sugestão de intervalos:

- A cada 5 a 10 segundos quando o entregador estiver em movimento.
- A cada 20 a 30 segundos quando estiver parado.
- Somente quando houver mudança relevante de posição, tempo ou status.
- Com fila local no aplicativo para reenvio em caso de falha de internet.

### Cálculo de ETA

A ETA deve ser calculada no backend, não apenas no navegador.

Entradas recomendadas:

- Posição atual do entregador.
- Endereço de destino.
- Condições de trânsito.
- Distância e tempo de rota.
- Status da entrega.
- Histórico recente de deslocamento.

A resposta enviada ao website deve conter:

```json
{
  "pedidoId": "PEDIDO_123",
  "status": "EM_ROTA",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "etaMinutos": 12,
  "distanciaKm": 3.8,
  "atualizadoEm": "2026-11-13T21:45:00-03:00"
}
```

## Integração do mapa no website

O website deve carregar um mapa e assinar um canal exclusivo do pedido.

Exemplo de canal:

```text
pedido:PEDIDO_123
```

Exemplo de conexão:

```javascript
const socket = io('/rastreamento', {
  auth: {
    token: tokenDoCliente
  }
});

socket.emit('acompanhar_pedido', {
  pedidoId: 'PEDIDO_123'
});

socket.on('atualizacao', (dados) => {
  atualizarMarcadorEntregador(dados.latitude, dados.longitude);
  atualizarStatus(dados.status);
  atualizarEta(dados.etaMinutos);
});
```

Requisitos do frontend:

- O cliente só pode acessar o rastreamento do próprio pedido.
- O token de acesso deve ser validado antes de assinar o canal.
- O canal deve ser específico por pedido.
- A interface deve tratar falha de conexão e reconexão.
- Se a localização não estiver disponível, exibir “Localização temporariamente indisponível”.
- Não armazenar dados sensíveis do entregador no navegador.
- Não expor chaves de API de backend no código-fonte do site.

## Segurança obrigatória

### Autenticação e autorização

- Usar HTTPS em todas as requisições.
- Usar `wss://` em produção para WebSocket, nunca `ws://`.
- Autenticar o cliente antes de permitir acesso ao canal de rastreamento.
- Validar permissão por pedido: o cliente só pode acompanhar pedidos vinculados à sua conta.
- Revalidar sessão e encerrar conexões após logout ou expiração do token.
- Validar o cabeçalho `Origin` na conexão WebSocket.
- Aplicar rate limit por usuário, conexão, IP e mensagem.
- Limitar o tamanho dos payloads.
- Registrar tentativas de acesso não autorizado.

Referência de segurança para WebSocket: OWASP recomenda uso obrigatório de `wss://`, validação de `Origin`, autenticação, limites de conexão e encerramento de sessões expiradas.

### Proteção de chaves de API

- Criar chaves separadas para frontend e backend.
- Restringir a chave do frontend por domínio.
- Restringir cada chave apenas às APIs necessárias.
- Nunca expor chaves de backend no HTML, JavaScript ou repositório público.
- Armazenar segredos em variáveis de ambiente, AWS Secrets Manager, Google Secret Manager, Azure Key Vault ou cofre equivalente.
- Usar backend como proxy para chamadas sensíveis de geocodificação, rota e ETA.
- Monitorar consumo das APIs e configurar alertas para uso anômalo.

Para Google Maps Platform:

- Restringir a chave web por HTTP referrer ao domínio do site.
- Exemplo: `https://seusite.com.br/*`.
- Usar chaves distintas para Maps JavaScript API, Geocoding API e Routes API.
- Nunca usar a mesma chave sem restrições em frontend e backend.

### Proteção contra falsificação de GPS

- Autenticar o aplicativo do entregador.
- Vincular entregador, dispositivo e entrega.
- Validar se a posição recebida é coerente com o trajeto e com o tempo decorrido.
- Registrar precisão, velocidade e timestamp.
- Rejeitar atualizações com saltos fisicamente impossíveis.
- Usar snap to road ou roteirização para manter o marcador em vias reais.
- Não confiar apenas no GPS enviado pelo aplicativo.

## Privacidade e LGPD

A localização do entregador é dado pessoal e deve ser tratada conforme a LGPD.

Requisitos:

- Informar ao entregador que a localização será coletada durante entregas ativas.
- Obter base legal adequada para o tratamento de dados.
- Coletar apenas dados necessários para a operação.
- Não compartilhar posição exata com terceiros sem necessidade.
- Expor ao cliente apenas posição aproximada, status, rota e ETA.
- Definir política de retenção do histórico de localização.
- Permitir ao entregador acessar, corrigir e solicitar eliminação de dados quando aplicável.
- Registrar acessos e alterações relevantes para auditoria.
- Implementar plano de resposta a incidentes de segurança.

## Integração com iFood

Se os pedidos forem do iFood e a entrega for realizada pela logística iFood, o rastreamento pode ser obtido pela API do iFood.

Pontos importantes:

- O evento `ASSIGN_DRIVER` informa os dados do entregador.
- O endpoint de tracking retorna posição, previsão de entrega e tempos estimados de coleta e entrega.
- O rastreamento está disponível apenas para pedidos entregues pela logística iFood.
- O endpoint pode retornar 404 até os dados de entrega estarem disponíveis.
- Nesse caso, aguardar 30 segundos e consultar novamente.
- Respeitar o rate limit da API.
- Não implementar polling mais frequente do que o recomendado.
- Para pedidos externos, o módulo Shipping do iFood permite verificar disponibilidade, solicitar entregador, monitorar eventos e acompanhar localização e ETA.

## Eventos de status

Implementar os seguintes eventos:

```text
PEDIDO_CRIADO
PAGAMENTO_APROVADO
PEDIDO_CONFIRMADO
EM_PREPARO
PRONTO_PARA_RETIRADA
ENTREGADOR_ATRIBUIDO
SAIU_PARA_ENTREGA
EM_ROTA
CHEGANDO
CHEGOU_NO_LOCAL
ENTREGUE
CANCELADO
FALHA_NA_ENTREGA
```

Cada evento deve:

- Atualizar o status no banco de dados.
- Enviar notificação ao cliente.
- Atualizar a interface do website em tempo real.
- Registrar timestamp.
- Permitir auditoria posterior.

## Estrutura sugerida de banco de dados

### Tabela: pedidos

```sql
CREATE TABLE pedidos (
  id UUID PRIMARY KEY,
  cliente_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,
  endereco_entrega TEXT NOT NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Tabela: entregas

```sql
CREATE TABLE entregas (
  id UUID PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES pedidos(id),
  entregador_id UUID,
  status VARCHAR(50) NOT NULL,
  iniciada_em TIMESTAMPTZ,
  finalizada_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Tabela: posicoes_entrega

```sql
CREATE TABLE posicoes_entrega (
  id BIGSERIAL PRIMARY KEY,
  entrega_id UUID NOT NULL REFERENCES entregas(id),
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  precisao_metros NUMERIC,
  velocidade_kmh NUMERIC,
  status VARCHAR(50),
  capturado_em TIMESTAMPTZ NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Tabela: eventos_pedido

```sql
CREATE TABLE eventos_pedido (
  id BIGSERIAL PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES pedidos(id),
  tipo_evento VARCHAR(50) NOT NULL,
  dados JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Endpoints sugeridos

### Criar pedido

```http
POST /api/pedidos
```

### Consultar pedido

```http
GET /api/pedidos/{pedidoId}
```

### Consultar rastreamento

```http
GET /api/pedidos/{pedidoId}/rastreamento
```

### Atualizar posição do entregador

```http
POST /api/entregas/{entregaId}/posicao
```

### Atualizar status da entrega

```http
PATCH /api/entregas/{entregaId}/status
```

### Conectar ao rastreamento em tempo real

```text
wss://api.seusite.com.br/rastreamento
```

## Mensagem WebSocket

### Cliente solicita acompanhamento

```json
{
  "evento": "acompanhar_pedido",
  "pedidoId": "PEDIDO_123"
}
```

### Servidor envia atualização

```json
{
  "evento": "atualizacao_rastreamento",
  "pedidoId": "PEDIDO_123",
  "status": "EM_ROTA",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "etaMinutos": 12,
  "distanciaKm": 3.8,
  "atualizadoEm": "2026-11-13T21:45:00-03:00"
}
```

## MVP recomendado

Para uma primeira versão funcional, implementar:

- Cadastro e login do cliente.
- Cadastro e login do entregador.
- Criação de pedido.
- Geocodificação do endereço.
- Painel de status do pedido.
- Mapa com rota e marcador do entregador.
- App simples do entregador com envio de GPS.
- WebSocket autenticado para atualização em tempo real.
- Eventos básicos de status.
- Cálculo de ETA inicial.
- Logs de erro e monitoramento.

## Evoluções futuras

Após o MVP, implementar:

- Otimização de rotas.
- Múltiplas entregas por entregador.
- Notificações push.
- Prova de entrega com foto e assinatura.
- Chat entre cliente e entregador.
- Avaliação da entrega.
- Dashboard operacional.
- Alertas de atraso.
- Análise de desempenho de entregas.
- Integração com múltiplas transportadoras.
- Rastreamento offline do entregador.
- Machine learning para previsão de atrasos.

## Critérios de aceite

O sistema deve considerar concluído quando:

- O cliente consegue acompanhar apenas os próprios pedidos.
- O mapa exibe a rota e o marcador do entregador.
- O status é atualizado em tempo real.
- A posição do entregador é atualizada periodicamente.
- A ETA é recalculada no backend.
- O entregador só consegue enviar posição para entregas atribuídas a ele.
- A conexão WebSocket usa `wss://` em produção.
- As chaves de API estão restritas e protegidas.
- O sistema registra eventos e histórico de posições.
- O sistema trata falhas de GPS, internet e reconexão.
- O tratamento de dados de localização está alinhado à LGPD.
