// Servidor local para testar o portal com o assistente sem publicar nada.
// Serve a pasta web/ e encaminha /api/* para o mesmo código do proxy (src/index.js).
//
//   node scripts/servidor-local.mjs                    -> usa o Gemini real (chave em .dev.vars)
//   node scripts/servidor-local.mjs --simular-gemini   -> respostas simuladas, sem chave nem custo
//   opções: --porta 8791

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import proxy from '../src/index.js';

const raizWorker = resolve(fileURLToPath(new URL('..', import.meta.url)));
const raizWeb = resolve(raizWorker, '..', 'web');
const args = process.argv.slice(2);
const simular = args.includes('--simular-gemini');
const iPorta = args.indexOf('--porta');
const porta = iPorta >= 0 ? Number(args[iPorta + 1]) : 8791;
const origemLocal = `http://localhost:${porta}`;

function lerDevVars() {
    const caminho = join(raizWorker, '.dev.vars');
    if (!existsSync(caminho)) return {};
    const vars = {};
    for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return vars;
}

function lerVarsWrangler() {
    const toml = readFileSync(join(raizWorker, 'wrangler.toml'), 'utf8');
    const bloco = toml.split('[vars]')[1]?.split(/\n\[/)[0] || '';
    const vars = {};
    for (const m of bloco.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/gm)) vars[m[1]] = m[2];
    return vars;
}

const env = {
    ...lerVarsWrangler(),
    ...lerDevVars(),
    SITE_BASE_URL: `${origemLocal}/`,
    ORIGENS_PERMITIDAS: origemLocal,
    CACHE_SEGUNDOS: '5',
};

if (simular) {
    env.GEMINI_API_KEY = env.GEMINI_API_KEY || 'simulada';
    env.CODIGOS_ACESSO = env.CODIGOS_ACESSO || 'teste:codigo-local-123';
    instalarGeminiSimulado();
}
if (!env.GEMINI_API_KEY) {
    console.error('Falta GEMINI_API_KEY em worker/.dev.vars (ou use --simular-gemini).');
    process.exit(1);
}
if (!env.CODIGOS_ACESSO) {
    console.error('Falta CODIGOS_ACESSO em worker/.dev.vars.');
    process.exit(1);
}

// Respostas falsas do Gemini, em fluxo, para testar a interface sem custo
function instalarGeminiSimulado() {
    const fetchReal = globalThis.fetch;
    globalThis.fetch = async (entrada, init) => {
        const url = String(entrada?.url || entrada);
        if (!url.includes('generativelanguage.googleapis.com')) return fetchReal(entrada, init);
        const corpo = JSON.parse(init.body);
        const instrucao = corpo.systemInstruction.parts[0].text;
        const pergunta = corpo.contents.at(-1).parts[0].text;
        const ids = [...instrucao.matchAll(/<sessao(?:_indice)? id="(\d{4}-\d{2}-\d{2}_[a-z_]+)"/g)].map((m) => m[1]);

        if (url.includes(':generateContent')) {
            // Roteador: o índice vem na mensagem do usuário
            const idsIndice = [...pergunta.matchAll(/<sessao_indice id="(\d{4}-\d{2}-\d{2}_[a-z_]+)"/g)].map((m) => m[1]);
            const texto = JSON.stringify({ sessoes: idsIndice.slice(0, 2) });
            return Response.json({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 1200 } });
        }

        const id = ids[0] || 'sessao';
        const minuto = instrucao.match(/\[(\d{2}:\d{2}:\d{2})\]/)?.[1] || '00:30:00';
        const resposta = [
            `**Resposta simulada** (modo de teste, sem chamar o Gemini).\n\n`,
            `Você perguntou: _${pergunta.split('\n').at(-1).slice(0, 120)}_\n\n`,
            `### O que o material mostra\n`,
            `- O material desta consulta tem ${ids.length} sessão(ões); a primeira é \`${id}\` [[${id}@${minuto}]].\n`,
            `- Um segundo ponto, com **negrito** e uma citação de minuto [[${id}@01:00:45]].\n\n`,
            `| Processo | Resultado |\n|---|---|\n| AgInt no AREsp 3.095.458/SP | Desprovido |\n\n`,
            `Fim da resposta simulada.`,
        ];
        const codificador = new TextEncoder();
        const fluxo = new ReadableStream({
            async start(controle) {
                for (const parte of resposta) {
                    await new Promise((r) => setTimeout(r, 180));
                    const pedaco = { candidates: [{ content: { parts: [{ text: parte }], role: 'model' } }] };
                    controle.enqueue(codificador.encode(`data: ${JSON.stringify(pedaco)}\r\n\r\n`));
                }
                const final = {
                    candidates: [{ content: { parts: [{ text: '' }], role: 'model' }, finishReason: 'STOP' }],
                    usageMetadata: { promptTokenCount: Math.round(instrucao.length / 4), candidatesTokenCount: 150 },
                };
                controle.enqueue(codificador.encode(`data: ${JSON.stringify(final)}\r\n\r\n`));
                controle.close();
            },
        });
        return new Response(fluxo, { headers: { 'content-type': 'text/event-stream' } });
    };
}

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

async function servirEstatico(req, res) {
    const caminhoUrl = decodeURIComponent(new URL(req.url, origemLocal).pathname);
    // No servidor local, o painel aponta para este mesmo endereço
    if (caminhoUrl === '/assistente-config.js') {
        res.writeHead(200, { 'content-type': TIPOS['.js'], 'cache-control': 'no-store' });
        res.end(`window.ASSISTENTE_CONFIG = { apiUrl: ${JSON.stringify(origemLocal)} };\n`);
        return;
    }
    let arquivo = normalize(join(raizWeb, caminhoUrl));
    if (arquivo !== raizWeb && !arquivo.startsWith(raizWeb + sep)) {
        res.writeHead(403).end();
        return;
    }
    try {
        if ((await stat(arquivo)).isDirectory()) arquivo = join(arquivo, 'index.html');
        const conteudo = await readFile(arquivo);
        res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(conteudo);
    } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    }
}

async function encaminharProxy(req, res) {
    const corpo = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Readable.toWeb(req);
    const pedido = new Request(new URL(req.url, origemLocal), {
        method: req.method,
        headers: req.headers,
        body: corpo,
        duplex: 'half',
    });
    const pendentes = [];
    const resposta = await proxy.fetch(pedido, env, { waitUntil: (p) => pendentes.push(p) });
    res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
    if (!resposta.body) return res.end();
    const leitor = resposta.body.getReader();
    req.on('close', () => leitor.cancel().catch(() => {}));
    while (true) {
        const { value, done } = await leitor.read();
        if (done) break;
        res.write(value);
    }
    res.end();
}

createServer((req, res) => {
    const tratar = req.url.startsWith('/api/') ? encaminharProxy : servirEstatico;
    tratar(req, res).catch((erro) => {
        console.error(erro);
        if (!res.headersSent) res.writeHead(500);
        res.end();
    });
}).listen(porta, () => {
    console.log(`Portal com assistente em ${origemLocal} ${simular ? '(Gemini SIMULADO)' : `(Gemini real: ${env.GEMINI_MODELO})`}`);
});
