// Chamada ao Gemini pela API generateContent (REST). Toda a conversa com o Google fica
// neste arquivo: para migrar para outra API, basta trocá-lo.
// A chave vai no cabeçalho x-goog-api-key, nunca na URL.

const BASE_PADRAO = 'https://generativelanguage.googleapis.com';

export class ErroGemini extends Error {
    constructor(mensagem, status) {
        super(mensagem);
        this.status = status;
    }
}

export function montarCorpo({ instrucao, conteudo, nivelRaciocinio, maxTokens, esquemaJson }) {
    const generationConfig = {};
    if (maxTokens) generationConfig.maxOutputTokens = maxTokens;
    if (nivelRaciocinio) generationConfig.thinkingConfig = { thinkingLevel: nivelRaciocinio };
    if (esquemaJson) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = esquemaJson;
    }
    return {
        systemInstruction: { parts: [{ text: instrucao }] },
        contents: conteudo,
        generationConfig,
    };
}

// Converte o histórico do portal para o formato do Gemini (papéis alternados, começando pelo usuário)
export function montarConteudo(historico, pergunta) {
    const conteudo = [];
    for (const msg of historico) {
        const role = msg.papel === 'assistente' ? 'model' : 'user';
        if (!conteudo.length && role === 'model') continue;
        const ultimo = conteudo[conteudo.length - 1];
        if (ultimo && ultimo.role === role) {
            ultimo.parts[0].text += `\n\n${msg.texto}`;
        } else {
            conteudo.push({ role, parts: [{ text: msg.texto }] });
        }
    }
    const ultimo = conteudo[conteudo.length - 1];
    if (ultimo && ultimo.role === 'user') {
        ultimo.parts[0].text += `\n\n${pergunta}`;
    } else {
        conteudo.push({ role: 'user', parts: [{ text: pergunta }] });
    }
    return conteudo;
}

function urlModelo(env, modelo, metodo) {
    const base = String(env.GEMINI_API_BASE || BASE_PADRAO).replace(/\/+$/, '');
    const sufixo = metodo === 'streamGenerateContent' ? '?alt=sse' : '';
    return `${base}/v1beta/models/${encodeURIComponent(modelo)}:${metodo}${sufixo}`;
}

export function mensagemErro(status, corpoTexto) {
    let detalhe = '';
    try {
        detalhe = JSON.parse(corpoTexto)?.error?.message || '';
    } catch { /* corpo não é JSON */ }
    if (status === 429) return 'A cota da API do Gemini foi atingida. Tente novamente em alguns minutos.';
    if (status === 400 && /api key/i.test(detalhe)) return 'A chave da API do Gemini configurada no proxy é inválida.';
    if (status === 401 || status === 403) return 'A chave da API do Gemini não tem permissão para este modelo.';
    if (status === 404) return 'Modelo do Gemini não encontrado. Confira GEMINI_MODELO no proxy.';
    if (status >= 500) return 'O serviço do Gemini está instável no momento. Tente novamente.';
    return `O Gemini recusou a requisição (${status}).`;
}

async function enviar(env, modelo, metodo, corpo, signal) {
    if (!env.GEMINI_API_KEY) throw new ErroGemini('GEMINI_API_KEY não configurada no proxy.', 500);
    const resposta = await fetch(urlModelo(env, modelo, metodo), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify(corpo),
        signal,
    });
    if (!resposta.ok) {
        const texto = await resposta.text().catch(() => '');
        console.error(JSON.stringify({ evento: 'erro_gemini', status: resposta.status, detalhe: texto.slice(0, 500) }));
        throw new ErroGemini(mensagemErro(resposta.status, texto), resposta.status);
    }
    return resposta;
}

// Lê um fluxo SSE e devolve cada objeto JSON enviado em "data:"
export async function* lerEventosSSE(corpo) {
    const leitor = corpo.getReader();
    const decodificador = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { value, done } = await leitor.read();
            if (value) buffer += decodificador.decode(value, { stream: true });
            if (done) buffer += decodificador.decode();
            let fim;
            while ((fim = buffer.search(/\r?\n\r?\n/)) !== -1) {
                const bloco = buffer.slice(0, fim);
                buffer = buffer.slice(fim).replace(/^\r?\n\r?\n/, '');
                const dados = bloco
                    .split(/\r?\n/)
                    .filter((l) => l.startsWith('data:'))
                    .map((l) => l.slice(5).trimStart())
                    .join('\n');
                if (dados && dados !== '[DONE]') yield JSON.parse(dados);
            }
            if (done) break;
        }
        if (buffer.trim().startsWith('data:')) {
            const dados = buffer.trim().slice(5).trimStart();
            if (dados && dados !== '[DONE]') yield JSON.parse(dados);
        }
    } finally {
        leitor.releaseLock();
    }
}

// Extrai o texto visível (sem o raciocínio interno) e os metadados de um pedaço da resposta
export function interpretarPedaco(pedaco) {
    const candidato = pedaco?.candidates?.[0];
    const texto = (candidato?.content?.parts || [])
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('');
    return {
        texto,
        motivoFim: candidato?.finishReason || null,
        bloqueio: pedaco?.promptFeedback?.blockReason || null,
        uso: pedaco?.usageMetadata || null,
    };
}

export async function* gerarStream(env, corpo, signal) {
    const modelo = env.GEMINI_MODELO || 'gemini-3.8-flash';
    const resposta = await enviar(env, modelo, 'streamGenerateContent', corpo, signal);
    for await (const pedaco of lerEventosSSE(resposta.body)) {
        yield interpretarPedaco(pedaco);
    }
}

export async function gerarJson(env, corpo, signal) {
    const modelo = env.GEMINI_MODELO_ROTEADOR || env.GEMINI_MODELO || 'gemini-3.8-flash';
    const resposta = await enviar(env, modelo, 'generateContent', corpo, signal);
    const dados = await resposta.json();
    const { texto, uso } = interpretarPedaco(dados);
    return { valor: JSON.parse(texto || '{}'), uso };
}
