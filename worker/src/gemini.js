// Chamada ao Gemini pela API generateContent (REST). Toda a conversa com o Google fica
// neste arquivo: para migrar para outra API, basta trocá-lo.
// A chave vai no cabeçalho x-goog-api-key, nunca na URL.

const BASE_PADRAO = 'https://generativelanguage.googleapis.com';

// tipo: categoria do problema, usada pelo painel para escolher título e ação
// tentarEm: segundos sugeridos de espera antes de tentar de novo (quando fizer sentido)
export class ErroGemini extends Error {
    constructor(mensagem, status, tipo = 'outro', tentarEm = null) {
        super(mensagem);
        this.status = status;
        this.tipo = tipo;
        this.tentarEm = tentarEm;
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

// Mensagens para quem usa o portal: simples, sem termos técnicos.
// O detalhe técnico vai para o log do Cloudflare (ver enviar()).
export const MENSAGEM_CONFIGURACAO = 'O assistente está com um problema de configuração. Avise o administrador.';

export const MENSAGENS = {
    limite_ia: 'O serviço de IA recebeu muitas perguntas ao mesmo tempo. Aguarde um pouco e tente de novo.',
    limite_diario: 'O assistente atingiu o limite de perguntas de hoje. Ele volta a funcionar amanhã de manhã.',
    limite_gastos: 'O assistente atingiu o limite de gastos do mês e está pausado. Avise o administrador do Caderno de Sessões.',
    instavel: 'O serviço de IA está instável no momento. Aguarde um pouco e tente de novo.',
};

// Lê o tempo de espera que o Google informa no erro 429 (RetryInfo.retryDelay, ex.: "37s")
function esperaInformada(erro) {
    for (const d of erro?.details || []) {
        const m = String(d?.retryDelay || '').match(/^(\d+(?:\.\d+)?)s$/);
        if (m) return Math.max(1, Math.ceil(Number(m[1])));
    }
    return null;
}

// Identifica qual cota do Google foi atingida (por minuto ou por dia)
function cotaAtingida(erro) {
    const ids = [];
    for (const d of erro?.details || []) {
        for (const v of d?.violations || []) ids.push(`${v.quotaId || ''} ${v.quotaMetric || ''}`);
    }
    const texto = `${ids.join(' ')} ${erro?.message || ''}`;
    if (/per ?day|PerDay|daily/i.test(texto)) return 'dia';
    return 'minuto';
}

export function classificarErro(status, corpoTexto) {
    let erro = null;
    try {
        erro = JSON.parse(corpoTexto)?.error || null;
    } catch { /* corpo não é JSON */ }
    const detalhe = erro?.message || '';

    if (status === 429 && /spend(ing)? cap|billing|prepay|credit/i.test(detalhe)) {
        return { tipo: 'limite_gastos', mensagem: MENSAGENS.limite_gastos };
    }
    if (status === 429 && cotaAtingida(erro) === 'dia') {
        return { tipo: 'limite_diario', mensagem: MENSAGENS.limite_diario };
    }
    if (status === 429) {
        return { tipo: 'limite_ia', mensagem: MENSAGENS.limite_ia, tentarEm: esperaInformada(erro) || 30 };
    }
    if (status === 400 && /api key/i.test(detalhe)) return { tipo: 'configuracao', mensagem: MENSAGEM_CONFIGURACAO };
    if (status === 401 || status === 403 || status === 404) return { tipo: 'configuracao', mensagem: MENSAGEM_CONFIGURACAO };
    if (status >= 500) return { tipo: 'instavel', mensagem: MENSAGENS.instavel, tentarEm: 20 };
    return { tipo: 'outro', mensagem: `A IA não conseguiu responder (erro ${status}). Tente de novo.` };
}

export function mensagemErro(status, corpoTexto) {
    return classificarErro(status, corpoTexto).mensagem;
}

async function enviar(env, modelo, metodo, corpo, signal) {
    if (!env.GEMINI_API_KEY) {
        console.error(JSON.stringify({ evento: 'erro_configuracao', detalhe: 'GEMINI_API_KEY ausente' }));
        throw new ErroGemini(MENSAGEM_CONFIGURACAO, 500, 'configuracao');
    }
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
        const { mensagem, tipo, tentarEm } = classificarErro(resposta.status, texto);
        throw new ErroGemini(mensagem, resposta.status, tipo, tentarEm);
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
