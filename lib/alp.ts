// JSX não aceita atributos com ":" (x-on:click, x-bind:class); passamos por spread.
export const A = (o: Record<string, string>) => o;
