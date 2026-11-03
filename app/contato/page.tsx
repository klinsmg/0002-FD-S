import Mapa from '@/components/Mapa';
import { info, wa, mapa } from '@/lib/info';
import { A } from '@/lib/alp';

export const metadata = { title: 'Contato da Lanchonete em Itapevi', description: 'Fale com o MDogão Itapevi pelo WhatsApp, Instagram ou e-mail, ou visite a lanchonete na R. José Michelotti, 146, Itapevi-SP. Horários e mapa.' };

// Alpine: monta a mensagem e abre o WhatsApp (nada é enviado a servidor; o site é estático).
const limpa = String.raw`s=>s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g,' ').replace(/\s+/g,' ').trim()`;
const envia = `window.open('https://wa.me/${info.wa}?text='+encodeURIComponent('Olá! Meu nome é '+(${limpa})(nome).slice(0,60)+'. '+(${limpa})(msg).slice(0,500)),'_blank','noopener,noreferrer')`;

export default function Contato() {
  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">contato</p>
        <h1>Fale com a <em>gente</em></h1>
        <p>Pedidos, reservas do rodízio, dúvidas ou elogios: o jeito mais rápido é o WhatsApp.</p>
      </header>

      <div className="wrap contato-grid">
        <div>
          <form className="form" x-data="{nome:'',msg:''}" {...A({ 'x-on:submit.prevent': envia })}>
            <label htmlFor="c-nome">Seu nome</label>
            <input id="c-nome" name="nome" autoComplete="name" maxLength={60} required x-model="nome" />
            <label htmlFor="c-msg">Mensagem</label>
            <textarea id="c-msg" name="mensagem" maxLength={500} required x-model="msg" placeholder="Ex.: quero reservar o rodízio para 4 pessoas, sábado às 20h." />
            <button className="btn btn-p" type="submit">Enviar pelo WhatsApp</button>
            <p className="nota">Ao enviar, abrimos o WhatsApp com a sua mensagem pronta.</p>
          </form>

          <ul className="canais">
            <li><b>WhatsApp</b><a href={wa()} target="_blank" rel="noopener noreferrer">{info.fone}</a></li>
            <li><b>Instagram</b><a href={info.insta} target="_blank" rel="noopener noreferrer">{info.instaUser}</a></li>
            <li><b>E-mail</b><a href={`mailto:${info.email}`}>{info.email}</a></li>
            <li><b>Endereço</b><a href={mapa} target="_blank" rel="noopener noreferrer">{info.rua}, {info.bairro}</a></li>
            {info.horarios.map(([d, h]) => <li key={d}><b>{d}</b><span>{h}</span></li>)}
          </ul>
        </div>
        <Mapa />
      </div>
    </main>
  );
}
