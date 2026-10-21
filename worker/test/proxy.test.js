import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import proxy, { exigeCodigo, validarPedido } from '../src/index.js';
import { autenticar, lerCodigos } from '../src/auth.js';
import { cortarPorOrcamento, filtrarCandidatas, limparCache } from '../src/corpus.js';
import { classificarErro, interpretarPedaco, lerEventosSSE, montarConteudo, mensagemErro } from '../src/gemini.js';

const SITE = 'https://portal.exemplo/STJ-resumos/';
const ORIGEM = 'https://portal.exemplo';

const indice = {
    versao: 1,
    sessoes: [
        { id: '2026-10-13_primeira_turma', titulo: 'Primeira Turma — 13/10/2026', orgaoSlug: 'primeira_turma', isoDate: '2026-10-13', materiaIds: [1, 8], arquivo: 'assistente/sessoes/2026-10-13_primeira_turma.txt', caracteres: 400, videoUrl: 'https://youtu.be/a', indice: '<sessao_indice id="2026-10-13_primeira_turma">A</sessao_indice>' },
        { id: '2026-10-20_primeira_turma', titulo: 'Primeira Turma — 20/10/2026', orgaoSlug: 'primeira_turma', isoDate: '2026-10-20', materiaIds: [5], arquivo: 'assistente/sessoes/2026-10-20_primeira_turma.txt', caracteres: 400, videoUrl: 'https://youtu.be/b', indice: '<sessao_indice id="2026-10-20_primeira_turma">B</sessao_indice>' },
        { id: '2026-10-14_primeira_secao', titulo: 'Primeira Seção — 14/10/2026', orgaoSlug: 'primeira_secao', isoDate: '2026-10-14', materiaIds: [8], arquivo: 'assistente/sessoes/2026-10-14_primeira_secao.txt', caracteres: 400, videoUrl: 'https://youtu.be/c', indice: '<sessao_indice id="2026-10-14_primeira_secao">C</sessao_indice>' },
    ],
};

function envBase(extra = {}) {
    return {
        SITE_BASE_URL: SITE,
        ORIGENS_PERMITIDAS: ORIGEM,
        GEMINI_API_KEY: 'chave-teste',
        CODIGOS_ACESSO: 'ana:codigo-da-ana-1,bruno:codigo-do-bruno-2',
        ...extra,
    };
}

function sse(pedacos) {
    const texto = pedacos.map((p) => `data: ${JSON.stringify(p)}\r\n\r\n`).join('');
    return new Response(texto, { headers: { 'content-type': 'text/event-stream' } });
}

let chamadas;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
    limparCache();
    chamadas = [];
    globalThis.fetch = async (entrada, init = {}) => {
        const url = String(entrada);
        chamadas.push({ url, init });
        if (url === `${SITE}assistente/indice.json`) return Response.json(indice);
        const sessao = url.match(/sessoes\/(.+)\.txt$/);
        if (sessao) return new Response(`<sessao id="${sessao[1]}">material</sessao>`);
        if (url.includes(':generateContent')) {
            return Response.json({ candidates: [{ content: { parts: [{ text: '{"sessoes":["2026-10-14_primeira_secao","inexistente"]}' }] } }] });
        }
        if (url.includes(':streamGenerateContent')) {
            return sse([
                { candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'Olá, ' }] } }] },
                { candidates: [{ content: { parts: [{ text: 'equipe [[2026-10-20_primeira_turma@00:41:20]].' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 20, cachedContentTokenCount: 600 } },
            ]);
        }
        return new Response('não encontrado', { status: 404 });
    };
});

afterEach(() => {
    globalThis.fetch = fetchOriginal;
});

function pedido(corpo, { codigo = 'codigo-da-ana-1', origem = ORIGEM } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (codigo) headers.authorization = `Bearer ${codigo}`;
    if (origem) headers.origin = origem;
    return new Request('https://proxy.exemplo/api/perguntar', { method: 'POST', headers, body: JSON.stringify(corpo) });
}

async function eventos(resposta) {
    const lista = [];
    const texto = await resposta.text();
    for (const bloco of texto.split('\n\n').filter(Boolean)) {
        const evento = bloco.match(/^event: (.+)$/m)?.[1];
        const dados = JSON.parse(bloco.match(/^data: (.+)$/m)?.[1] || 'null');
        lista.push({ evento, dados });
    }
    return lista;
}

test('lerCodigos aceita nome:codigo e descarta códigos curtos', () => {
    const codigos = lerCodigos('ana:12345678, curto:123 ,semnome-codigo-longo');
    assert.deepEqual(codigos, [
        { nome: 'ana', codigo: '12345678' },
        { nome: 'equipe', codigo: 'semnome-codigo-longo' },
    ]);
});

test('autenticar identifica o dono do código', async () => {
    const req = (c) => new Request('https://x/', { headers: { authorization: `Bearer ${c}` } });
    assert.equal(await autenticar(req('codigo-do-bruno-2'), envBase()), 'bruno');
    assert.equal(await autenticar(req('codigo-errado-999'), envBase()), null);
    assert.equal(await autenticar(new Request('https://x/'), envBase()), null);
});

test('validarPedido rejeita escopos e históricos inválidos', () => {
    assert.ok(validarPedido({ pergunta: 'x', escopo: { tipo: 'sessao', sessaoId: '../segredo' } }).erro);
    assert.ok(validarPedido({ pergunta: 'x', escopo: { tipo: 'orgao', orgao: 'segunda_turma' } }).erro);
    assert.ok(validarPedido({ pergunta: '', escopo: { tipo: 'todas' } }).erro);
    assert.ok(validarPedido({ pergunta: 'x', escopo: { tipo: 'todas' }, materiaId: 99 }).erro);
    assert.ok(validarPedido({ pergunta: 'x', escopo: { tipo: 'todas' }, historico: [{ papel: 'sistema', texto: 'a' }] }).erro);
    const ok = validarPedido({ pergunta: ' Quais teses? ', escopo: { tipo: 'todas' }, materiaId: '8' });
    assert.deepEqual(ok.pedido, { pergunta: 'Quais teses?', escopo: { tipo: 'todas' }, materiaId: 8, historico: [] });
});

test('filtrarCandidatas respeita órgão e matéria e ordena da mais recente', () => {
    assert.deepEqual(filtrarCandidatas(indice, { tipo: 'todas' }, null).map((s) => s.id), [
        '2026-10-20_primeira_turma', '2026-10-14_primeira_secao', '2026-10-13_primeira_turma',
    ]);
    assert.deepEqual(filtrarCandidatas(indice, { tipo: 'orgao', orgao: 'primeira_turma' }, 8).map((s) => s.id), ['2026-10-13_primeira_turma']);
    assert.deepEqual(filtrarCandidatas(indice, { tipo: 'sessao', sessaoId: '2026-10-14_primeira_secao' }, 1).map((s) => s.id), ['2026-10-14_primeira_secao']);
});

test('cortarPorOrcamento sempre inclui ao menos uma sessão', () => {
    const itens = [{ t: 500 }, { t: 300 }, { t: 100 }];
    assert.equal(cortarPorOrcamento(itens, (i) => i.t, 100).length, 1);
    assert.equal(cortarPorOrcamento(itens, (i) => i.t, 850).length, 2);
});

test('montarConteudo alterna papéis e termina com a pergunta do usuário', () => {
    const conteudo = montarConteudo([
        { papel: 'assistente', texto: 'ignorada (antes do usuário)' },
        { papel: 'usuario', texto: 'P1' },
        { papel: 'assistente', texto: 'R1' },
    ], 'P2');
    assert.deepEqual(conteudo.map((c) => c.role), ['user', 'model', 'user']);
    assert.equal(conteudo[2].parts[0].text, 'P2');
});

test('lerEventosSSE junta eventos partidos entre pedaços da rede', async () => {
    const partes = ['data: {"a":', '1}\r\n\r\ndata: {"a":2}\n', '\n'];
    const corpo = new ReadableStream({
        start(c) {
            for (const p of partes) c.enqueue(new TextEncoder().encode(p));
            c.close();
        },
    });
    const lidos = [];
    for await (const ev of lerEventosSSE(corpo)) lidos.push(ev.a);
    assert.deepEqual(lidos, [1, 2]);
});

test('interpretarPedaco ignora o raciocínio interno do modelo', () => {
    const r = interpretarPedaco({ candidates: [{ content: { parts: [{ text: 'x', thought: true }, { text: 'visível' }] }, finishReason: 'STOP' }] });
    assert.equal(r.texto, 'visível');
    assert.equal(r.motivoFim, 'STOP');
});

test('mensagemErro traduz falhas comuns do Gemini', () => {
    assert.match(mensagemErro(429, ''), /muitas perguntas/);
    assert.match(
        mensagemErro(429, '{"error":{"message":"Your project has exceeded its monthly spending cap. Please go to AI Studio"}}'),
        /limite de gastos do mês/,
    );
    assert.match(mensagemErro(404, ''), /problema de configuração/);
    assert.match(mensagemErro(400, '{"error":{"message":"API key not valid"}}'), /problema de configuração/);
    // Nada de jargão técnico na mensagem ao usuário
    for (const status of [400, 401, 403, 404, 429, 500]) {
        assert.doesNotMatch(mensagemErro(status, ''), /Gemini|API|proxy|GEMINI_/);
    }
});

test('sem código de acesso devolve 401', async () => {
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'todas' } }, { codigo: null }), envBase());
    assert.equal(resp.status, 401);
    assert.equal(resp.headers.get('access-control-allow-origin'), ORIGEM);
});

test('origem não autorizada devolve 403', async () => {
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'todas' } }, { origem: 'https://intruso.exemplo' }), envBase());
    assert.equal(resp.status, 403);
});

test('preflight CORS responde 204 para a origem do portal', async () => {
    const resp = await proxy.fetch(new Request('https://proxy.exemplo/api/perguntar', { method: 'OPTIONS', headers: { origin: ORIGEM } }), envBase());
    assert.equal(resp.status, 204);
    assert.match(resp.headers.get('access-control-allow-headers'), /authorization/);
});

test('verificar confirma o código e devolve o nome', async () => {
    const req = new Request('https://proxy.exemplo/api/verificar', { method: 'POST', headers: { authorization: 'Bearer codigo-do-bruno-2', origin: ORIGEM } });
    const resp = await proxy.fetch(req, envBase());
    assert.deepEqual(await resp.json(), { ok: true, nome: 'bruno' });
});

test('limite de requisições devolve 429', async () => {
    const env = envBase({ LIMITADOR: { limit: async () => ({ success: false }) } });
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'todas' } }), env);
    assert.equal(resp.status, 429);
});

test('pergunta sobre uma sessão lê só ela, na íntegra, e transmite a resposta', async () => {
    const resp = await proxy.fetch(pedido({
        pergunta: 'O que foi decidido?',
        escopo: { tipo: 'sessao', sessaoId: '2026-10-20_primeira_turma' },
        historico: [{ papel: 'usuario', texto: 'Oi' }, { papel: 'assistente', texto: 'Olá' }],
    }), envBase(), { waitUntil() {} });
    assert.equal(resp.status, 200);
    assert.match(resp.headers.get('content-type'), /event-stream/);
    const lista = await eventos(resp);

    const fontes = lista.find((e) => e.evento === 'fontes').dados;
    assert.equal(fontes.modo, 'integral');
    assert.deepEqual(fontes.integrais.map((f) => f.id), ['2026-10-20_primeira_turma']);

    const texto = lista.filter((e) => e.evento === 'texto').map((e) => e.dados.t).join('');
    assert.equal(texto, 'Olá, equipe [[2026-10-20_primeira_turma@00:41:20]].');
    assert.deepEqual(lista.at(-1), { evento: 'fim', dados: { aviso: null, uso: { entrada: 1000, emCache: 600, saida: 20 } } });

    const chamadaGemini = chamadas.find((c) => c.url.includes(':streamGenerateContent'));
    assert.equal(chamadaGemini.init.headers['x-goog-api-key'], 'chave-teste');
    assert.ok(!chamadaGemini.url.includes('chave-teste'), 'a chave não pode ir na URL');
    const corpo = JSON.parse(chamadaGemini.init.body);
    assert.match(corpo.systemInstruction.parts[0].text, /<sessao id="2026-10-20_primeira_turma">material<\/sessao>/);
    assert.deepEqual(corpo.contents.map((c) => c.role), ['user', 'model', 'user']);
    assert.ok(!chamadas.some((c) => c.url.includes('2026-10-13')), 'não deve ler outras sessões');
});

test('escopo grande passa pelo roteador e lê só as sessões escolhidas', async () => {
    const env = envBase({ ORCAMENTO_CARACTERES: '500' });
    const resp = await proxy.fetch(pedido({ pergunta: 'Debates sobre ICMS?', escopo: { tipo: 'todas' } }), env, { waitUntil() {} });
    const lista = await eventos(resp);
    const fontes = lista.find((e) => e.evento === 'fontes').dados;
    assert.equal(fontes.modo, 'selecao');
    assert.deepEqual(fontes.integrais.map((f) => f.id), ['2026-10-14_primeira_secao']);
    assert.equal(fontes.indice.length, 3);

    const corpo = JSON.parse(chamadas.find((c) => c.url.includes(':streamGenerateContent')).init.body);
    const instrucao = corpo.systemInstruction.parts[0].text;
    assert.match(instrucao, /<indice_de_sessoes>/);
    assert.match(instrucao, /<sessao id="2026-10-14_primeira_secao">/);
    assert.doesNotMatch(instrucao, /<sessao id="2026-10-20_primeira_turma">/);
});

test('falha do Gemini chega ao portal como evento de erro legível', async () => {
    globalThis.fetch = async (entrada) => {
        const url = String(entrada);
        if (url.endsWith('indice.json')) return Response.json(indice);
        if (url.endsWith('.txt')) return new Response('<sessao>x</sessao>');
        return new Response('{"error":{"message":"quota"}}', { status: 429 });
    };
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'sessao', sessaoId: '2026-10-20_primeira_turma' } }), envBase(), { waitUntil() {} });
    const lista = await eventos(resp);
    assert.equal(lista.at(-1).evento, 'erro');
    assert.match(lista.at(-1).dados.mensagem, /muitas perguntas/);
});

test('matéria sem sessões no escopo responde sem chamar o Gemini', async () => {
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'orgao', orgao: 'primeira_secao' }, materiaId: 13 }), envBase(), { waitUntil() {} });
    const lista = await eventos(resp);
    assert.equal(lista.find((e) => e.evento === 'fontes').dados.modo, 'vazio');
    assert.ok(!chamadas.some((c) => c.url.includes('googleapis') || c.url.includes(':stream')));
});

test('interruptor EXIGIR_CODIGO: padrão exige; "nao" libera', () => {
    assert.equal(exigeCodigo({}), true);
    assert.equal(exigeCodigo({ EXIGIR_CODIGO: 'sim' }), true);
    assert.equal(exigeCodigo({ EXIGIR_CODIGO: 'nao' }), false);
    assert.equal(exigeCodigo({ EXIGIR_CODIGO: ' NAO ' }), false);
});

test('com o código desligado, pergunta sem código é respondida', async () => {
    const env = envBase({ EXIGIR_CODIGO: 'nao' });
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'sessao', sessaoId: '2026-10-20_primeira_turma' } }, { codigo: null }), env, { waitUntil() {} });
    assert.equal(resp.status, 200);
    const lista = await eventos(resp);
    assert.equal(lista.at(-1).evento, 'fim');

    const verificar = await proxy.fetch(new Request('https://proxy.exemplo/api/verificar', { method: 'POST', headers: { origin: ORIGEM } }), env);
    assert.deepEqual(await verificar.json(), { ok: true, nome: 'publico' });
});

test('com o código desligado, o limite por endereço continua valendo', async () => {
    const chaves = [];
    const env = envBase({ EXIGIR_CODIGO: 'nao', LIMITADOR: { limit: async ({ key }) => { chaves.push(key); return { success: false }; } } });
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'todas' } }, { codigo: null }), env);
    assert.equal(resp.status, 429);
    assert.match(chaves[0], /^ip:/);
});

test('erro de material do portal não mostra endereço técnico ao usuário', async () => {
    globalThis.fetch = async () => new Response('não encontrado', { status: 404 });
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'todas' } }), envBase(), { waitUntil() {} });
    const lista = await eventos(resp);
    assert.equal(lista.at(-1).evento, 'erro');
    assert.match(lista.at(-1).dados.mensagem, /problema de configuração/);
    assert.doesNotMatch(lista.at(-1).dados.mensagem, /https?:/);
});

// Formato real dos erros 429 do Gemini (google.rpc.QuotaFailure e RetryInfo)
function erro429(quotaId, retryDelay) {
    const details = [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId, quotaMetric: 'generativelanguage.googleapis.com/generate_content_requests' }] }];
    if (retryDelay) details.push({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay });
    return JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota.', details } });
}

test('classificarErro distingue os limites do Gemini', () => {
    const minuto = classificarErro(429, erro429('GenerateRequestsPerMinutePerProjectPerModel', '37.2s'));
    assert.equal(minuto.tipo, 'limite_ia');
    assert.equal(minuto.tentarEm, 38);

    const semEspera = classificarErro(429, erro429('GenerateContentInputTokensPerModelPerMinute'));
    assert.equal(semEspera.tipo, 'limite_ia');
    assert.equal(semEspera.tentarEm, 30);

    const dia = classificarErro(429, erro429('GenerateRequestsPerDayPerProjectPerModel', '3600s'));
    assert.equal(dia.tipo, 'limite_diario');
    assert.equal(dia.tentarEm, undefined);
    assert.match(dia.mensagem, /amanhã/);

    const gastos = classificarErro(429, '{"error":{"code":429,"message":"Your project has exceeded its monthly spending cap."}}');
    assert.equal(gastos.tipo, 'limite_gastos');

    assert.equal(classificarErro(503, '').tipo, 'instavel');
    assert.equal(classificarErro(404, '').tipo, 'configuracao');
});

test('limite do Gemini chega ao painel com tipo e tempo de espera', async () => {
    globalThis.fetch = async (entrada) => {
        const url = String(entrada);
        if (url.endsWith('indice.json')) return Response.json(indice);
        if (url.endsWith('.txt')) return new Response('<sessao>x</sessao>');
        return new Response(erro429('GenerateRequestsPerMinutePerProjectPerModel', '12s'), { status: 429 });
    };
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'sessao', sessaoId: '2026-10-20_primeira_turma' } }), envBase(), { waitUntil() {} });
    const ultimo = (await eventos(resp)).at(-1);
    assert.equal(ultimo.evento, 'erro');
    assert.equal(ultimo.dados.tipo, 'limite_ia');
    assert.equal(ultimo.dados.tentarEm, 12);
});

test('limite por rede do proxy informa tipo e espera de 60 s', async () => {
    const env = envBase({ LIMITADOR: { limit: async () => ({ success: false }) } });
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'todas' } }), env);
    assert.equal(resp.status, 429);
    const corpo = await resp.json();
    assert.equal(corpo.tipo, 'limite_rede');
    assert.equal(corpo.tentarEm, 60);
    assert.match(corpo.erro, /20 por minuto/);
});

test('conversa longa demais volta com tipo próprio', async () => {
    const historico = Array.from({ length: 13 }, (_, i) => ({ papel: i % 2 ? 'assistente' : 'usuario', texto: 'a' }));
    const resp = await proxy.fetch(pedido({ pergunta: 'x', escopo: { tipo: 'todas' }, historico }), envBase());
    assert.equal(resp.status, 400);
    assert.equal((await resp.json()).tipo, 'conversa_longa');
});
