import Legal, { type Secao } from '@/components/Legal';
import { info } from '@/lib/info';

export const metadata = {
  title: 'Cookies da Lanchonete em Itapevi',
  description: 'Como o site do MDogão Itapevi usa o armazenamento do navegador: aviso de cookies e pedido em andamento, sem cookies de publicidade nem rastreamento.',
};

const secoes: Secao[] = [
  {
    id: 'introducao', titulo: 'Introdução',
    blocos: [
      'Cookies são pequenos arquivos que os sites gravam no seu navegador. Há também tecnologias parecidas, como o armazenamento local (localStorage), que guarda informações no seu aparelho sem enviá-las a nenhum servidor.',
      `Esta política explica o que o site do **${info.nome}** guarda no seu navegador. Ela complementa a [Política de privacidade](/politica-de-privacidade).`,
    ],
  },
  {
    id: 'uso', titulo: 'O que o site guarda no seu navegador',
    blocos: [
      'O site não define cookies próprios. Ele usa apenas o armazenamento local, com estes dois itens:',
      { tabela: {
        cab: ['Nome', 'Para quê', 'Conteúdo', 'Duração', 'Tipo'],
        linhas: [
          ['ck', 'Lembrar que você fechou o aviso de cookies', 'Um marcador "visto"', 'Até você limpar os dados do site', 'Estritamente necessário'],
          ['dogao-pedido', 'Não perder o pedido se você recarregar a página', 'Itens, observações e, se você preencher, nome, forma de recebimento e endereço', 'Até "Limpar pedido" ou limpeza dos dados do site', 'Estritamente necessário (função pedida por você)'],
        ],
      } },
      'Essas informações ficam só no seu aparelho: nada disso é enviado a nós ou a terceiros. Os dados do pedido só saem do aparelho quando você toca em "Enviar pedido pelo WhatsApp".',
      'Por serem estritamente necessários ao funcionamento que você pediu, esses itens não dependem de consentimento prévio.',
    ],
  },
  {
    id: 'terceiros', titulo: 'Conteúdo de terceiros',
    blocos: [
      { lista: [
        '**Google Maps:** a seção "Venha nos visitar" e a página de contato incorporam um mapa do Google, carregado apenas quando você rola até ele. O Google pode definir cookies próprios, conforme a política dele.',
        '**WhatsApp e Instagram:** os links levam a sites de terceiros, com políticas próprias. Nenhum dado é enviado a eles até você clicar.',
        '**Vercel Web Analytics:** conta visitas de forma agregada (página, origem, país, dispositivo e navegador). Funciona sem cookies e sem gravar nada no seu aparelho.',
        '**ViaCEP:** ao digitar o CEP para a entrega, o CEP é consultado nesse serviço público; ele não define cookies neste site.',
      ] },
    ],
  },
  {
    id: 'sem', titulo: 'O que não usamos',
    blocos: ['Não usamos cookies de publicidade, de redes sociais nem pixels de rastreamento. A única ferramenta de estatísticas é o Vercel Web Analytics, que não usa cookies (não usamos Google Analytics).'],
  },
  {
    id: 'gerenciar', titulo: 'Como gerenciar ou apagar',
    blocos: [
      { lista: [
        'Para apagar o pedido salvo: toque em "Limpar pedido" no cardápio.',
        'Para apagar tudo: limpe os dados do site nas configurações do navegador.',
        'Para bloquear cookies de terceiros (como os do mapa): use as configurações de privacidade do navegador. O mapa pode deixar de carregar.',
      ] },
    ],
  },
  {
    id: 'alteracoes', titulo: 'Alterações desta política',
    blocos: ['Se o site passar a usar outros cookies ou ferramentas, atualizaremos esta página e a data da revisão.'],
  },
  {
    id: 'contato', titulo: 'Contato',
    blocos: [`Dúvidas sobre cookies e privacidade: [${info.email}](mailto:${info.email}).`],
  },
];

export default function Cookies() {
  return (
    <Legal
      atual="/politica-de-cookies"
      titulo="Política de cookies"
      sub="O que este site guarda no seu navegador, para quê, e como apagar. Resumo: só o aviso que você fechou e o pedido que você está montando."
      secoes={secoes}
    />
  );
}
