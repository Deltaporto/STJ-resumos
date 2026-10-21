// Teste rápido do proxy com o Gemini de verdade, sem servidor e sem navegador.
// Lê a chave e o primeiro código de acesso de worker/.dev.vars e NUNCA os imprime.
//
//   node scripts/teste-real.mjs                      -> pergunta sobre a sessão mais recente
//   node scripts/teste-real.mjs --todas              -> pergunta sobre todas as sessões (passa pelo roteador)
//   node scripts/teste-real.mjs --pergunta "texto"
//   node scripts/teste-real.mjs --seguimento "outra pergunta"   -> segunda pergunta na mesma conversa
//   node scripts/teste-real.mjs --raciocinio low     -> testa outro nível de raciocínio (low, medium, high)

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raizWorker = resolve(fileURLToPath(new URL('..', import.meta.url)));
const raizWeb = resolve(raizWorker, '..', 'web');
const args = process.argv.slice(2);
const todas = args.includes('--todas');
const valorDe = (opcao) => {
    const i = args.indexOf(opcao);
    return i >= 0 ? args[i + 1] : undefined;
};
const pergunta = valorDe('--pergunta') || 'Em uma frase, qual foi o processo mais relevante desta sessão? Cite a minutagem.';
const seguimento = valorDe('--seguimento');

const caminhoVars = join(raizWorker, '.dev.vars');
if (!existsSync(caminhoVars)) {
    console.error('worker/.dev.vars não existe.');
    process.exit(1);
}
const vars = {};
for (const linha of readFileSync(caminhoVars, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim();
}
if (!vars.GEMINI_API_KEY || /cole-aqui/.test(vars.GEMINI_API_KEY)) {
    console.error('GEMINI_API_KEY ainda não foi preenchida e salva em worker/.dev.vars.');
    process.exit(1);
}

const toml = readFileSync(join(raizWorker, 'wrangler.toml'), 'utf8');
const blocoVars = toml.split('[vars]')[1]?.split(/\n\[/)[0] || '';
const varsToml = {};
for (const m of blocoVars.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/gm)) varsToml[m[1]] = m[2];

// O material vem dos arquivos locais de web/assistente/, como se viesse do portal publicado
const fetchReal = globalThis.fetch;
globalThis.fetch = async (entrada, init) => {
    const url = String(entrada?.url || entrada);
    if (url.startsWith('https://portal.local/')) {
        const caminho = join(raizWeb, decodeURIComponent(url.slice('https://portal.local/'.length)));
        return new Response(readFileSync(caminho, 'utf8'));
    }
    return fetchReal(entrada, init);
};

const codigo = (vars.CODIGOS_ACESSO || '').split(',')[0].split(':').slice(1).join(':') || 'codigo-teste-local-1';
const env = {
    ...varsToml,
    GEMINI_API_KEY: vars.GEMINI_API_KEY,
    CODIGOS_ACESSO: `teste:${codigo}`,
    SITE_BASE_URL: 'https://portal.local/',
    ...(valorDe('--raciocinio') !== undefined ? { GEMINI_NIVEL_RACIOCINIO: valorDe('--raciocinio') } : {}),
};

const { default: proxy } = await import(pathToFileURL(join(raizWorker, 'src', 'index.js')));
const indice = JSON.parse(readFileSync(join(raizWeb, 'assistente', 'indice.json'), 'utf8'));
const sessao = [...indice.sessoes].sort((a, b) => b.isoDate.localeCompare(a.isoDate))[0];
const escopo = todas ? { tipo: 'todas' } : { tipo: 'sessao', sessaoId: sessao.id };

console.log(`Modelo: ${env.GEMINI_MODELO} | Escopo: ${todas ? 'todas as sessões' : sessao.titulo}`);

const historico = [];
let falhou = false;

for (const atual of [pergunta, seguimento].filter(Boolean)) {
    console.log(`\n=== Pergunta: ${atual}\n`);
    const inicio = Date.now();
    const segundos = () => ((Date.now() - inicio) / 1000).toFixed(1);
    const resposta = await proxy.fetch(new Request('https://proxy.local/api/perguntar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${codigo}` },
        body: JSON.stringify({ pergunta: atual, escopo, historico }),
    }), env, { waitUntil() {} });

    if (!resposta.ok) {
        console.error(`Erro ${resposta.status}:`, await resposta.text());
        process.exit(1);
    }

    // Lê o fluxo aos poucos para medir quando a primeira palavra chega
    let primeiraPalavra = null;
    let textoResposta = '';
    let buffer = '';
    const decodificador = new TextDecoder();
    for await (const pedaco of resposta.body) {
        buffer += decodificador.decode(pedaco, { stream: true });
        let fim;
        while ((fim = buffer.indexOf('\n\n')) !== -1) {
            const bloco = buffer.slice(0, fim);
            buffer = buffer.slice(fim + 2);
            const evento = bloco.match(/^event: (.+)$/m)?.[1];
            const dados = JSON.parse(bloco.match(/^data: (.+)$/m)?.[1] || 'null');
            if (evento === 'estado') console.log(`[${segundos()} s] ${dados.texto}`);
            if (evento === 'fontes') {
                const integrais = dados.integrais.map((f) => f.id).join(', ') || 'nenhuma';
                console.log(`[${segundos()} s] modo: ${dados.modo}; na íntegra: ${integrais}; no índice: ${dados.indice.length}\n`);
            }
            if (evento === 'texto') {
                if (primeiraPalavra === null) primeiraPalavra = segundos();
                textoResposta += dados.t;
                process.stdout.write(dados.t);
            }
            if (evento === 'fim') {
                console.log(`\n\n[tokens: ${JSON.stringify(dados.uso)}${dados.aviso ? ` | aviso: ${dados.aviso}` : ''}]`);
            }
            if (evento === 'erro') {
                falhou = true;
                console.error(`\nERRO: ${dados.mensagem}`);
            }
        }
    }
    console.log(`[primeira palavra: ${primeiraPalavra ?? '-'} s | total: ${segundos()} s]`);
    historico.push({ papel: 'usuario', texto: atual }, { papel: 'assistente', texto: textoResposta });
}

process.exit(falhou ? 1 : 0);
