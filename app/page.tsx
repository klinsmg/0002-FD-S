import Image from 'next/image';
import Link from 'next/link';
import Mapa from '@/components/Mapa';
import { info, wa, mapa } from '@/lib/info';
import { ALT } from '@/lib/alt';
import { A } from '@/lib/alp';

const foto = (n: number, alt: string, sizes: string, priority = false) => (
  <Image src={`/img/p${String(n).padStart(2, '0')}.webp`} alt={alt} width={1000} height={1250} sizes={sizes} priority={priority} />
);

const destaques: [string, string, number, string][] = [
  ['Hambúrgueres', 'hamburgueres', 18, ALT.p18],
  ['Hot Dog', 'hot-dog', 21, ALT.p21],
  ['Mini Lanches', 'mini-lanches', 14, ALT.p14],
  ['Pastéis', 'pasteis', 16, ALT.p16],
  ['Porções', 'porcoes', 31, ALT.p31],
  ['Refeições', 'refeicoes', 12, ALT.p12],
  ['Bebidas', 'bebidas', 9, ALT.p09],
];
const galeria: [number, string][] = [
  [10, ALT.p10],
  [19, ALT.p19],
  [23, ALT.p23],
  [15, ALT.p15],
  [7, ALT.p07],
  [29, ALT.p29],
];
const pedir = wa('Olá! Quero fazer um pedido.');

export const metadata = {
  description: 'MDogão Itapevi: hambúrgueres artesanais, hot dog, pastéis, porções e rodízio em Itapevi-SP. Desde 1995. Veja o cardápio e peça pelo WhatsApp.',
};

export default function Home() {
  return (
    <main>
      {/* HERO */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-txt">
            {/* Alpine: "aberto agora" no fuso de São Paulo (seg–sex 11h–01h, sáb–dom 18h–01h) */}
            <p
              className="status" role="status"
              x-data="{open:null,init(){const d=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));const w=d.getDay(),h=d.getHours();this.open=h<1||h>=(w>0&&w<6?11:18)}}"
            >
              <i className="dot" {...A({ 'x-bind:class': "open===null?'':open?'on':'off'" })} />
              <span x-text="open===null?'Seg–Sex 11h–01h · Sáb–Dom 18h–01h':open?'Aberto agora · fechamos à 01h':'Fechado agora · confira os horários'">
                Seg–Sex 11h–01h · Sáb–Dom 18h–01h
              </span>
            </p>
            <h1>
              Lanches artesanais e pratos que <em>matam a fome</em> de verdade
            </h1>
            <p className="lead">Desde 1995 trabalhando com dedicação, para cada mordida uma experiência única.</p>
            <div className="flex flex-wrap gap-3 mt-[26px]">
              <a className="btn btn-p" href={pedir} target="_blank" rel="noopener noreferrer">Pedir no WhatsApp</a>
              <Link className="btn btn-o" href="/cardapio">Ver cardápio</Link>
            </div>
            <ul className="mini-info">
              <li><b>Desde</b> 1995</li>
              <li><b>Itapevi</b> · SP</li>
              <li><b>Rodízio</b> todos os dias</li>
            </ul>
          </div>
          <div className="hero-car">
            <Image src="/img/hero-inicio.webp" alt={ALT.heroInicio} width={1080} height={1350} sizes="(min-width:900px) 62vw, 100vw" quality={92} priority />
          </div>
        </div>
      </section>

      {/* CATEGORIAS */}
      <section className="sec wrap">
        <header className="sec-cab" data-reveal>
          <p className="script">o que tem pra hoje</p>
          <h2>Escolha o seu <em>favorito</em></h2>
        </header>
        <div className="cards">
          {destaques.map(([nome, id, n, alt]) => (
            <Link key={id} href={`/cardapio#${id}`} className="card" data-reveal>
              {foto(n, alt, '(min-width:900px) 25vw, 45vw')}
              <h3 className="card-nome">{nome}<i aria-hidden="true">→</i></h3>
            </Link>
          ))}
        </div>
      </section>

      {/* RODÍZIO */}
      <section className="rodizio" id="rodizio">
        <div className="wrap rod-grid">
          <div className="rod-fotos" data-reveal>
            <div className="f1">{foto(20, ALT.p20, '(min-width:900px) 380px, 70vw')}</div>
            <div className="f2">{foto(13, ALT.p13, '(min-width:900px) 240px, 45vw')}</div>
          </div>
          <div className="rod-txt" data-reveal>
            <p className="script">a casa inteira na sua mesa</p>
            <h2>Rodízio de <em>mini lanches</em></h2>
            <p>
              Mini hot dogs e mini burguers, salgados e doces, à vontade. Para começar, entrada de mini waffles e a
              piscininha de cheddar; de acompanhamento, anéis de cebola e batata-frita.
            </p>
            <ul className="check">
              <li>Segunda a domingo, das 18h às 24h</li>
              <li>Crianças de 5 a 10 anos pagam meia</li>
              <li>Reservas com tolerância de 15 minutos</li>
            </ul>
            <div className="flex flex-wrap gap-3 mt-[26px]">
              <a className="btn btn-p" href={wa('Olá! Quero reservar o rodízio.')} target="_blank" rel="noopener noreferrer">Reservar pelo WhatsApp</a>
              <Link className="btn btn-o" href="/cardapio#rodizio">Ver o rodízio completo</Link>
            </div>
            <p className="nota">Valores e condições sujeitos a alteração: confirme no WhatsApp.</p>
          </div>
        </div>
      </section>

      {/* SOBRE */}
      <section className="sec wrap">
        <div className="sobre-grid">
          <div className="sobre-txt" data-reveal>
            <p className="script">nossa história</p>
            <h2>Mais de <em>30 anos</em> de sabor em Itapevi</h2>
            <p>
              Desde 1995 o Dogão trabalha com dedicação para servir lanches artesanais e pratos que matam a fome de
              verdade. Cada hambúrguer, cada hot dog e cada porção sai da chapa com o mesmo cuidado, para que toda
              mordida seja uma experiência única.
            </p>
            <p>Venha com a família, com os amigos ou com quem você quiser dividir uma tábua farta.</p>
          </div>
          <div className="gal" data-reveal>
            {galeria.map(([n, alt]) => <figure key={n}>{foto(n, alt, '(min-width:900px) 18vw, 45vw')}</figure>)}
          </div>
        </div>
      </section>

      {/* VÍDEOS */}
      <section className="sec wrap sec-vid">
        <header className="sec-cab" data-reveal>
          <p className="script">direto da cozinha</p>
          <h2>Dá <em>água na boca</em></h2>
        </header>
        <div className="vids-wrap" x-data="{i:0,tocou:false}">
          <div
            className="vids" role="group" aria-label="Vídeos do MDogão Itapevi: deslize para o lado para ver cada um"
            {...A({ 'x-on:scroll.passive': "tocou=true; i=Math.round($el.scrollLeft/($el.children[1].offsetLeft-$el.children[0].offsetLeft))" })}
          >
            {([['v05', ALT.v05], ['v10', ALT.v10], ['v13', ALT.v13]] as const).map(([v, desc]) => (
              <video key={v} data-reveal controls playsInline preload="metadata" aria-label={`Vídeo: ${desc}`} src={`/video/${v}.mp4#t=0.6`} />
            ))}
          </div>
          <p className="vids-dica" aria-hidden="true" x-show="!tocou"><span>Deslize para o lado</span><i>→</i></p>
          <div className="vids-pontos">
            {[0, 1, 2].map(k => (
              <button
                key={k} type="button" aria-label={`Ir para o vídeo ${k + 1}`}
                {...A({ 'x-on:click': `$el.parentElement.previousElementSibling.previousElementSibling.children[${k}].scrollIntoView({behavior:'smooth',inline:'start',block:'nearest'})`, 'x-bind:class': `i===${k}?'on':''`, 'x-bind:aria-current': `i===${k}` })}
              />
            ))}
          </div>
        </div>
      </section>

      {/* VISITE */}
      <section className="sec wrap" id="visite">
        <div className="visite-grid">
          <div className="visite-txt" data-reveal>
            <p className="script">venha nos visitar</p>
            <h2>Estamos <em>te esperando</em></h2>
            <address>
              <a href={mapa} target="_blank" rel="noopener noreferrer">{info.rua}<br />{info.bairro}</a>
            </address>
            <dl className="hor">
              {info.horarios.map(([d, h]) => <div key={d}><dt>{d}</dt><dd>{h}</dd></div>)}
            </dl>
            <div className="flex flex-wrap gap-3 mt-[26px]">
              <a className="btn btn-p" href={pedir} target="_blank" rel="noopener noreferrer">Fazer meu pedido</a>
              <a className="btn btn-o" href={mapa} target="_blank" rel="noopener noreferrer">Como chegar</a>
            </div>
          </div>
          <div data-reveal><Mapa /></div>
        </div>
      </section>
    </main>
  );
}
