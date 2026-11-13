'use client';
import { useRef, useState } from 'react';
import { MSG_CEP, buscarCep, mascaraCep, soDigitos } from '@/lib/viacep';

type Valores = { label: string; zip_code: string; street: string; number: string; complement: string; district: string; city: string; state: string; reference: string };

// Campos do endereço (dentro do <form> da Server Action). Ao completar o CEP, busca no ViaCEP e preenche rua, bairro,
// cidade e UF; o cliente pode corrigir tudo. CEP inválido ou falha da API só mostram aviso: o preenchimento manual segue livre.
export default function CamposEndereco({ v }: { v: Valores }) {
  const [msg, setMsg] = useState('');
  const refs = { street: useRef<HTMLInputElement>(null), district: useRef<HTMLInputElement>(null), city: useRef<HTMLInputElement>(null), state: useRef<HTMLInputElement>(null), number: useRef<HTMLInputElement>(null) };
  const ultimo = useRef('');

  async function aoDigitarCep(e: React.ChangeEvent<HTMLInputElement>) {
    e.target.value = mascaraCep(e.target.value);
    const d = soDigitos(e.target.value);
    if (d.length < 8) { setMsg(''); ultimo.current = ''; return; }
    if (d === ultimo.current) return;
    ultimo.current = d;
    setMsg(MSG_CEP.buscando);
    const r = await buscarCep(d);
    if (ultimo.current !== d) return; // CEP mudou enquanto buscava
    if (!r.ok) { setMsg(MSG_CEP[r.motivo]); return; }
    const por = (el: HTMLInputElement | null, val: string) => { if (el && val) el.value = val; };
    por(refs.street.current, r.end.rua); por(refs.district.current, r.end.bairro); por(refs.city.current, r.end.cidade); por(refs.state.current, r.end.uf);
    setMsg(refs.district.current?.value ? MSG_CEP.ok : MSG_CEP.okSemBairro);
    (refs.district.current?.value ? refs.number : refs.district).current?.focus();
  }

  return (
    <>
      <label htmlFor="e-label">Nome do endereço</label>
      <input id="e-label" name="label" maxLength={40} defaultValue={v.label} />
      <label htmlFor="e-cep">CEP</label>
      <input id="e-cep" name="zip_code" inputMode="numeric" autoComplete="postal-code" maxLength={9} required defaultValue={v.zip_code} placeholder="00000-000" onChange={aoDigitarCep} aria-describedby="e-cep-msg" />
      <p className="nota" id="e-cep-msg" aria-live="polite">{msg}</p>
      <label htmlFor="e-rua">Rua</label>
      <input id="e-rua" ref={refs.street} name="street" autoComplete="address-line1" maxLength={120} required defaultValue={v.street} />
      <label htmlFor="e-num">Número</label>
      <input id="e-num" ref={refs.number} name="number" maxLength={10} required defaultValue={v.number} />
      <label htmlFor="e-comp">Complemento</label>
      <input id="e-comp" name="complement" autoComplete="address-line2" maxLength={60} defaultValue={v.complement} />
      <label htmlFor="e-bairro">Bairro</label>
      <input id="e-bairro" ref={refs.district} name="district" autoComplete="address-level3" maxLength={100} required defaultValue={v.district} />
      <label htmlFor="e-cidade">Cidade</label>
      <input id="e-cidade" ref={refs.city} name="city" autoComplete="address-level2" maxLength={100} required defaultValue={v.city} />
      <label htmlFor="e-uf">UF</label>
      <input id="e-uf" ref={refs.state} name="state" autoComplete="address-level1" maxLength={2} required defaultValue={v.state} />
      <label htmlFor="e-ref">Ponto de referência</label>
      <input id="e-ref" name="reference" maxLength={150} defaultValue={v.reference} />
    </>
  );
}
