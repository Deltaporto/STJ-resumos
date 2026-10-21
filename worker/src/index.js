// Proxy do Assistente do Caderno de Sessões (GMHB).
// Guarda a chave do Gemini e os códigos de acesso da equipe; o portal estático só fala com ele.
//
// Rotas:
//   GET  /api/saude      -> verificação simples de funcionamento
//   POST /api/verificar  -> confere o código de acesso (tela de entrada do painel)
//   POST /api/perguntar  -> responde em fluxo (text/event-stream)

import { autenticar } from './auth.js';
import {
    ErroCorpus,
    carregarIndice,
    carregarSessoes,
    cortarPorOrcamento,
    descreverEscopo,
    filtrarCandidatas,
    montarMaterial,
    textoIndice,
} from './corpus.js';
import { ErroGemini, gerarJson, gerarStream, montarConteudo, montarCorpo } from './gemini.js';
import { ESQUEMA_ROTEADOR, instrucaoResposta, instrucaoRoteador } from './prompts.js';

const MATERIAS = {
    1: 'Improbidade Administrativa',
    2: 'Desapropriação / Intervenção do Estado',
    3: 'Reforma Agrária',
    4: 'Servidor Público Civil e Militar',
    5: 'Atos Administrativos',
    6: 'Licitações e Contratos',
    7: 'Responsabilidade Civil da Administração',
    8: 'Direito Tributário',
    9: 'Poder de Polícia (Exceto Ambiental)',
    10: 'Ação Civil Pública',
    11: 'Direito Previdenciário',
    12: 'Direito Ambiental Urbanístico',
    13: 'Direito dos Povos Indígenas',
    14: 'Saúde Pública',
    15: 'Direito do Consumidor',
};

const LIMITES = {
    pergunta: 2000,
    mensagensHistorico: 12,
    caracteresMensagem: 12000,
    caracteresHistorico: 60000,
};

const ID_SESSAO = /^\d{4}-\d{2}-\d{2}_[a-z_]+$/;

function numero(valor, padrao) {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : padrao;
}

function origensPermitidas(env) {
    return String(env.ORIGENS_PERMITIDAS || '')
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

function cabecalhosCors(request, env) {
    const origem = request.headers.get('origin');
    if (!origem || !origensPermitidas(env).includes(origem)) return {};
    return {
        'access-control-allow-origin': origem,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '86400',
        vary: 'Origin',
    };
}

function json(dados, status, cors) {
    return new Response(JSON.stringify(dados), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors },
    });
}

function ipDoCliente(request) {
    return request.headers.get('cf-connecting-ip') || 'desconhecido';
}

async function dentroDoLimite(env, chave) {
    if (!env.LIMITADOR) return true;
    const { success } = await env.LIMITADOR.limit({ key: chave });
    return success;
}

export function validarPedido(corpo) {
    if (!corpo || typeof corpo !== 'object') return { erro: 'Corpo da requisição inválido.' };

    const pergunta = typeof corpo.pergunta === 'string' ? corpo.pergunta.trim() : '';
    if (!pergunta) return { erro: 'Escreva uma pergunta.' };
    if (pergunta.length > LIMITES.pergunta) {
        return { erro: `A pergunta passa de ${LIMITES.pergunta} caracteres.` };
    }

    const e = corpo.escopo || {};
    let escopo;
    if (e.tipo === 'sessao' && ID_SESSAO.test(String(e.sessaoId || ''))) {
        escopo = { tipo: 'sessao', sessaoId: e.sessaoId };
    } else if (e.tipo === 'orgao' && ['primeira_turma', 'primeira_secao'].includes(e.orgao)) {
        escopo = { tipo: 'orgao', orgao: e.orgao };
    } else if (e.tipo === 'todas') {
        escopo = { tipo: 'todas' };
    } else {
        return { erro: 'Escopo de pesquisa inválido.' };
    }

    let materiaId = null;
    if (corpo.materiaId !== undefined && corpo.materiaId !== null && corpo.materiaId !== '') {
        materiaId = Number(corpo.materiaId);
        if (!MATERIAS[materiaId]) return { erro: 'Matéria inválida.' };
    }

    const historicoBruto = Array.isArray(corpo.historico) ? corpo.historico : [];
    if (historicoBruto.length > LIMITES.mensagensHistorico) {
        return { erro: 'Conversa longa demais. Comece uma nova conversa.' };
    }
    const historico = [];
    let total = 0;
    for (const m of historicoBruto) {
        if (!m || !['usuario', 'assistente'].includes(m.papel) || typeof m.texto !== 'string') {
            return { erro: 'Histórico da conversa inválido.' };
        }
        const texto = m.texto.slice(0, LIMITES.caracteresMensagem);
        total += texto.length;
        if (texto.trim()) historico.push({ papel: m.papel, texto });
    }
    if (total > LIMITES.caracteresHistorico) {
        return { erro: 'Conversa longa demais. Comece uma nova conversa.' };
    }

    return { pedido: { pergunta, escopo, materiaId, historico } };
}

// Decide o que o modelo vai ler. Com poucas sessões, tudo vai na íntegra; com muitas,
// um primeiro passo escolhe as sessões relevantes a partir do índice.
async function planejarContexto(env, pedido, emitir, signal) {
    const orcamento = numero(env.ORCAMENTO_CARACTERES, 600000);
    const orcamentoIndice = numero(env.ORCAMENTO_INDICE, 300000);
    const maxCompletas = numero(env.MAX_SESSOES_COMPLETAS, 3);

    const indice = await carregarIndice(env);
    const candidatas = filtrarCandidatas(indice, pedido.escopo, pedido.materiaId);
    if (!candidatas.length) {
        return { vazio: true };
    }
    const materia = pedido.materiaId ? MATERIAS[pedido.materiaId] : null;
    const descricao = descreverEscopo(pedido.escopo, candidatas, materia);
    const total = candidatas.reduce((s, c) => s + (c.caracteres || 0), 0);

    if (pedido.escopo.tipo === 'sessao' || total <= orcamento) {
        emitir('estado', { texto: lendo(candidatas.length) });
        const textos = await carregarSessoes(env, candidatas);
        return {
            modo: 'integral',
            completas: candidatas,
            indice: [],
            material: montarMaterial({ descricao, completas: candidatas, textosCompletos: textos }),
        };
    }

    // Escopo grande: índice resumido de tudo (até o limite) + leitura integral das mais relevantes
    const noIndice = cortarPorOrcamento(candidatas, (c) => (c.indice || '').length, orcamentoIndice);
    emitir('estado', { texto: 'Procurando as sessões relevantes…' });

    let escolhidosIds = [];
    let usoRoteador = null;
    try {
        const ultimas = pedido.historico.slice(-4).map((m) => `${m.papel === 'usuario' ? 'Usuário' : 'Assistente'}: ${m.texto.slice(0, 1500)}`);
        const entrada = [
            textoIndice(noIndice),
            ultimas.length ? `\nHistórico recente da conversa:\n${ultimas.join('\n')}` : '',
            `\nPergunta: ${pedido.pergunta}`,
        ].join('\n');
        const { valor, uso } = await gerarJson(env, montarCorpo({
            instrucao: instrucaoRoteador(maxCompletas),
            conteudo: [{ role: 'user', parts: [{ text: entrada }] }],
            nivelRaciocinio: env.GEMINI_NIVEL_RACIOCINIO_ROTEADOR || 'low',
            esquemaJson: ESQUEMA_ROTEADOR,
        }), signal);
        usoRoteador = uso;
        escolhidosIds = Array.isArray(valor?.sessoes) ? valor.sessoes.map(String) : [];
    } catch (erro) {
        // Sem o roteador, segue com as sessões mais recentes
        console.warn(JSON.stringify({ evento: 'roteador_falhou', erro: String(erro?.message || erro) }));
        escolhidosIds = candidatas.slice(0, maxCompletas).map((c) => c.id);
    }

    const porId = new Map(candidatas.map((c) => [c.id, c]));
    const escolhidas = [...new Set(escolhidosIds)].map((id) => porId.get(id)).filter(Boolean).slice(0, maxCompletas);
    const completas = escolhidas.length ? cortarPorOrcamento(escolhidas, (c) => c.caracteres || 0, orcamento) : [];
    if (completas.length) emitir('estado', { texto: lendo(completas.length) });
    const textos = completas.length ? await carregarSessoes(env, completas) : [];

    return {
        modo: 'selecao',
        completas,
        indice: noIndice,
        usoRoteador,
        material: montarMaterial({ descricao, indice: noIndice, completas, textosCompletos: textos }),
    };
}

// Textos curtos de andamento mostrados no painel enquanto a resposta não chega
function lendo(quantidade) {
    return quantidade === 1 ? 'Lendo a sessão…' : `Lendo ${quantidade} sessões…`;
}

function resumoFonte(c) {
    return { id: c.id, titulo: c.titulo, videoUrl: c.videoUrl };
}

async function responderEmFluxo(env, pedido, usuario, escrever, signal) {
    const inicio = Date.now();
    const emitir = (evento, dados) => escrever(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);

    const plano = await planejarContexto(env, pedido, emitir, signal);
    if (plano.vazio) {
        await emitir('fontes', { modo: 'vazio', integrais: [], indice: [] });
        await emitir('texto', { t: 'Não há sessões publicadas para o escopo e a matéria escolhidos. Tente ampliar o escopo no seletor acima.' });
        await emitir('fim', {});
        return;
    }

    await emitir('fontes', {
        modo: plano.modo,
        integrais: plano.completas.map(resumoFonte),
        indice: plano.indice.map(resumoFonte),
    });
    await emitir('estado', { texto: 'Pensando…' });

    const corpo = montarCorpo({
        instrucao: instrucaoResposta(plano.material),
        conteudo: montarConteudo(pedido.historico, pedido.pergunta),
        nivelRaciocinio: env.GEMINI_NIVEL_RACIOCINIO || '',
        maxTokens: numero(env.MAX_TOKENS_RESPOSTA, 16384),
    });

    let uso = null;
    let motivoFim = null;
    let algumTexto = false;
    for await (const pedaco of gerarStream(env, corpo, signal)) {
        if (pedaco.bloqueio) {
            await emitir('erro', { mensagem: 'O Gemini bloqueou esta pergunta pelos filtros de segurança. Reformule a pergunta.' });
            return;
        }
        if (pedaco.texto) {
            algumTexto = true;
            await emitir('texto', { t: pedaco.texto });
        }
        if (pedaco.uso) uso = pedaco.uso;
        if (pedaco.motivoFim) motivoFim = pedaco.motivoFim;
    }

    let aviso = null;
    if (motivoFim === 'MAX_TOKENS') aviso = 'A resposta foi interrompida por atingir o tamanho máximo. Peça a continuação ou uma versão mais curta.';
    else if (motivoFim && motivoFim !== 'STOP') aviso = `A resposta foi interrompida pelo Gemini (${motivoFim}).`;
    else if (!algumTexto) aviso = 'O Gemini não devolveu texto para esta pergunta. Tente reformular.';

    await emitir('fim', {
        aviso,
        uso: uso ? {
            entrada: uso.promptTokenCount || 0,
            emCache: uso.cachedContentTokenCount || 0,
            saida: (uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0),
        } : null,
    });

    console.log(JSON.stringify({
        evento: 'pergunta',
        usuario,
        escopo: pedido.escopo.tipo,
        materia: pedido.materiaId,
        modo: plano.modo,
        integrais: plano.completas.length,
        indice: plano.indice.length,
        tokensEntrada: uso?.promptTokenCount,
        tokensCache: uso?.cachedContentTokenCount,
        tokensSaida: uso?.candidatesTokenCount,
        tokensRaciocinio: uso?.thoughtsTokenCount,
        tokensRoteador: plano.usoRoteador?.totalTokenCount,
        ms: Date.now() - inicio,
    }));
}

async function perguntar(request, env, ctx, cors, usuario) {
    let corpo;
    try {
        corpo = await request.json();
    } catch {
        return json({ erro: 'Corpo da requisição não é JSON.' }, 400, cors);
    }
    const { pedido, erro } = validarPedido(corpo);
    if (erro) return json({ erro }, 400, cors);

    const { readable, writable } = new TransformStream();
    const escritor = writable.getWriter();
    const codificador = new TextEncoder();
    const controle = new AbortController();
    let aberto = true;

    const escrever = async (texto) => {
        if (!aberto) return;
        try {
            await escritor.write(codificador.encode(texto));
        } catch {
            // O usuário fechou o painel ou interrompeu a resposta: cancela o Gemini também
            aberto = false;
            controle.abort();
        }
    };

    const tarefa = (async () => {
        try {
            await responderEmFluxo(env, pedido, usuario, escrever, controle.signal);
        } catch (falha) {
            if (controle.signal.aborted) return;
            const mensagem = falha instanceof ErroGemini || falha instanceof ErroCorpus
                ? falha.message
                : 'Erro inesperado no assistente. Tente novamente.';
            console.error(JSON.stringify({ evento: 'erro', usuario, mensagem: String(falha?.message || falha) }));
            await escrever(`event: erro\ndata: ${JSON.stringify({ mensagem })}\n\n`);
        } finally {
            if (aberto) await escritor.close().catch(() => {});
        }
    })();
    if (ctx?.waitUntil) ctx.waitUntil(tarefa);

    return new Response(readable, {
        status: 200,
        headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            'x-accel-buffering': 'no',
            ...cors,
        },
    });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const cors = cabecalhosCors(request, env);
        const origem = request.headers.get('origin');

        if (origem && !cors['access-control-allow-origin']) {
            return json({ erro: 'Origem não autorizada.' }, 403, {});
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }
        if (url.pathname === '/api/saude' && request.method === 'GET') {
            return json({ ok: true, modelo: env.GEMINI_MODELO || 'gemini-3.8-flash' }, 200, cors);
        }

        const rota = url.pathname;
        if (request.method !== 'POST' || !['/api/verificar', '/api/perguntar'].includes(rota)) {
            return json({ erro: 'Rota não encontrada.' }, 404, cors);
        }

        // Limite por endereço antes da autenticação (protege contra tentativa de adivinhar códigos)
        if (!(await dentroDoLimite(env, `ip:${ipDoCliente(request)}`))) {
            return json({ erro: 'Muitas requisições. Aguarde um minuto.' }, 429, cors);
        }
        const usuario = await autenticar(request, env);
        if (!usuario) {
            return json({ erro: 'Código de acesso inválido.' }, 401, cors);
        }
        if (rota === '/api/verificar') {
            return json({ ok: true, nome: usuario }, 200, cors);
        }
        if (!(await dentroDoLimite(env, `usuario:${usuario}`))) {
            return json({ erro: 'Muitas perguntas em pouco tempo. Aguarde um minuto.' }, 429, cors);
        }
        return perguntar(request, env, ctx, cors, usuario);
    },
};
