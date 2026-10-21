// Leitura do material publicado no portal (web/assistente/) e montagem do contexto.
// O proxy só aceita material do endereço configurado em SITE_BASE_URL.

const cache = new Map();

function baseDoSite(env) {
    const base = String(env.SITE_BASE_URL || '').trim();
    if (!base) throw new ErroCorpus('SITE_BASE_URL não configurado no proxy.');
    return base.endsWith('/') ? base : `${base}/`;
}

export class ErroCorpus extends Error {}

async function buscarTexto(url, ttlSegundos) {
    const agora = Date.now();
    const guardado = cache.get(url);
    if (guardado && guardado.expira > agora) return guardado.valor;

    const resposta = await fetch(url, { cf: { cacheTtl: ttlSegundos, cacheEverything: true } });
    if (!resposta.ok) {
        throw new ErroCorpus(`Material do portal indisponível (${resposta.status}) em ${url}`);
    }
    const valor = await resposta.text();
    cache.set(url, { valor, expira: agora + ttlSegundos * 1000 });
    return valor;
}

export function limparCache() {
    cache.clear();
}

export async function carregarIndice(env) {
    const ttl = Number(env.CACHE_SEGUNDOS || 300);
    const url = new URL('assistente/indice.json', baseDoSite(env)).toString();
    const texto = await buscarTexto(url, ttl);
    const indice = JSON.parse(texto);
    if (!Array.isArray(indice?.sessoes)) throw new ErroCorpus('Índice do assistente em formato inesperado.');
    return indice;
}

export async function carregarSessoes(env, entradas) {
    const ttl = Number(env.CACHE_SEGUNDOS || 300);
    const base = baseDoSite(env);
    return Promise.all(entradas.map((e) => buscarTexto(new URL(e.arquivo, base).toString(), ttl)));
}

const ORGAOS = {
    primeira_turma: 'Primeira Turma',
    primeira_secao: 'Primeira Seção',
};

// Sessões que entram no escopo escolhido pelo usuário, da mais recente para a mais antiga
export function filtrarCandidatas(indice, escopo, materiaId) {
    let sessoes = indice.sessoes.slice();
    if (escopo.tipo === 'sessao') {
        sessoes = sessoes.filter((s) => s.id === escopo.sessaoId);
    } else {
        if (escopo.tipo === 'orgao') sessoes = sessoes.filter((s) => s.orgaoSlug === escopo.orgao);
        if (materiaId) sessoes = sessoes.filter((s) => (s.materiaIds || []).includes(materiaId));
    }
    return sessoes.sort((a, b) => String(b.isoDate).localeCompare(String(a.isoDate)));
}

export function descreverEscopo(escopo, candidatas, materia) {
    let texto;
    if (escopo.tipo === 'sessao') {
        texto = `Uma sessão: ${candidatas[0]?.titulo || escopo.sessaoId}.`;
    } else if (escopo.tipo === 'orgao') {
        texto = `Todas as sessões disponíveis da ${ORGAOS[escopo.orgao]} (${candidatas.length}).`;
    } else {
        texto = `Todas as sessões disponíveis da Primeira Turma e da Primeira Seção (${candidatas.length}).`;
    }
    if (materia) {
        texto += escopo.tipo === 'sessao'
            ? ` O usuário pediu foco na matéria "${materia}".`
            : ` Filtrado para sessões com processos da matéria "${materia}"; concentre a resposta nessa matéria.`;
    }
    return texto;
}

// Usa as sessões mais recentes até caber no orçamento
export function cortarPorOrcamento(entradas, tamanho, orcamento) {
    const escolhidas = [];
    let total = 0;
    for (const e of entradas) {
        const t = tamanho(e);
        if (escolhidas.length && total + t > orcamento) break;
        escolhidas.push(e);
        total += t;
    }
    return escolhidas;
}

export function textoIndice(entradas) {
    return entradas.map((e) => e.indice).join('\n\n');
}

export function montarMaterial({ descricao, indice = [], completas = [], textosCompletos = [] }) {
    const partes = ['<material>', `<escopo>${descricao}</escopo>`];
    if (indice.length) {
        partes.push(
            '<indice_de_sessoes>',
            'Visão resumida de cada sessão do escopo (processos, resultados, teses e pauta).',
            textoIndice(indice),
            '</indice_de_sessoes>',
        );
    }
    if (completas.length) {
        partes.push('<sessoes_na_integra>', ...textosCompletos, '</sessoes_na_integra>');
    }
    partes.push('</material>');
    return partes.join('\n');
}
