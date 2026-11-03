import Legal, { type Secao } from '@/components/Legal';
import { info } from '@/lib/info';

export const metadata = {
  title: 'Privacidade da Lanchonete em Itapevi',
  description: 'Política de privacidade do MDogão Itapevi: dados tratados no pedido pelo WhatsApp e no contato, e como exercer seus direitos (LGPD).',
};

const email = `[${info.email}](mailto:${info.email})`;

const secoes: Secao[] = [
  {
    id: 'introducao', titulo: 'Introdução',
    blocos: [
      `Esta política explica como o **${info.nome}** ("nós"), estabelecido em ${info.rua}, ${info.bairro}, trata os dados pessoais de quem visita este site e faz pedidos pelo cardápio. Ela segue a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).`,
      'Este site é informativo: não tem cadastro, login, pagamento online nem banco de dados. O pedido que você monta no cardápio só é enviado quando você toca em "Enviar pedido pelo WhatsApp".',
      'Ao usar o site, você declara que leu esta política. Se não concordar com algum ponto, não envie dados pelo site.',
    ],
  },
  {
    id: 'principios', titulo: 'Princípios gerais e confidencialidade',
    blocos: [
      'Tratamos seus dados com finalidade específica, só o necessário para atender você, de forma transparente e com medidas de segurança. Não vendemos dados pessoais.',
      'Só têm acesso aos dados as pessoas da loja que atendem pedidos e contatos, e os prestadores de serviço descritos na seção 5.',
    ],
  },
  {
    id: 'coletamos', titulo: 'Informações que coletamos',
    blocos: [
      { h3: '3.1. Informações que você nos fornece' },
      { lista: [
        '**Pedido:** itens, quantidades, ponto da carne, molhos e adicionais, observações, nome, forma de recebimento (retirada ou entrega) e, na entrega, CEP, rua, número, complemento, bairro e cidade.',
        '**Contato:** nome e mensagem digitados no formulário de contato.',
        '**Conversa no WhatsApp:** ao enviar o pedido ou a mensagem, a loja também recebe o seu número de telefone e o que você escrever na conversa.',
      ] },
      { h3: '3.2. Informações coletadas automaticamente' },
      'Como em qualquer site, o provedor de hospedagem pode registrar dados técnicos de acesso (endereço IP, navegador, data e hora, página acessada) para segurança e funcionamento do serviço.',
      'Usamos também o **Vercel Web Analytics** e o **Vercel Speed Insights** para saber, de forma agregada, quantas pessoas visitam o site e quais páginas são mais vistas: página acessada, origem do acesso (site de onde você veio), país, tipo de dispositivo, sistema e navegador; o Speed Insights mede a velocidade de carregamento das páginas no seu aparelho. Essas ferramentas **não usam cookies** e não grava informações no seu aparelho nem cria um perfil para identificar você entre visitas. Não usamos publicidade nem rastreamento de comportamento.',
      { h3: '3.3. Armazenamento no seu navegador' },
      'O site guarda no seu navegador (localStorage) o aviso de cookies já fechado e o pedido em andamento, para que ele não se perca se você recarregar a página. Veja a [Política de cookies](/politica-de-cookies).',
    ],
  },
  {
    id: 'uso', titulo: 'Como usamos seus dados',
    blocos: [
      { tabela: {
        cab: ['Finalidade', 'Dados', 'Base legal (LGPD, art. 7º)'],
        linhas: [
          ['Receber, confirmar, preparar e entregar o seu pedido', 'Pedido, nome, endereço, telefone', 'Execução de contrato ou de procedimentos preliminares a pedido do titular (V)'],
          ['Responder dúvidas, reservas e elogios', 'Nome, mensagem, telefone', 'Execução de procedimentos preliminares (V) e legítimo interesse (IX)'],
          ['Preencher o endereço automaticamente pelo CEP', 'CEP', 'Legítimo interesse (IX), a seu pedido'],
          ['Cumprir obrigações fiscais e legais', 'Dados do pedido', 'Cumprimento de obrigação legal (II)'],
          ['Segurança e funcionamento do site', 'Dados técnicos de acesso', 'Legítimo interesse (IX)'],
          ['Entender o uso e a velocidade do site e melhorá-lo (estatísticas agregadas)', 'Página acessada, origem, país, dispositivo, navegador e tempos de carregamento, sem cookies', 'Legítimo interesse (IX)'],
        ],
      } },
      'Não enviamos publicidade, newsletters nem mensagens promocionais. Só entramos em contato para tratar do seu pedido ou da sua mensagem.',
    ],
  },
  {
    id: 'terceiros', titulo: 'Compartilhamento e serviços de terceiros',
    blocos: [
      'Usamos os serviços abaixo. Cada um trata dados conforme a sua própria política.',
      { tabela: {
        cab: ['Serviço', 'Para quê', 'Que dados recebe'],
        linhas: [
          ['WhatsApp (Meta)', 'Receber o pedido e conversar com a loja', 'O texto do pedido, nome e número de telefone, quando você envia a mensagem'],
          ['ViaCEP', 'Preencher rua, bairro e cidade a partir do CEP', 'Somente o CEP digitado (o restante do endereço não é enviado)'],
          ['Google Maps', 'Mostrar o mapa de como chegar', 'Dados técnicos de acesso e, conforme a política do Google, cookies próprios, quando o mapa é carregado'],
          ['Hospedagem do site (Vercel)', 'Publicar o site e protegê-lo contra ataques', 'Dados técnicos de acesso (IP, navegador, data e hora)'],
          ['Vercel Web Analytics e Speed Insights', 'Estatísticas agregadas de visitas e de velocidade, sem cookies', 'Página acessada, origem, país, dispositivo, navegador e tempos de carregamento'],
          ['Instagram (Meta)', 'Link para o perfil da loja', 'Nenhum, até você clicar no link'],
        ],
      } },
      'Também podemos compartilhar dados se uma lei ou ordem de autoridade competente exigir.',
    ],
  },
  {
    id: 'transferencias', titulo: 'Onde os dados são tratados',
    blocos: [
      'Alguns desses serviços (WhatsApp, Google, hospedagem) podem tratar dados em servidores fora do Brasil. Nesses casos, a transferência ocorre com base na LGPD (art. 33), por meio das garantias oferecidas por esses prestadores.',
    ],
  },
  {
    id: 'retencao', titulo: 'Retenção e exclusão',
    blocos: [
      { lista: [
        '**No seu navegador:** o pedido em andamento fica até você tocar em "Limpar pedido" ou limpar os dados do site no navegador.',
        '**Na conversa de WhatsApp da loja:** mantemos pelo tempo necessário para atender o pedido, resolver reclamações e cumprir obrigações legais e fiscais.',
        '**No provedor de hospedagem:** registros técnicos são mantidos pelo prazo definido por ele.',
      ] },
      'Você pode pedir a exclusão dos seus dados a qualquer momento (seção 10), ressalvadas as informações que a lei nos obriga a guardar.',
    ],
  },
  {
    id: 'seguranca', titulo: 'Segurança',
    blocos: [
      'O site usa conexão criptografada (HTTPS), cabeçalhos de segurança, não carrega scripts de publicidade, não tem banco de dados de clientes e trata o que você digita sempre como texto. Mesmo assim, nenhum sistema é totalmente imune a falhas. Se você suspeitar de qualquer problema, avise pelo e-mail da seção 12.',
    ],
  },
  {
    id: 'criancas', titulo: 'Crianças e adolescentes',
    blocos: [
      'O site não é direcionado a menores de 18 anos. Pedidos devem ser feitos por maiores de idade ou com a participação de um responsável. Se identificarmos dados de uma criança enviados sem a autorização de um responsável, vamos apagá-los.',
    ],
  },
  {
    id: 'direitos', titulo: 'Seus direitos',
    blocos: [
      'Pela LGPD (art. 18), você pode pedir, a qualquer momento:',
      { lista: [
        'confirmação de que tratamos seus dados e acesso a eles;',
        'correção de dados incompletos, inexatos ou desatualizados;',
        'anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei;',
        'portabilidade dos dados, conforme regulamentação da ANPD;',
        'eliminação dos dados tratados com o seu consentimento;',
        'informação sobre com quem compartilhamos os dados;',
        'informação sobre a possibilidade de não consentir e suas consequências;',
        'revogação do consentimento e oposição a tratamentos feitos sem consentimento, em caso de descumprimento da lei.',
      ] },
      `Para exercer seus direitos, escreva para ${email}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      { h3: 'Decisões automatizadas' },
      'Não tomamos decisões automatizadas nem fazemos perfis a partir dos seus dados.',
    ],
  },
  {
    id: 'cookies', titulo: 'Cookies e armazenamento local',
    blocos: ['O site não usa cookies de publicidade nem de rastreamento; as estatísticas de visita são feitas sem cookies. Detalhes, com a lista do que é guardado no navegador, na [Política de cookies](/politica-de-cookies).'],
  },
  {
    id: 'controlador', titulo: 'Controlador e contato',
    blocos: [
      `**Controlador:** ${info.nome}, ${info.rua}, ${info.bairro}.`,
      `**Contato para privacidade:** ${email}. Ainda não há um encarregado (DPO) formalmente designado; este e-mail é o canal para qualquer assunto sobre dados pessoais.`,
    ],
  },
  {
    id: 'alteracoes', titulo: 'Alterações desta política',
    blocos: [
      'Podemos atualizar esta política quando o site ou a lei mudarem. A data da última revisão fica no topo da página, e a versão publicada aqui é sempre a vigente. Veja também os [Termos de uso](/termos-de-uso).',
    ],
  },
];

export default function Privacidade() {
  return (
    <Legal
      atual="/politica-de-privacidade"
      titulo="Política de privacidade"
      sub="Leia com atenção: aqui você vê quais dados tratamos quando faz um pedido ou fala com a gente, para quê, e quais são os seus direitos."
      secoes={secoes}
    />
  );
}
