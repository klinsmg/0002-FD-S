import { altTxt, resposta } from '@/lib/llms';

export const dynamic = 'force-static';
export const GET = () => resposta(altTxt());
