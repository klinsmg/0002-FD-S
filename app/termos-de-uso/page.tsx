import Legal, { type Secao } from '@/components/Legal';
import { info } from '@/lib/info';

export const metadata = {
  title: 'Termos de Uso da Lanchonete em Itapevi',
  description: 'Termos de uso do site do MDogão Itapevi: como funciona o pedido pelo cardápio, preços, confirmação e pagamento combinados pelo WhatsApp.',
};

const secoes: Secao[] = [
  {
    id: 'aceitacao', titulo: 'Aceitação dos termos',
    blocos: [
      `Estes termos regem o uso do site do **${info.nome}** (${info.rua}, ${info.bairro}). Ao navegar ou montar um pedido, você concorda com eles e com a [Política de privacidade](/politica-de-privacidade) e a [Política de cookies](/politica-de-cookies). Se não concordar, pedimos que não use o site.`,
    ],
  },
  {
    id: 'site', titulo: 'O que é este site',
    blocos: [
      'O site apresenta o restaurante, o cardápio, o rodízio e os canais de contato. Ele não tem cadastro, login nem pagamento online, e não cobra nada de você.',
    ],
  },
  {
    id: 'pedidos', titulo: 'Pedidos pelo cardápio',
    blocos: [
      { h3: '3.1. Como funciona' },
      'O carrinho serve para você escolher os itens, personalizá-los (ponto da carne, molhos a mais e observações) e ter uma noção dos valores. O pedido só é feito quando você toca em "Enviar pedido pelo WhatsApp" e envia a mensagem para a loja.',
      { h3: '3.2. Preços e valores' },
      'Os totais exibidos são estimativas. Itens sem preço aparecem como "valor a confirmar", e extras sem preço (como alguns molhos) também são confirmados pela loja. A taxa de entrega, quando houver, é informada no atendimento.',
      { h3: '3.3. Confirmação' },
      'O pedido só vale depois que a loja o confirmar pelo WhatsApp. Itens podem estar indisponíveis, e a loja pode propor substituições ou ajustes, que você aceita ou não.',
      { h3: '3.4. Pagamento' },
      'O pagamento é combinado diretamente com a loja pelo WhatsApp. Este site não processa pagamentos.',
      { h3: '3.5. Retirada, entrega e alterações' },
      'Retirada na loja ou entrega no endereço informado. Cancelamentos e alterações devem ser combinados pelo WhatsApp o quanto antes, pois os itens são preparados na hora.',
    ],
  },
  {
    id: 'cardapio', titulo: 'Cardápio, preços e disponibilidade',
    blocos: [
      'Preços, itens, descrições, fotos e horários podem mudar sem aviso e podem estar desatualizados. O cardápio publicado é o de janeiro de 2025. Em caso de diferença, vale o que a loja confirmar no atendimento. As fotos são ilustrativas.',
    ],
  },
  {
    id: 'uso', titulo: 'Uso permitido',
    blocos: [
      'Você se compromete a informar dados verdadeiros (nome, endereço, contato) e a usar o site apenas para fazer pedidos e falar com a loja. Não é permitido:',
      { lista: [
        'tentar acessar áreas ou dados que não são públicos, ou testar vulnerabilidades sem autorização (para relatar uma falha, veja o [security.txt](/.well-known/security.txt));',
        'sobrecarregar o site com acessos automatizados abusivos;',
        'enviar pedidos falsos, ofensivos ou com o objetivo de prejudicar a loja ou terceiros;',
        `copiar o site para se passar pelo ${info.nome}.`,
      ] },
    ],
  },
  {
    id: 'propriedade', titulo: 'Propriedade intelectual',
    blocos: [
      `Marca, logotipo, textos, imagens e vídeos do site pertencem ao ${info.nome} ou são usados com autorização. Não é permitido copiá-los, reproduzi-los ou usá-los comercialmente sem permissão por escrito.`,
    ],
  },
  {
    id: 'terceiros', titulo: 'Links e serviços de terceiros',
    blocos: [
      'O site usa ou aponta para serviços de terceiros (WhatsApp, Instagram, Google Maps, ViaCEP). Eles têm termos e políticas próprios, e não nos responsabilizamos pelo funcionamento deles.',
    ],
  },
  {
    id: 'responsabilidade', titulo: 'Disponibilidade e limitação de responsabilidade',
    blocos: [
      'Procuramos manter o site correto e no ar, mas não garantimos que ele esteja livre de erros, falhas ou interrupções. Não nos responsabilizamos por danos decorrentes de indisponibilidade do site ou de serviços de terceiros, de informações incorretas fornecidas por você ou de caso fortuito ou força maior. Nada nestes termos limita direitos que a lei garante ao consumidor.',
    ],
  },
  {
    id: 'alteracoes', titulo: 'Alterações dos termos',
    blocos: ['Podemos atualizar estes termos a qualquer momento. A versão vigente é a publicada nesta página, com a data da última revisão no topo.'],
  },
  {
    id: 'lei', titulo: 'Lei aplicável e foro',
    blocos: [
      'Estes termos são regidos pelas leis do Brasil, em especial o Código de Defesa do Consumidor (Lei nº 8.078/1990) e o Marco Civil da Internet (Lei nº 12.965/2014). Fica eleito o foro do domicílio do consumidor para resolver qualquer questão, conforme a lei.',
    ],
  },
  {
    id: 'contato', titulo: 'Contato',
    blocos: [`Dúvidas sobre estes termos: [${info.email}](mailto:${info.email}).`],
  },
];

export default function Termos() {
  return (
    <Legal
      atual="/termos-de-uso"
      titulo="Termos de uso"
      sub="Regras simples para usar o site e fazer pedidos: como o pedido funciona, o que são valores estimados e como combinamos o pagamento."
      secoes={secoes}
    />
  );
}
