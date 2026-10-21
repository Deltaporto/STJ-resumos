// Códigos de acesso da equipe. O segredo CODIGOS_ACESSO tem o formato
// "nome:codigo,nome2:codigo2" (o nome aparece nos logs e permite revogar um código
// sem afetar os demais). Um código sem nome é aceito e recebe o nome "equipe".

const TAMANHO_MINIMO_CODIGO = 6;

export function lerCodigos(texto) {
    const codigos = [];
    for (const bruto of String(texto || '').split(',')) {
        const item = bruto.trim();
        if (!item) continue;
        const sep = item.indexOf(':');
        const nome = sep > 0 ? item.slice(0, sep).trim() : 'equipe';
        const codigo = sep > 0 ? item.slice(sep + 1).trim() : item;
        if (codigo.length < TAMANHO_MINIMO_CODIGO) {
            console.warn(`Código de acesso de "${nome}" ignorado: menos de ${TAMANHO_MINIMO_CODIGO} caracteres.`);
            continue;
        }
        codigos.push({ nome, codigo });
    }
    return codigos;
}

async function resumo(texto) {
    const bytes = new TextEncoder().encode(texto);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

// Comparação em tempo constante (sobre os hashes, que têm sempre o mesmo tamanho)
async function iguais(a, b) {
    const [ha, hb] = await Promise.all([resumo(a), resumo(b)]);
    let diferenca = 0;
    for (let i = 0; i < ha.length; i += 1) diferenca |= ha[i] ^ hb[i];
    return diferenca === 0;
}

export function codigoDaRequisicao(request) {
    const cabecalho = request.headers.get('authorization') || '';
    const m = cabecalho.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : '';
}

// Devolve o nome associado ao código válido, ou null.
export async function autenticar(request, env) {
    const recebido = codigoDaRequisicao(request);
    if (!recebido || recebido.length > 200) return null;
    let encontrado = null;
    // Percorre todos os códigos, sem sair cedo, para não vazar informação pelo tempo
    for (const { nome, codigo } of lerCodigos(env.CODIGOS_ACESSO)) {
        if (await iguais(recebido, codigo) && !encontrado) encontrado = nome;
    }
    return encontrado;
}
