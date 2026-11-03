import Link from 'next/link';
import { A } from '@/lib/alp';

// Aviso simples: o site não usa rastreadores; só o mapa incorporado (Google) pode definir cookies.
export default function Cookies() {
  const fecha = A({ 'x-on:click': "show=false; (()=>{try{localStorage.setItem('ck','1')}catch(e){}})()" });
  return (
    <div className="cookies" role="dialog" aria-label="Aviso de cookies" x-data="{show:true}" x-init="show=(()=>{try{return localStorage.getItem('ck')!=='1'}catch(e){return true}})()" x-show="show" x-cloak="">
      <p>Este site usa apenas cookies essenciais. O mapa incorporado (Google) pode definir cookies próprios. <Link href="/politica-de-cookies">Saiba mais</Link>.</p>
      <button className="btn btn-p" {...fecha}>Entendi</button>
    </div>
  );
}
