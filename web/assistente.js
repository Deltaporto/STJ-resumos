// Painel do Assistente de IA do Caderno de Sessões.
// Conversa com o proxy (worker/) configurado em assistente-config.js; a chave do Gemini nunca
// passa pelo navegador. O código de acesso da equipe fica salvo só neste navegador.

(() => {
    const config = window.ASSISTENTE_CONFIG || {};
    const apiUrl = String(config.apiUrl || '').replace(/\/+$/, '');
    const siteUrl = String(config.siteUrl || '');
    // Aberto com duplo clique no index.html (file://): o navegador manda origem "null" e o proxy recusa
    const arquivoLocal = window.location.protocol === 'file:';
    const CHAVE_CODIGO = 'stj_gmhb_assistente_codigo';
    const MAX_MENSAGENS_HISTORICO = 10;
    const MAX_CARACTERES_RESPOSTA_HISTORICO = 6000;

    // Registrado antes do app.js renderizar, para saber desde o início qual sessão está aberta
    let sessaoAtivaId = null;
    document.addEventListener('portal:sessao-ativa', (e) => {
        sessaoAtivaId = e.detail?.id || null;
        if (typeof window.__assistenteAtualizarEscopo === 'function') window.__assistenteAtualizarEscopo();
    });

    const armazenamento = {
        ler(chave) {
            try { return localStorage.getItem(chave) || ''; } catch { return ''; }
        },
        gravar(chave, valor) {
            try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: vale só nesta visita */ }
        },
        apagar(chave) {
            try { localStorage.removeItem(chave); } catch { /* idem */ }
        },
    };

    document.addEventListener('DOMContentLoaded', () => {
        const botaoAbrir = document.getElementById('assistantOpenBtn');
        const painel = document.getElementById('assistantPanel');
        if (!botaoAbrir || !painel || !apiUrl) return;

        const sessoes = Array.isArray(window.resumosData) ? window.resumosData : [];
        const materias = Array.isArray(window.materiasGabinete) ? window.materiasGabinete : [];
        const sessoesPorId = new Map(sessoes.map((s) => [s.id, s]));

        const appShell = document.querySelector('.app-shell');
        const botaoFechar = document.getElementById('assistantCloseBtn');
        const botaoNova = document.getElementById('assistantNewBtn');
        const abasEscopo = Array.from(painel.querySelectorAll('.assistant-scope-tab'));
        const seletorMateria = document.getElementById('assistantMateria');
        const dicaEscopo = document.getElementById('assistantScopeHint');
        const formEntrada = document.getElementById('assistantLogin');
        const campoCodigo = document.getElementById('assistantCodeInput');
        const erroEntrada = document.getElementById('assistantLoginError');
        const botaoEntrar = document.getElementById('assistantLoginBtn');
        const areaMensagens = document.getElementById('assistantMessages');
        const formPergunta = document.getElementById('assistantForm');
        const campoPergunta = document.getElementById('assistantInput');
        const botaoEnviar = document.getElementById('assistantSendBtn');
        const botaoParar = document.getElementById('assistantStopBtn');
        const botaoSair = document.getElementById('assistantLogoutBtn');
        const gavetaTranscricao = document.getElementById('transcriptDrawer');

        const estado = {
            codigo: armazenamento.ler(CHAVE_CODIGO),
            escopo: 'sessao', // 'sessao' | 'primeira_turma' | 'primeira_secao' | 'todas'
            materiaId: '',
            historico: [], // [{ papel: 'usuario' | 'assistente', texto }]
            controle: null,
        };

        botaoAbrir.hidden = false;
        for (const m of materias) {
            const opcao = document.createElement('option');
            opcao.value = String(m.id);
            opcao.textContent = m.short;
            seletorMateria.appendChild(opcao);
        }

        // ---------- Utilidades ----------
        const escapar = (texto) => String(texto ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const segundos = (hms) => hms.split(':').map(Number).reduce((total, n) => total * 60 + n, 0);

        const urlNoMinuto = (url, hms) => {
            if (!url) return '';
            const s = segundos(hms);
            const limpa = url.replace(/([?&])t=\d+s?(&|$)/, '$1').replace(/[?&]$/, '');
            return `${limpa}${limpa.includes('?') ? '&' : '?'}t=${s}s`;
        };

        const rotuloCurtoSessao = (s) => {
            const orgao = s.orgaoSlug === 'primeira_secao' ? '1ª Seção' : '1ª Turma';
            return `${orgao} ${String(s.date || '').slice(0, 5)}`;
        };

        const nomeOrgao = (slug) => (slug === 'primeira_secao' ? '1ª Seção' : '1ª Turma');

        // ---------- Markdown seguro (escapa tudo e só então aplica a formatação) ----------
        const renderizarCitacao = (conteudo, ctx) => {
            const itens = conteudo.split(/\s*[;,]\s*(?=\d{4}-\d{2}-\d{2}_)/);
            const links = [];
            for (const item of itens) {
                const m = item.trim().match(/^(\d{4}-\d{2}-\d{2}_[a-z_]+)\s*@\s*(\d{1,2}:\d{2}(?::\d{2})?)$/);
                if (!m) return null;
                const [, id, minutoBruto] = m;
                const minuto = minutoBruto.split(':').length === 2 ? `00:${minutoBruto}` : minutoBruto;
                const sessao = sessoesPorId.get(id);
                const video = sessao?.videoUrls?.[0] || '';
                const rotulo = ctx.variasSessoes && sessao ? `${rotuloCurtoSessao(sessao)} · ${minuto}` : minuto;
                if (!video) {
                    links.push(`<span class="assistant-cite assistant-cite--plain">${escapar(rotulo)}</span>`);
                    continue;
                }
                const titulo = `Abrir o vídeo${sessao ? ` da sessão ${sessao.title}` : ''} em ${minuto}`;
                links.push(`<a class="assistant-cite" href="${escapar(urlNoMinuto(video, minuto))}" target="_blank" rel="noopener noreferrer" title="${escapar(titulo)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>${escapar(rotulo)}</a>`);
            }
            return links.join(' ');
        };

        const formatarEmLinha = (texto, ctx) => {
            const reservas = [];
            const reservar = (html) => `\u0000${reservas.push(html) - 1}\u0000`;
            let t = escapar(texto);
            t = t.replace(/\[\[([^\]]+)\]\]/g, (todo, conteudo) => {
                const html = renderizarCitacao(conteudo, ctx);
                return html === null ? todo : reservar(html);
            });
            t = t.replace(/`([^`]+)`/g, (_, c) => reservar(`<code>${c}</code>`));
            t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, rotulo, url) => reservar(`<a href="${url}" target="_blank" rel="noopener noreferrer">${rotulo}</a>`));
            t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            t = t.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
            t = t.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
            return t.replace(/\u0000(\d+)\u0000/g, (_, i) => reservas[Number(i)]);
        };

        const celulas = (linha) => linha.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

        const renderizarMarkdown = (md, ctx) => {
            const linhas = String(md || '').replace(/\r\n/g, '\n').split('\n');
            const html = [];
            let paragrafo = [];
            let lista = null; // { tipo: 'ul' | 'ol', itens: [] }

            const fecharParagrafo = () => {
                if (paragrafo.length) html.push(`<p>${paragrafo.map((l) => formatarEmLinha(l, ctx)).join('<br>')}</p>`);
                paragrafo = [];
            };
            const fecharLista = () => {
                if (lista) html.push(`<${lista.tipo}>${lista.itens.map((i) => `<li>${formatarEmLinha(i, ctx)}</li>`).join('')}</${lista.tipo}>`);
                lista = null;
            };
            const fecharTudo = () => { fecharParagrafo(); fecharLista(); };

            for (let i = 0; i < linhas.length; i += 1) {
                const linha = linhas[i];
                const limpa = linha.trim();

                if (limpa.startsWith('```')) {
                    fecharTudo();
                    const codigo = [];
                    for (i += 1; i < linhas.length && !linhas[i].trim().startsWith('```'); i += 1) codigo.push(linhas[i]);
                    html.push(`<pre><code>${escapar(codigo.join('\n'))}</code></pre>`);
                    continue;
                }
                if (!limpa) { fecharTudo(); continue; }

                const titulo = limpa.match(/^(#{1,6})\s+(.*)$/);
                if (titulo) {
                    fecharTudo();
                    const nivel = titulo[1].length <= 2 ? 'h3' : 'h4';
                    html.push(`<${nivel}>${formatarEmLinha(titulo[2].replace(/#+$/, ''), ctx)}</${nivel}>`);
                    continue;
                }
                if (/^(-{3,}|\*{3,}|_{3,})$/.test(limpa)) { fecharTudo(); html.push('<hr>'); continue; }

                if (limpa.startsWith('|') && i + 1 < linhas.length && /^\|?\s*:?-{3,}/.test(linhas[i + 1].trim())) {
                    fecharTudo();
                    const cabecalho = celulas(limpa);
                    const corpo = [];
                    for (i += 2; i < linhas.length && linhas[i].trim().startsWith('|'); i += 1) corpo.push(celulas(linhas[i]));
                    i -= 1;
                    html.push(
                        '<div class="assistant-table-wrap"><table><thead><tr>'
                        + cabecalho.map((c) => `<th>${formatarEmLinha(c, ctx)}</th>`).join('')
                        + '</tr></thead><tbody>'
                        + corpo.map((l) => `<tr>${l.map((c) => `<td>${formatarEmLinha(c, ctx)}</td>`).join('')}</tr>`).join('')
                        + '</tbody></table></div>',
                    );
                    continue;
                }

                const citacao = limpa.match(/^>\s?(.*)$/);
                if (citacao) {
                    fecharTudo();
                    html.push(`<blockquote>${formatarEmLinha(citacao[1], ctx)}</blockquote>`);
                    continue;
                }

                const itemUl = linha.match(/^\s*[-*•]\s+(.*)$/);
                const itemOl = linha.match(/^\s*\d+[.)]\s+(.*)$/);
                if (itemUl || itemOl) {
                    fecharParagrafo();
                    const tipo = itemUl ? 'ul' : 'ol';
                    if (lista && lista.tipo !== tipo) fecharLista();
                    if (!lista) lista = { tipo, itens: [] };
                    lista.itens.push((itemUl || itemOl)[1]);
                    continue;
                }
                if (lista && /^\s{2,}\S/.test(linha)) {
                    lista.itens[lista.itens.length - 1] += ` ${limpa}`;
                    continue;
                }
                fecharLista();
                paragrafo.push(limpa);
            }
            fecharTudo();
            return html.join('');
        };

        // ---------- Escopo ----------
        const sessoesNoEscopo = () => {
            let lista = sessoes;
            if (estado.escopo === 'sessao') return lista.filter((s) => s.id === sessaoAtivaId);
            if (estado.escopo !== 'todas') lista = lista.filter((s) => s.orgaoSlug === estado.escopo);
            if (estado.materiaId) {
                lista = lista.filter((s) => (s.materias || []).some((m) => String(m.id) === estado.materiaId));
            }
            return lista;
        };

        const escopoParaApi = () => {
            if (estado.escopo === 'sessao') return { tipo: 'sessao', sessaoId: sessaoAtivaId };
            if (estado.escopo === 'todas') return { tipo: 'todas' };
            return { tipo: 'orgao', orgao: estado.escopo };
        };

        const atualizarEscopo = () => {
            const abaSessao = abasEscopo.find((a) => a.dataset.escopo === 'sessao');
            abaSessao.disabled = !sessaoAtivaId;
            if (!sessaoAtivaId && estado.escopo === 'sessao') estado.escopo = 'todas';
            abasEscopo.forEach((aba) => aba.setAttribute('aria-checked', String(aba.dataset.escopo === estado.escopo)));

            const materia = materias.find((m) => String(m.id) === estado.materiaId);
            const lista = sessoesNoEscopo();
            // "Pesquisando em: ..." resume o que o assistente vai ler, no mesmo formato em todos os escopos
            let alvo = null;
            let aviso = null;
            if (estado.escopo === 'sessao') {
                const s = sessoesPorId.get(sessaoAtivaId);
                if (s) {
                    alvo = `${nomeOrgao(s.orgaoSlug)}, ${s.date} · resumo, pauta e transcrição`;
                    if (materia) alvo += ` · foco em ${materia.short}`;
                } else {
                    aviso = 'Abra uma sessão para perguntar sobre ela.';
                }
            } else if (!lista.length) {
                aviso = materia
                    ? `Nenhuma sessão${estado.escopo === 'todas' ? '' : ` da ${nomeOrgao(estado.escopo)}`} com processos de ${materia.short}.`
                    : 'Não há sessões para esta opção.';
            } else {
                const datas = lista.map((s) => s.date).sort((a, b) => a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join('')));
                const [primeira, ultima] = [datas[0], datas.at(-1)];
                const periodo = primeira === ultima
                    ? ultima
                    : `${primeira.slice(-4) === ultima.slice(-4) ? primeira.slice(0, 5) : primeira} a ${ultima}`;
                const quantas = `${lista.length} ${lista.length === 1 ? 'sessão' : 'sessões'}`;
                let onde = '';
                if (estado.escopo !== 'todas') onde = ` da ${nomeOrgao(estado.escopo)}`;
                else if (!materia) onde = ' da 1ª Turma e da 1ª Seção';
                alvo = `${quantas}${onde}${materia ? ` com processos de ${materia.short}` : ''} · ${periodo}`;
            }
            dicaEscopo.innerHTML = alvo
                ? `<strong>Pesquisando em:</strong> ${escapar(alvo)}`
                : escapar(aviso);
            if (!estado.historico.length && !estado.controle) renderizarBoasVindas();
        };
        window.__assistenteAtualizarEscopo = atualizarEscopo;

        abasEscopo.forEach((aba) => {
            aba.addEventListener('click', () => {
                if (aba.disabled) return;
                estado.escopo = aba.dataset.escopo;
                atualizarEscopo();
            });
            aba.addEventListener('keydown', (e) => {
                if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
                e.preventDefault();
                const ativas = abasEscopo.filter((a) => !a.disabled);
                const atual = ativas.indexOf(aba);
                const proxima = ativas[(atual + (e.key === 'ArrowRight' ? 1 : -1) + ativas.length) % ativas.length];
                proxima.focus();
                proxima.click();
            });
        });

        seletorMateria.addEventListener('change', () => {
            estado.materiaId = seletorMateria.value;
            atualizarEscopo();
        });

        // ---------- Mensagens ----------
        const SUGESTOES = {
            sessao: [
                'Quais foram as manifestações do Min. Herman Benjamin nesta sessão?',
                'Resuma os resultados e as teses fixadas.',
                'Houve divergência ou pedido de vista? Quem e por quê?',
            ],
            varias: [
                'Em quais processos o Min. Herman Benjamin foi relator e qual foi o resultado?',
                'Quais teses de Direito Tributário foram fixadas?',
                'Liste os pedidos de vista e quem os formulou.',
            ],
        };

        const rolarParaFim = () => {
            areaMensagens.scrollTop = areaMensagens.scrollHeight;
        };

        const renderizarBoasVindas = () => {
            if (arquivoLocal) {
                areaMensagens.innerHTML = `
                    <div class="assistant-welcome">
                        <p class="assistant-welcome-text"><strong>O assistente não funciona com o portal aberto como arquivo</strong> (endereço começando com <code>file:///</code>). Por segurança, o servidor do assistente só atende o site publicado.</p>
                        ${siteUrl ? `<p class="assistant-welcome-text"><a href="${escapar(siteUrl)}" target="_blank" rel="noopener noreferrer">Abrir o portal publicado</a> e usar o assistente por lá.</p>` : ''}
                    </div>`;
                return;
            }
            const sugestoes = estado.escopo === 'sessao' ? SUGESTOES.sessao : SUGESTOES.varias;
            areaMensagens.innerHTML = `
                <div class="assistant-welcome">
                    <p class="assistant-welcome-text">As respostas citam os processos e trazem links para o minuto do vídeo.</p>
                    <div class="assistant-suggestions">
                        ${sugestoes.map((s) => `<button type="button" class="assistant-suggestion">${escapar(s)}</button>`).join('')}
                    </div>
                </div>`;
            areaMensagens.querySelectorAll('.assistant-suggestion').forEach((b) => {
                b.addEventListener('click', () => {
                    campoPergunta.value = b.textContent;
                    enviarPergunta();
                });
            });
        };

        const adicionarMensagemUsuario = (texto) => {
            areaMensagens.querySelector('.assistant-welcome')?.remove();
            const div = document.createElement('div');
            div.className = 'assistant-msg assistant-msg--user';
            div.innerHTML = escapar(texto).replace(/\n/g, '<br>');
            areaMensagens.appendChild(div);
        };

        const criarMensagemAssistente = () => {
            const div = document.createElement('article');
            div.className = 'assistant-msg assistant-msg--bot';
            div.innerHTML = `
                <div class="assistant-status" role="status"><span class="assistant-dot" aria-hidden="true"></span><span class="assistant-status-text">Pensando…</span></div>
                <div class="assistant-answer"></div>
                <div class="assistant-meta" hidden></div>`;
            areaMensagens.appendChild(div);
            return {
                raiz: div,
                status: div.querySelector('.assistant-status'),
                statusTexto: div.querySelector('.assistant-status-text'),
                resposta: div.querySelector('.assistant-answer'),
                meta: div.querySelector('.assistant-meta'),
            };
        };

        const renderizarFontes = (fontes) => {
            if (!fontes || fontes.modo === 'vazio') return '';
            const chip = (f) => `<button type="button" class="assistant-source" data-sessao="${escapar(f.id)}" title="Abrir esta sessão no portal">${escapar(f.titulo)}</button>`;
            let html = '';
            if (fontes.integrais.length) {
                html += `<div class="assistant-sources"><span class="assistant-sources-label">${fontes.integrais.length === 1 ? 'Lida' : 'Lidas'} por inteiro:</span>${fontes.integrais.map(chip).join('')}</div>`;
            }
            if (fontes.modo === 'selecao') {
                const resto = fontes.indice.length - fontes.integrais.length;
                if (resto > 0) {
                    const quantas = `${fontes.integrais.length ? 'mais ' : ''}${resto} ${resto === 1 ? 'sessão' : 'sessões'}`;
                    html += `<div class="assistant-sources"><span class="assistant-sources-label">${resto === 1 ? 'Consultada' : 'Consultadas'} só pelo resumo:</span><span class="assistant-sources-more">${quantas}</span></div>`;
                }
            }
            return html;
        };

        // ---------- Rede ----------
        const sair = (mensagem) => {
            estado.codigo = '';
            armazenamento.apagar(CHAVE_CODIGO);
            mostrarEntrada(mensagem);
        };

        const lerFluxoSSE = async function* (resposta) {
            const leitor = resposta.body.getReader();
            const decodificador = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await leitor.read();
                if (value) buffer += decodificador.decode(value, { stream: true });
                let fim;
                while ((fim = buffer.indexOf('\n\n')) !== -1) {
                    const bloco = buffer.slice(0, fim);
                    buffer = buffer.slice(fim + 2);
                    const evento = bloco.match(/^event: (.+)$/m)?.[1] || 'message';
                    const dados = bloco.match(/^data: (.*)$/m)?.[1];
                    if (dados) yield { evento, dados: JSON.parse(dados) };
                }
                if (done) break;
            }
        };

        const definirEnviando = (enviando) => {
            botaoEnviar.hidden = enviando;
            botaoParar.hidden = !enviando;
            campoPergunta.disabled = false;
        };

        const enviarPergunta = async () => {
            const pergunta = campoPergunta.value.trim();
            if (!pergunta || estado.controle) return;
            if (estado.escopo === 'sessao' && !sessaoAtivaId) return;

            adicionarMensagemUsuario(pergunta);
            campoPergunta.value = '';
            ajustarAltura();
            const msg = criarMensagemAssistente();

            rolarParaFim();

            const controle = new AbortController();
            estado.controle = controle;
            definirEnviando(true);

            const historico = estado.historico.slice(-MAX_MENSAGENS_HISTORICO).map((m) => ({
                papel: m.papel,
                texto: m.papel === 'assistente' ? m.texto.slice(0, MAX_CARACTERES_RESPOSTA_HISTORICO) : m.texto,
            }));

            let texto = '';
            let fontes = null;
            let aviso = null;
            let erro = null;
            let agendado = false;
            const ctx = { variasSessoes: estado.escopo !== 'sessao' };
            const desenhar = () => {
                agendado = false;
                const pertoDoFim = areaMensagens.scrollHeight - areaMensagens.scrollTop - areaMensagens.clientHeight < 80;
                msg.resposta.innerHTML = renderizarMarkdown(texto, ctx);
                if (pertoDoFim) rolarParaFim();
            };

            try {
                const resposta = await fetch(`${apiUrl}/api/perguntar`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        ...(estado.codigo ? { authorization: `Bearer ${estado.codigo}` } : {}),
                    },
                    body: JSON.stringify({
                        pergunta,
                        escopo: escopoParaApi(),
                        materiaId: estado.materiaId ? Number(estado.materiaId) : undefined,
                        historico,
                    }),
                    signal: controle.signal,
                });

                if (!resposta.ok) {
                    const corpo = await resposta.json().catch(() => ({}));
                    if (resposta.status === 401) {
                        // O proxy passou a exigir código (ou o código salvo mudou)
                        sair(estado.codigo ? 'Seu código não é mais válido. Digite o código atual.' : '');
                        msg.raiz.remove();
                        areaMensagens.lastElementChild?.remove();
                        campoPergunta.value = pergunta;
                        return;
                    }
                    throw new Error(corpo.erro || `O assistente não respondeu (erro ${resposta.status}). Tente de novo.`);
                }

                for await (const { evento, dados } of lerFluxoSSE(resposta)) {
                    if (evento === 'estado') {
                        msg.statusTexto.textContent = dados.texto;
                    } else if (evento === 'fontes') {
                        fontes = dados;
                    } else if (evento === 'texto') {
                        if (!texto) msg.status.hidden = true;
                        texto += dados.t;
                        if (!agendado) {
                            agendado = true;
                            requestAnimationFrame(desenhar);
                        }
                    } else if (evento === 'fim') {
                        aviso = dados.aviso;
                    } else if (evento === 'erro') {
                        erro = dados.mensagem;
                    }
                }
            } catch (falha) {
                if (falha.name === 'AbortError') {
                    aviso = 'Resposta interrompida.';
                } else {
                    erro = falha.message && !/fetch|network/i.test(falha.message)
                        ? falha.message
                        : 'Não foi possível falar com o assistente. Verifique a conexão e tente de novo.';
                }
            } finally {
                estado.controle = null;
                definirEnviando(false);
            }

            msg.status.hidden = true;
            desenhar();
            if (erro) {
                msg.resposta.insertAdjacentHTML('beforeend', `<p class="assistant-error" role="alert">${escapar(erro)}</p>`);
            }
            if (aviso) {
                msg.resposta.insertAdjacentHTML('beforeend', `<p class="assistant-warning">${escapar(aviso)}</p>`);
            }
            if (texto.trim() && !erro) {
                estado.historico.push({ papel: 'usuario', texto: pergunta }, { papel: 'assistente', texto });
                msg.meta.hidden = false;
                msg.meta.innerHTML = `${renderizarFontes(fontes)}<div class="assistant-tools"><button type="button" class="btn-subtle assistant-copy">Copiar resposta</button></div>`;
                msg.meta.querySelectorAll('.assistant-source').forEach((b) => {
                    b.addEventListener('click', () => {
                        document.dispatchEvent(new CustomEvent('assistente:abrir-sessao', { detail: { id: b.dataset.sessao } }));
                    });
                });
                const botaoCopiar = msg.meta.querySelector('.assistant-copy');
                botaoCopiar.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(texto.replace(/\[\[([^\]@]+)@([^\]]+)\]\]/g, '[$2]'));
                        botaoCopiar.textContent = 'Copiado';
                    } catch {
                        botaoCopiar.textContent = 'Não foi possível copiar';
                    }
                    setTimeout(() => { botaoCopiar.textContent = 'Copiar resposta'; }, 1800);
                });
            }
            rolarParaFim();
            campoPergunta.focus();
        };

        // ---------- Entrada com código ----------
        const mostrarEntrada = (mensagem = '') => {
            formEntrada.hidden = false;
            areaMensagens.hidden = true;
            formPergunta.hidden = true;
            botaoSair.hidden = true;
            botaoNova.hidden = true;
            erroEntrada.hidden = !mensagem;
            erroEntrada.textContent = mensagem;
            campoCodigo.value = '';
            setTimeout(() => campoCodigo.focus(), 50);
        };

        const mostrarConversa = () => {
            formEntrada.hidden = true;
            areaMensagens.hidden = false;
            formPergunta.hidden = false;
            botaoSair.hidden = !estado.codigo;
            botaoNova.hidden = false;
            if (!estado.historico.length && !areaMensagens.children.length) renderizarBoasVindas();
            // Veio do balão de apresentação: deixa o exemplo pronto para enviar
            if (exemploPendente && !campoPergunta.value) {
                campoPergunta.value = exemploPendente;
                ajustarAltura();
            }
            exemploPendente = '';
        };

        formEntrada.addEventListener('submit', async (e) => {
            e.preventDefault();
            const codigo = campoCodigo.value.trim();
            if (!codigo) return;
            botaoEntrar.disabled = true;
            erroEntrada.hidden = true;
            try {
                const resposta = await fetch(`${apiUrl}/api/verificar`, {
                    method: 'POST',
                    headers: { authorization: `Bearer ${codigo}` },
                });
                const corpo = await resposta.json().catch(() => ({}));
                if (!resposta.ok) throw new Error(corpo.erro || 'Não foi possível validar o código.');
                estado.codigo = codigo;
                armazenamento.gravar(CHAVE_CODIGO, codigo);
                mostrarConversa();
                campoPergunta.focus();
            } catch (falha) {
                erroEntrada.textContent = /fetch|network/i.test(falha.message)
                    ? 'Não foi possível falar com o assistente. Verifique a conexão.'
                    : falha.message;
                erroEntrada.hidden = false;
            } finally {
                botaoEntrar.disabled = false;
            }
        });

        botaoSair.addEventListener('click', () => sair());

        // ---------- Abrir e fechar ----------
        const abrir = () => {
            painel.hidden = false;
            void painel.offsetWidth;
            painel.classList.add('is-open');
            appShell?.classList.add('assistant-open');
            botaoAbrir.setAttribute('aria-expanded', 'true');
            marcarComoConhecido();
            atualizarEscopo();
            if (arquivoLocal) {
                formEntrada.hidden = true;
                formPergunta.hidden = true;
                botaoNova.hidden = true;
                botaoSair.hidden = true;
                areaMensagens.hidden = false;
                renderizarBoasVindas();
            } else {
                // Sem código salvo, vai direto à conversa; a tela de código só aparece se o proxy pedir
                mostrarConversa();
                campoPergunta.focus();
            }
        };

        const fechar = () => {
            painel.classList.remove('is-open');
            appShell?.classList.remove('assistant-open');
            botaoAbrir.setAttribute('aria-expanded', 'false');
            setTimeout(() => {
                if (!painel.classList.contains('is-open')) painel.hidden = true;
            }, 260);
            botaoAbrir.focus();
        };

        botaoAbrir.addEventListener('click', () => (painel.classList.contains('is-open') ? fechar() : abrir()));
        botaoFechar.addEventListener('click', fechar);
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !painel.classList.contains('is-open')) return;
            if (gavetaTranscricao && !gavetaTranscricao.hidden) return;
            fechar();
        });

        botaoNova.addEventListener('click', () => {
            estado.controle?.abort();
            estado.historico = [];
            areaMensagens.innerHTML = '';
            renderizarBoasVindas();
            campoPergunta.focus();
        });

        botaoParar.addEventListener('click', () => estado.controle?.abort());

        // ---------- Caixa de pergunta ----------
        const ajustarAltura = () => {
            campoPergunta.style.height = 'auto';
            campoPergunta.style.height = `${Math.min(campoPergunta.scrollHeight, 180)}px`;
        };
        campoPergunta.addEventListener('input', ajustarAltura);
        campoPergunta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                enviarPergunta();
            }
        });
        formPergunta.addEventListener('submit', (e) => {
            e.preventDefault();
            enviarPergunta();
        });

        // ---------- Primeira visita: selo "Novo" e balão de apresentação ----------
        const CHAVE_ABERTO = 'stj_gmhb_assistente_ja_aberto';
        const CHAVE_APRESENTADO = 'stj_gmhb_assistente_apresentado';
        const EXEMPLO = 'O que o Min. Herman Benjamin disse sobre áreas de preservação permanente?';
        const seloNovo = document.getElementById('assistantNewBadge');
        const balao = document.getElementById('assistantIntro');
        const botaoExperimentar = document.getElementById('assistantIntroTry');
        const botaoAgoraNao = document.getElementById('assistantIntroDismiss');
        let exemploPendente = '';

        const posicionarBalao = () => {
            if (balao.hidden) return;
            const r = botaoAbrir.getBoundingClientRect();
            if (!r.width) return;
            const largura = balao.offsetWidth;
            const esquerda = Math.min(Math.max(16, r.left), window.innerWidth - largura - 16);
            balao.style.left = `${esquerda}px`;
            balao.style.top = `${r.bottom + 12}px`;
            balao.style.setProperty('--seta-x', `${Math.round(r.left + r.width / 2 - esquerda)}px`);
        };

        const fecharBalao = () => {
            if (balao.hidden) return;
            balao.hidden = true;
            armazenamento.gravar(CHAVE_APRESENTADO, 'sim');
        };

        // Ao abrir o painel pela primeira vez, o selo e o balão deixam de aparecer
        function marcarComoConhecido() {
            seloNovo.hidden = true;
            armazenamento.gravar(CHAVE_ABERTO, 'sim');
            fecharBalao();
        }

        seloNovo.hidden = Boolean(armazenamento.ler(CHAVE_ABERTO));
        if (!armazenamento.ler(CHAVE_APRESENTADO) && !armazenamento.ler(CHAVE_ABERTO)) {
            setTimeout(() => {
                if (painel.classList.contains('is-open')) return;
                balao.hidden = false;
                posicionarBalao();
            }, 700);
        }
        window.addEventListener('resize', posicionarBalao);
        document.getElementById('topbarActions')?.addEventListener('scroll', posicionarBalao, { passive: true });

        botaoAgoraNao.addEventListener('click', () => {
            fecharBalao();
            botaoAbrir.focus();
        });
        botaoExperimentar.addEventListener('click', () => {
            exemploPendente = EXEMPLO;
            abrir();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !balao.hidden) fecharBalao();
        });

        atualizarEscopo();
    });
})();
