document.addEventListener('DOMContentLoaded', () => {
    const rawSessions = Array.isArray(window.resumosData) ? window.resumosData : [];
    const catalogoMaterias = Array.isArray(window.materiasGabinete) ? window.materiasGabinete : [
        { id: 1, code: '1. Improbidade Administrativa', short: 'Improbidade Administrativa' },
        { id: 2, code: '2. Desapropriação / Intervenção do Estado', short: 'Desapropriação / Intervenção do Estado' },
        { id: 3, code: '3. Reforma Agrária', short: 'Reforma Agrária' },
        { id: 4, code: '4. Servidor Público Civil e Militar', short: 'Servidor Público Civil e Militar' },
        { id: 5, code: '5. Atos Administrativos', short: 'Atos Administrativos' },
        { id: 6, code: '6. Licitações e Contratos', short: 'Licitações e Contratos' },
        { id: 7, code: '7. Responsabilidade Civil da Administração', short: 'Responsabilidade Civil da Administração' },
        { id: 8, code: '8. Direito Tributário', short: 'Direito Tributário' },
        { id: 9, code: '9. Poder de Polícia (Exceto Ambiental)', short: 'Poder de Polícia (Exceto Ambiental)' },
        { id: 10, code: '10. Ação Civil Pública', short: 'Ação Civil Pública' },
        { id: 11, code: '11. Direito Previdenciário', short: 'Direito Previdenciário' },
        { id: 12, code: '12. Direito Ambiental Urbanístico', short: 'Direito Ambiental Urbanístico' },
        { id: 13, code: '13. Direito dos Povos Indígenas', short: 'Direito dos Povos Indígenas' },
        { id: 14, code: '14. Saúde Pública', short: 'Saúde Pública' },
        { id: 15, code: '15. Direito do Consumidor', short: 'Direito do Consumidor' }
    ];

    // Elementos de DOM
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sessionsList = document.getElementById('sessionsList');
    const searchInput = document.getElementById('searchInput');
    const resultsInfo = document.getElementById('resultsInfo');
    const resetAllFiltersBtn = document.getElementById('resetAllFiltersBtn');
    const orgaoTabs = Array.from(document.querySelectorAll('.orgao-tab'));

    const topbarSessionMeta = document.getElementById('topbarSessionMeta');
    const videoActionsGroup = document.getElementById('videoActionsGroup');
    const readTranscriptBtn = document.getElementById('readTranscriptBtn');
    const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
    const copySummaryBtn = document.getElementById('copySummaryBtn');
    const copySummaryLabel = document.getElementById('copySummaryLabel');
    const printBtn = document.getElementById('printBtn');

    const materiaSelect = document.getElementById('materiaSelect');
    const relatorSelect = document.getElementById('relatorSelect');
    const toggleHermanBtn = document.getElementById('toggleHermanBtn');
    const toggleRelevantBtn = document.getElementById('toggleRelevantBtn');
    const toggleThesisBtn = document.getElementById('toggleThesisBtn');
    const toggleAllDetailsBtn = document.getElementById('toggleAllDetailsBtn');
    const sessionMateriaChips = document.getElementById('sessionMateriaChips');
    const documentViewer = document.getElementById('documentViewer');
    const backToTopBtn = document.getElementById('backToTopBtn');

    const themeToggle = document.getElementById('themeToggle');
    const themeLabel = document.getElementById('themeLabel');

    const transcriptDrawerBackdrop = document.getElementById('transcriptDrawerBackdrop');
    const transcriptDrawer = document.getElementById('transcriptDrawer');
    const transcriptDrawerTitle = document.getElementById('transcriptDrawerTitle');
    const transcriptDrawerBody = document.getElementById('transcriptDrawerBody');
    const transcriptSearchInput = document.getElementById('transcriptSearchInput');
    const drawerDownloadBtn = document.getElementById('drawerDownloadBtn');
    const closeTranscriptDrawerBtn = document.getElementById('closeTranscriptDrawerBtn');
    const transcriptFontDec = document.getElementById('transcriptFontDec');
    const transcriptFontInc = document.getElementById('transcriptFontInc');
    const transcriptModeDialogue = document.getElementById('transcriptModeDialogue');
    const transcriptModeContinuous = document.getElementById('transcriptModeContinuous');
    const fullscreenTranscriptBtn = document.getElementById('fullscreenTranscriptBtn');
    const transcriptMatchCount = document.getElementById('transcriptMatchCount');
    const speakerPills = Array.from(document.querySelectorAll('.speaker-pill'));

    // Estado da Aplicação
    const state = {
        activeSessionId: rawSessions[0]?.id || null,
        searchQuery: '',
        orgaoFilter: 'todos',
        materiaIdFilter: '',
        relatorFilter: '', // Nome exato ou '__CONVOCADOS__'
        onlyHerman: false,
        onlyRelevant: false,
        onlyWithThesis: false,
        detailsCollapsed: false,
        hermanSpotlightCollapsed: false,
        highlightsSpotlightCollapsed: false,
        transcriptViewMode: 'dialogue', // 'dialogue' | 'continuous'
        transcriptSpeakerFilter: 'todos', // 'todos' | 'herman' | 'presidente' | 'relator'
        transcriptFontSize: 15,
        transcriptIsFullscreen: false
    };

    // Utilitários de Texto
    const escapeHtml = (str) => String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const normalizeText = (str) => String(str ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const highlightMatches = (text, query) => {
        const clean = escapeHtml(text ?? '');
        if (!query || query.trim().length < 2) {
            return clean;
        }
        const safeQ = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQ})`, 'gi');
        return clean.replace(regex, '<mark>$1</mark>');
    };

    const hasActiveProcessFilters = () => Boolean(
        state.searchQuery.trim()
        || state.orgaoFilter !== 'todos'
        || state.materiaIdFilter
        || state.relatorFilter
        || state.onlyHerman
        || state.onlyRelevant
        || state.onlyWithThesis
    );

    // Verifica se um processo atende aos filtros ativos
    const processMatchesFilters = (proc) => {
        if (state.materiaIdFilter && String(proc.materia?.id) !== String(state.materiaIdFilter)) {
            return false;
        }

        if (state.relatorFilter) {
            const relList = Array.isArray(proc.relatores) ? proc.relatores : [];
            if (state.relatorFilter === '__CONVOCADOS__') {
                const hasConvocado = relList.some((r) => r.role === 'convocado_substituto');
                if (!hasConvocado) return false;
            } else {
                const matchesRel = relList.some((r) => r.name === state.relatorFilter)
                    || proc.relator === state.relatorFilter;
                if (!matchesRel) return false;
            }
        }

        if (state.onlyHerman && !proc.hasHerman) {
            return false;
        }

        if (state.onlyRelevant && !proc.isRelevant) {
            return false;
        }

        if (state.onlyWithThesis && !proc.tese) {
            return false;
        }

        if (state.searchQuery.trim()) {
            const q = normalizeText(state.searchQuery);
            const haystack = normalizeText([
                proc.heading,
                proc.processNumber,
                proc.theme,
                proc.materia?.code,
                proc.relator,
                proc.resultado,
                proc.hermanManifestation,
                proc.tese,
                proc.resumoDiscussao
            ].join(' '));
            if (!haystack.includes(q)) {
                return false;
            }
        }

        return true;
    };

    // Verifica se uma sessão atende aos filtros e quantos processos dela batem
    const evaluateSessionMatch = (session) => {
        if (state.orgaoFilter !== 'todos' && session.orgaoSlug !== state.orgaoFilter) {
            return { matches: false, matchingProcesses: [] };
        }

        const procs = Array.isArray(session.processes) ? session.processes : [];
        const matchingProcesses = procs.filter(processMatchesFilters);

        // Se nenhum filtro de processo estiver ativo, a sessão bate mesmo que tenha 0 processos
        const anyProcessFilter = Boolean(
            state.searchQuery.trim()
            || state.materiaIdFilter
            || state.relatorFilter
            || state.onlyHerman
            || state.onlyRelevant
            || state.onlyWithThesis
        );

        if (!anyProcessFilter) {
            return { matches: true, matchingProcesses: procs };
        }

        // Também aceita se o termo de busca bater no título/data/órgão da sessão
        if (state.searchQuery.trim() && matchingProcesses.length === 0) {
            const q = normalizeText(state.searchQuery);
            const sessionHeaderHaystack = normalizeText(`${session.title} ${session.date} ${session.orgao}`);
            if (sessionHeaderHaystack.includes(q)) {
                return { matches: true, matchingProcesses: procs };
            }
        }

        return {
            matches: matchingProcesses.length > 0,
            matchingProcesses
        };
    };

    // Popula Seletores de Matéria (15 matérias) e Relatores (Titulares + Convocados/Substitutos)
    const populateFilterSelects = () => {
        // 1. Matérias do Gabinete
        const contagemGlobalMaterias = {};
        rawSessions.forEach((s) => {
            (s.processes || []).forEach((p) => {
                const mId = p.materia?.id;
                if (mId) {
                    contagemGlobalMaterias[mId] = (contagemGlobalMaterias[mId] || 0) + 1;
                }
            });
        });

        materiaSelect.innerHTML = '<option value="">Todas as 15 matérias do Gabinete</option>';
        catalogoMaterias.forEach((mat) => {
            const count = contagemGlobalMaterias[mat.id] || 0;
            const opt = document.createElement('option');
            opt.value = String(mat.id);
            opt.textContent = count > 0 ? `${mat.code} (${count})` : mat.code;
            materiaSelect.appendChild(opt);
        });

        // 2. Relatores (separados em Titulares e Convocados/Substitutos)
        const titularesSet = new Set();
        const convocadosSet = new Set();

        rawSessions.forEach((s) => {
            (s.relatores || []).forEach((r) => {
                if (!r || !r.name) return;
                if (r.role === 'convocado_substituto') {
                    convocadosSet.add(r.name);
                } else {
                    titularesSet.add(r.name);
                }
            });
        });

        relatorSelect.innerHTML = '<option value="">Todos os julgadores</option>';

        const titulares = Array.from(titularesSet).sort((a, b) => {
            if (a.includes('Herman Benjamin')) return -1;
            if (b.includes('Herman Benjamin')) return 1;
            return a.localeCompare(b, 'pt-BR');
        });

        if (titulares.length > 0) {
            const groupTitulares = document.createElement('optgroup');
            groupTitulares.label = 'Ministros Titulares (1ª Turma e 1ª Seção)';
            titulares.forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                groupTitulares.appendChild(opt);
            });
            relatorSelect.appendChild(groupTitulares);
        }

        const convocados = Array.from(convocadosSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const groupConvocados = document.createElement('optgroup');
        groupConvocados.label = 'Desembargadores Convocados / Substitutos';

        const optAllConvocados = document.createElement('option');
        optAllConvocados.value = '__CONVOCADOS__';
        optAllConvocados.textContent = 'Todos os Convocados / Substitutos';
        groupConvocados.appendChild(optAllConvocados);

        convocados.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            groupConvocados.appendChild(opt);
        });
        relatorSelect.appendChild(groupConvocados);
    };

    // Configurar download de transcrição formatada em Word (.docx)
    const configureTranscriptDownload = (anchorEl, session) => {
        if (!anchorEl) return;
        const hasTranscript = Boolean(session?.transcriptDocxUrl || session?.transcriptUrl || session?.transcriptMarkdown);
        anchorEl.hidden = !hasTranscript;
        if (!hasTranscript) return;

        const docxFileName = `${session.id}_transcricao_revisada.docx`;
        anchorEl.setAttribute('download', docxFileName);
        anchorEl.href = session.transcriptDocxUrl || session.transcriptUrl || `transcricoes/${docxFileName}`;
    };

    // Controle de Menu Mobile com Backdrop
    const openMobileMenu = () => {
        if (!sidebar) return;
        if (sidebarBackdrop) {
            sidebarBackdrop.hidden = false;
            void sidebarBackdrop.offsetWidth;
            sidebarBackdrop.classList.add('is-open');
        }
        sidebar.classList.add('open');
        mobileMenuBtn?.setAttribute('aria-expanded', 'true');
    };

    const closeMobileMenu = () => {
        if (!sidebar) return;
        sidebar.classList.remove('open');
        if (sidebarBackdrop) {
            sidebarBackdrop.classList.remove('is-open');
            setTimeout(() => {
                if (!sidebar.classList.contains('open')) {
                    sidebarBackdrop.hidden = true;
                }
            }, 220);
        }
        mobileMenuBtn?.setAttribute('aria-expanded', 'false');
    };

    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    // "14/10/2026" -> "Sessão de 14 de outubro de 2026"
    const formatSessionHeading = (session) => {
        const m = String(session.date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m || !MESES[Number(m[2]) - 1]) return session.title;
        return `Sessão de ${Number(m[1])} de ${MESES[Number(m[2]) - 1]} de ${m[3]}`;
    };

    // Renderizar Barra Lateral de Sessões
    const renderSidebar = () => {
        sessionsList.innerHTML = '';
        resetAllFiltersBtn.hidden = !hasActiveProcessFilters();

        const evaluated = rawSessions
            .map((session) => ({
                session,
                ...evaluateSessionMatch(session)
            }))
            .filter((item) => item.matches);

        resultsInfo.textContent = `${evaluated.length} ${evaluated.length === 1 ? 'sessão listada' : 'sessões listadas'}`;

        if (evaluated.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state-box';
            empty.textContent = 'Nenhuma sessão encontrada para os critérios selecionados.';
            sessionsList.appendChild(empty);
            return;
        }

        // Se a sessão ativa não estiver entre as filtradas, seleciona a primeira
        if (!evaluated.some((e) => e.session.id === state.activeSessionId)) {
            state.activeSessionId = evaluated[0].session.id;
        }

        evaluated.forEach(({ session, matchingProcesses }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `session-nav-item ${session.id === state.activeSessionId ? 'active' : ''}`;

            const totalProcs = session.stats?.total ?? (session.processes?.length || 0);
            const hermanCount = session.stats?.hermanCount ?? 0;
            const procLabel = matchingProcesses.length !== totalProcs
                ? `${matchingProcesses.length} de ${totalProcs} julgados`
                : `${totalProcs} ${totalProcs === 1 ? 'julgado' : 'julgados'}`;

            btn.innerHTML = `
                <div class="session-nav-top">
                    <span class="session-nav-date">${escapeHtml(session.date)}</span>
                    <span class="session-nav-orgao">${escapeHtml(session.orgao)}</span>
                </div>
                <div class="session-nav-meta">
                    <span>${escapeHtml(procLabel)}</span>
                    ${hermanCount > 0 ? `<span class="nav-badge-herman">· ${hermanCount} c/ Min. Herman</span>` : ''}
                </div>
            `;

            btn.addEventListener('click', () => {
                state.activeSessionId = session.id;
                closeMobileMenu();
                renderSidebar();
                renderActiveSession();
            });

            sessionsList.appendChild(btn);
        });
    };

    // Renderizar Chips de Matérias da Sessão Atual
    const renderSessionMateriaChips = (session) => {
        sessionMateriaChips.innerHTML = '';
        const materias = Array.isArray(session?.materias) ? session.materias : [];
        if (materias.length === 0) return;

        const allChip = document.createElement('button');
        allChip.type = 'button';
        allChip.className = `materia-chip ${!state.materiaIdFilter ? 'active' : ''}`;
        allChip.textContent = 'Todas da sessão';
        allChip.addEventListener('click', () => {
            state.materiaIdFilter = '';
            materiaSelect.value = '';
            renderSidebar();
            renderActiveSession();
        });
        sessionMateriaChips.appendChild(allChip);

        materias.forEach((m) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            const isActive = String(state.materiaIdFilter) === String(m.id);
            chip.className = `materia-chip ${isActive ? 'active' : ''}`;
            chip.innerHTML = `
                <span>${escapeHtml(m.code)}</span>
                <span class="materia-chip-count">${m.count}</span>
            `;
            chip.addEventListener('click', () => {
                state.materiaIdFilter = isActive ? '' : String(m.id);
                materiaSelect.value = state.materiaIdFilter;
                renderSidebar();
                renderActiveSession();
            });
            sessionMateriaChips.appendChild(chip);
        });
    };

    // "Ler mais" nos destaques: só aparece quando o texto foi de fato truncado
    const setupReadMore = (root) => {
        root.querySelectorAll('.read-more-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const expanded = btn.closest('li').classList.toggle('is-expanded');
                btn.textContent = expanded ? 'Ler menos' : 'Ler mais';
            });
        });
    };

    const syncReadMoreVisibility = (root) => {
        root.querySelectorAll('.read-more-btn').forEach((btn) => {
            const text = btn.previousElementSibling;
            const expanded = btn.closest('li').classList.contains('is-expanded');
            btn.hidden = !expanded && text.scrollHeight <= text.clientHeight + 1;
        });
    };

    window.addEventListener('resize', () => syncReadMoreVisibility(documentViewer));

    // Rolar até um card de processo específico
    const scrollToProcessCard = (processIndex) => {
        const card = document.getElementById(`process-card-${processIndex}`);
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.classList.add('process-card--highlight-flash');
        setTimeout(() => card.classList.remove('process-card--highlight-flash'), 1800);
    };

    // Renderizar Sessão Ativa
    const renderActiveSession = () => {
        const session = rawSessions.find((s) => s.id === state.activeSessionId);
        if (!session) {
            documentViewer.innerHTML = `
                <div class="empty-state-box">
                    <p>Nenhuma sessão carregada no portal. Execute <code>uv run python scripts/processar_sessoes.py</code> para capturar sessões da Primeira Turma ou Primeira Seção.</p>
                </div>
            `;
            return;
        }

        // Atualizar Topbar
        topbarSessionMeta.innerHTML = `
            <span class="topbar-orgao-badge">${escapeHtml(session.orgao)} · Superior Tribunal de Justiça</span>
            <h2 class="topbar-title">${escapeHtml(formatSessionHeading(session))}</h2>
        `;

        // Configurar botões de vídeo (YouTube)
        videoActionsGroup.innerHTML = '';
        const videos = Array.isArray(session.videos) && session.videos.length
            ? session.videos
            : (session.videoUrls || []).map((url, i) => ({ label: i === 0 ? 'Assistir no YouTube' : `Parte ${i + 1}`, url }));

        videos.forEach((v) => {
            if (!v.url) return;
            const a = document.createElement('a');
            a.href = v.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'btn-action';
            const label = videos.length > 1 ? `YouTube (${v.label})` : 'Assistir no YouTube';
            a.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>${escapeHtml(label)}</span>
            `;
            videoActionsGroup.appendChild(a);
        });

        // Configurar leitura e download da transcrição revisada
        const hasTranscript = Boolean(session.transcriptUrl || session.transcriptMarkdown);
        readTranscriptBtn.hidden = !hasTranscript;
        configureTranscriptDownload(downloadTranscriptBtn, session);
        configureTranscriptDownload(drawerDownloadBtn, session);

        renderSessionMateriaChips(session);

        // Filtrar processos da sessão atual
        const { matchingProcesses } = evaluateSessionMatch(session);
        const stats = session.stats || {};

        const container = document.createElement('div');
        container.className = 'session-container';

        // 1. Faixa de Indicadores Objetivos da Sessão
        const statsStrip = document.createElement('dl');
        statsStrip.className = 'session-summary';
        statsStrip.setAttribute('aria-label', 'Indicadores da sessão');
        const summaryItems = [
            ['Processos apreciados', stats.total ?? session.processes.length],
            ['Com atuação do Min. Herman', stats.hermanCount ?? 0, 'summary-item--herman'],
            ['Teses', stats.thesesCount ?? (session.theses?.length || 0)],
            ['Providos ou parciais', (stats.providos || 0) + (stats.parciais || 0)],
            ['Desprovidos', stats.desprovidos ?? 0],
            ['Vistas ou adiados', stats.vistasAdiados ?? 0]
        ];
        statsStrip.innerHTML = summaryItems.map(([label, value, mod]) => `
            <div class="summary-item ${mod || ''}">
                <dt>${label}</dt>
                <dd>${value}</dd>
            </div>
        `).join('');
        container.appendChild(statsStrip);

        // 2. Painel de Protagonismo: Atuação e Manifestações do Min. Herman Benjamin
        const hermanList = Array.isArray(session.hermanHighlights) ? session.hermanHighlights : [];
        if (hermanList.length > 0) {
            // Filtrar manifestações conforme os filtros globais aplicados
            const filteredHermanList = hermanList.filter((item) => {
                const associatedProc = item.processIndex
                    ? session.processes?.find((p) => p.index === item.processIndex)
                    : null;

                if (state.materiaIdFilter) {
                    if (!associatedProc || String(associatedProc.materia?.id) !== String(state.materiaIdFilter)) {
                        return false;
                    }
                }

                if (state.relatorFilter) {
                    if (!associatedProc) return false;
                    const relList = Array.isArray(associatedProc.relatores) ? associatedProc.relatores : [];
                    if (state.relatorFilter === '__CONVOCADOS__') {
                        if (!relList.some((r) => r.role === 'convocado_substituto')) return false;
                    } else {
                        const matches = relList.some((r) => r.name === state.relatorFilter)
                            || associatedProc.relator === state.relatorFilter;
                        if (!matches) return false;
                    }
                }

                if (state.onlyRelevant) {
                    if (!associatedProc || !associatedProc.isRelevant) return false;
                }

                if (state.onlyWithThesis) {
                    if (!associatedProc || !associatedProc.tese) return false;
                }

                if (state.searchQuery.trim()) {
                    const q = normalizeText(state.searchQuery);
                    const itemHaystack = normalizeText(`${item.title || ''} ${item.text || ''}`);
                    const procHaystack = associatedProc
                        ? normalizeText(`${associatedProc.heading || ''} ${associatedProc.processNumber || ''} ${associatedProc.theme || ''} ${associatedProc.materia?.code || ''} ${associatedProc.tese || ''}`)
                        : '';
                    if (!itemHaystack.includes(q) && !procHaystack.includes(q)) {
                        return false;
                    }
                }

                return true;
            });

            const spotlight = document.createElement('section');
            spotlight.className = 'herman-spotlight doc-section';
            spotlight.setAttribute('aria-label', 'Atuação e Manifestações do Ministro Herman Benjamin');

            const itemsHtml = filteredHermanList.map((item) => {
                const tsLink = item.timestamp && item.videoUrl
                    ? `<a href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener noreferrer" class="timestamp-pill" title="Abrir vídeo no momento da manifestação">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                        <span>${escapeHtml(item.timestamp)}${item.partLabel ? ` · ${escapeHtml(item.partLabel)}` : ''}</span>
                       </a>`
                    : '';

                const jumpBtn = item.processIndex
                    ? `<button type="button" class="jump-process-btn" data-jump-index="${item.processIndex}">Ver julgado nº ${item.processIndex}</button>`
                    : '';

                return `
                    <li class="herman-item-card">
                        <div class="herman-item-top">
                            <span class="herman-item-title">${highlightMatches(item.title || 'Intervenção em sessão', state.searchQuery)}</span>
                        </div>
                        <p class="herman-item-text">${highlightMatches(item.text, state.searchQuery)}</p>
                        <button type="button" class="read-more-btn">Ler mais</button>
                        ${tsLink || jumpBtn ? `<div class="herman-item-actions">${tsLink}${jumpBtn}</div>` : ''}
                    </li>
                `;
            }).join('');

            const emptyNotice = filteredHermanList.length === 0
                ? '<div class="herman-spotlight-empty">Nenhuma manifestação do Min. Herman Benjamin nesta sessão corresponde aos filtros ativos.</div>'
                : '';

            spotlight.innerHTML = `
                <div class="spotlight-header">
                    <div class="spotlight-title-group">
                        <h3 class="spotlight-heading">Atuação do Min. Herman Benjamin</h3>
                        <span class="spotlight-kicker">Relatorias, votos e manifestações nesta sessão</span>
                    </div>
                    <div class="spotlight-header-actions">
                        <span class="column-section-count">${filteredHermanList.length}</span>
                        <button type="button" id="toggleHermanSpotlightBtn" class="btn-subtle" title="Recolher ou expandir seção">
                            ${state.hermanSpotlightCollapsed ? 'Expandir' : 'Recolher'}
                        </button>
                    </div>
                </div>
                ${emptyNotice}
                <ul class="spotlight-grid ${state.hermanSpotlightCollapsed ? 'collapsed' : ''}">${itemsHtml}</ul>
            `;
            setupReadMore(spotlight);

            const toggleSpotlightBtn = spotlight.querySelector('#toggleHermanSpotlightBtn');
            if (toggleSpotlightBtn) {
                toggleSpotlightBtn.addEventListener('click', () => {
                    state.hermanSpotlightCollapsed = !state.hermanSpotlightCollapsed;
                    const grid = spotlight.querySelector('.spotlight-grid');
                    if (grid) {
                        grid.classList.toggle('collapsed', state.hermanSpotlightCollapsed);
                    }
                    syncReadMoreVisibility(spotlight);
                    toggleSpotlightBtn.textContent = state.hermanSpotlightCollapsed ? 'Expandir' : 'Recolher';
                });
            }

            spotlight.querySelectorAll('[data-jump-index]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    scrollToProcessCard(btn.getAttribute('data-jump-index'));
                });
            });

            container.appendChild(spotlight);
        }

        // 2.5 Painel de Destaques e Casos Relevantes (Posicionado no Topo da Página)
        const rawHighlights = Array.isArray(session.highlights) ? session.highlights : [];
        if (rawHighlights.length > 0) {
            const filteredHighlights = rawHighlights.filter((h) => {
                if (state.searchQuery.trim()) {
                    const q = normalizeText(state.searchQuery);
                    const haystack = normalizeText(`${h.title || ''} ${h.text || ''}`);
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            const highlightsSpotlight = document.createElement('section');
            highlightsSpotlight.id = 'highlightsSpotlight';
            highlightsSpotlight.className = 'highlights-spotlight doc-section';
            highlightsSpotlight.setAttribute('aria-label', 'Casos Relevantes e Destaques da Sessão');

            const hCardsHtml = filteredHighlights.map((h) => {
                return `
                    <li class="highlight-spotlight-card">
                        <div class="highlight-item-top">
                            <span class="highlight-item-title">${highlightMatches(h.title || 'Destaque do colegiado', state.searchQuery)}</span>
                        </div>
                        <p class="highlight-item-text">${highlightMatches(h.text, state.searchQuery)}</p>
                        <button type="button" class="read-more-btn">Ler mais</button>
                    </li>
                `;
            }).join('');

            const hEmpty = filteredHighlights.length === 0
                ? '<div class="highlights-spotlight-empty">Nenhum destaque corresponde à busca ativa.</div>'
                : '';

            highlightsSpotlight.innerHTML = `
                <div class="spotlight-header">
                    <div class="spotlight-title-group">
                        <h3 class="spotlight-heading">Destaques da sessão</h3>
                        <span class="spotlight-kicker">Casos relevantes e deliberações do colegiado</span>
                    </div>
                    <div class="spotlight-header-actions">
                        <span class="column-section-count">${filteredHighlights.length}</span>
                        <button type="button" id="toggleHighlightsSpotlightBtn" class="btn-subtle" title="Recolher ou expandir seção">
                            ${state.highlightsSpotlightCollapsed ? 'Expandir' : 'Recolher'}
                        </button>
                    </div>
                </div>
                ${hEmpty}
                <ul class="highlights-grid ${state.highlightsSpotlightCollapsed ? 'collapsed' : ''}">${hCardsHtml}</ul>
            `;
            setupReadMore(highlightsSpotlight);

            const toggleHBtn = highlightsSpotlight.querySelector('#toggleHighlightsSpotlightBtn');
            if (toggleHBtn) {
                toggleHBtn.addEventListener('click', () => {
                    state.highlightsSpotlightCollapsed = !state.highlightsSpotlightCollapsed;
                    const grid = highlightsSpotlight.querySelector('.highlights-grid');
                    if (grid) {
                        grid.classList.toggle('collapsed', state.highlightsSpotlightCollapsed);
                    }
                    syncReadMoreVisibility(highlightsSpotlight);
                    toggleHBtn.textContent = state.highlightsSpotlightCollapsed ? 'Expandir' : 'Recolher';
                });
            }

            container.appendChild(highlightsSpotlight);
        }

        // 3. Colunas: Lista de Julgados + Coluna Lateral (Tesauro de Teses)
        const columns = document.createElement('div');
        columns.className = 'workspace-columns';

        const procsCol = document.createElement('section');
        procsCol.className = 'processes-column';
        procsCol.innerHTML = `
            <div class="column-section-header">
                <h3 class="column-section-title">Processos apreciados</h3>
                <div class="spotlight-header-actions">
                    <span class="column-section-count">${matchingProcesses.length === session.processes.length ? `${session.processes.length} processos` : `${matchingProcesses.length} de ${session.processes.length}`}</span>
                </div>
            </div>
        `;
        // O botão global de recolher discussões vive no cabeçalho da lista que ele controla
        procsCol.querySelector('.spotlight-header-actions').appendChild(toggleAllDetailsBtn);
        toggleAllDetailsBtn.hidden = false;

        if (matchingProcesses.length === 0) {
            const emptyProcs = document.createElement('div');
            emptyProcs.className = 'empty-state-box';
            emptyProcs.textContent = 'Nenhum julgado desta sessão corresponde aos filtros ativos.';
            procsCol.appendChild(emptyProcs);
        } else {
            matchingProcesses.forEach((proc) => {
                const card = document.createElement('article');
                card.id = `process-card-${proc.index}`;
                card.className = 'process-card';

                const tsMarkup = proc.timestamp && proc.videoUrl
                    ? `<a href="${escapeHtml(proc.videoUrl)}" target="_blank" rel="noopener noreferrer" class="timestamp-pill" title="Assistir ao julgamento deste processo no YouTube">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                        <span>${escapeHtml(proc.timestamp)}${proc.partLabel ? ` · ${escapeHtml(proc.partLabel)}` : ''}</span>
                       </a>`
                    : (proc.timestamp ? `<span class="timestamp-pill">${escapeHtml(proc.timestamp)}</span>` : '');

                const hermanBadge = proc.isHermanRelator
                    ? '<span class="badge-herman">Relatoria do Min. Herman Benjamin</span>'
                    : (proc.hasHerman ? '<span class="badge-herman">Manifestação do Min. Herman</span>' : '');

                const relevantBadge = proc.isRelevant
                    ? '<span class="badge-relevant">Caso relevante</span>'
                    : '';

                const hasConvocado = Array.isArray(proc.relatores)
                    && proc.relatores.some((r) => r.role === 'convocado_substituto');

                const teseLabelMap = {
                    final: 'Tese fixada',
                    proposta: 'Tese proposta (julgamento em curso)',
                    vencido: 'Tese do voto vencido'
                };
                const teseHeader = teseLabelMap[proc.teseType] || 'Tese ou entendimento';

                card.innerHTML = `
                    <div class="process-card-top">
                        <div class="process-badges-left">
                            <span class="process-index-badge">Nº ${proc.index}</span>
                            <button type="button" class="materia-tag" data-materia-id="${escapeHtml(proc.materia?.id)}">
                                ${highlightMatches(proc.materia?.code || 'Matéria não classificada', state.searchQuery)}
                            </button>
                            ${hermanBadge}
                            ${relevantBadge}
                        </div>
                        <div class="process-badges-right">
                            <span class="status-badge status-badge--${escapeHtml(proc.resultadoCategory || 'outros')}">
                                ${escapeHtml(proc.resultadoLabel || proc.resultado)}
                            </span>
                            ${tsMarkup}
                        </div>
                    </div>

                    <div class="process-heading-row">
                        <h4 class="process-title">${highlightMatches(proc.theme || proc.processNumber, state.searchQuery)}</h4>
                        ${proc.theme ? `<p class="process-number-code">${highlightMatches(proc.processNumber, state.searchQuery)}</p>` : ''}
                    </div>

                    <div class="process-meta-grid">
                        <span class="meta-pair">
                            <strong>Relator</strong> ${highlightMatches(proc.relator, state.searchQuery)}
                            ${hasConvocado ? '<span class="convocado-tag">(convocado)</span>' : ''}
                        </span>
                        <span class="meta-pair">
                            <strong>Resultado</strong> ${highlightMatches(proc.resultado, state.searchQuery)}
                        </span>
                        ${proc.votacao ? `<span class="meta-pair"><strong>Votação</strong> ${highlightMatches(proc.votacao, state.searchQuery)}</span>` : ''}
                    </div>

                    ${proc.hermanManifestation ? `
                        <div class="callout-box callout-box--herman">
                            <span class="callout-box-label">Manifestação do Min. Herman Benjamin</span>
                            <div>${highlightMatches(proc.hermanManifestation, state.searchQuery)}</div>
                        </div>
                    ` : ''}

                    ${proc.tese ? `
                        <div class="callout-box callout-box--thesis">
                            <span class="callout-box-label">${escapeHtml(teseHeader)}</span>
                            <div>${highlightMatches(proc.tese, state.searchQuery)}</div>
                        </div>
                    ` : ''}

                    ${proc.resumoDiscussao ? `
                        <div class="process-discussion-wrapper ${state.detailsCollapsed ? 'collapsed' : ''}">
                            <button type="button" class="process-discussion-toggle">
                                <span>${state.detailsCollapsed ? 'Mostrar resumo da discussão' : 'Ocultar resumo da discussão'}</span>
                            </button>
                            <p class="process-discussion-text">${highlightMatches(proc.resumoDiscussao, state.searchQuery)}</p>
                        </div>
                    ` : ''}
                `;

                const materiaBtn = card.querySelector('.materia-tag');
                if (materiaBtn) {
                    materiaBtn.addEventListener('click', () => {
                        const mId = materiaBtn.getAttribute('data-materia-id');
                        state.materiaIdFilter = String(state.materiaIdFilter) === String(mId) ? '' : String(mId);
                        materiaSelect.value = state.materiaIdFilter;
                        renderSidebar();
                        renderActiveSession();
                    });
                }

                const discToggle = card.querySelector('.process-discussion-toggle');
                const discWrapper = card.querySelector('.process-discussion-wrapper');
                if (discToggle && discWrapper) {
                    discToggle.addEventListener('click', () => {
                        const collapsed = discWrapper.classList.toggle('collapsed');
                        discToggle.querySelector('span').textContent = collapsed
                            ? 'Mostrar resumo da discussão'
                            : 'Ocultar resumo da discussão';
                    });
                }

                procsCol.appendChild(card);
            });
        }

        // Coluna Lateral: Tesauro de Teses e Destaques Institucionais
        const asideCol = document.createElement('aside');
        asideCol.className = 'aside-column';

        // Painel 1: Tesauro de Teses da Sessão
        const thesesPanel = document.createElement('section');
        thesesPanel.className = 'aside-panel';
        thesesPanel.id = 'thesesPanel';
        const theses = Array.isArray(session.theses) ? session.theses : [];

        const thesesItemsMarkup = theses.length
            ? theses.map((t) => {
                const badgeTipo = t.type === 'proposta' ? 'Proposta' : (t.type === 'vencido' ? 'Voto vencido' : 'Fixada');
                return `
                    <li>
                        <button type="button" class="thesis-item-btn" data-jump-index="${t.processIndex}">
                            <div class="thesis-item-meta">
                                <span title="${escapeHtml(t.processNumber || t.materiaShort)}">Nº ${t.processIndex} · ${escapeHtml(t.processNumber || t.materiaShort)}</span>
                                <span class="thesis-type-tag ${t.type === 'proposta' || t.type === 'vencido' ? '' : 'thesis-type-tag--final'}">${escapeHtml(badgeTipo)}</span>
                            </div>
                            <div class="thesis-item-text">${highlightMatches(t.text, state.searchQuery)}</div>
                        </button>
                    </li>
                `;
            }).join('')
            : '<li class="highlight-list-item">Nenhuma tese catalogada nesta sessão.</li>';

        thesesPanel.innerHTML = `
            <div class="aside-panel-header">
                <h3 class="aside-panel-title">Teses da sessão</h3>
                <span class="column-section-count">${theses.length}</span>
            </div>
            <ul class="theses-list">${thesesItemsMarkup}</ul>
        `;

        thesesPanel.querySelectorAll('[data-jump-index]').forEach((btn) => {
            btn.addEventListener('click', () => {
                scrollToProcessCard(btn.getAttribute('data-jump-index'));
            });
        });

        asideCol.appendChild(thesesPanel);
        columns.append(procsCol, asideCol);
        container.appendChild(columns);

        documentViewer.innerHTML = '';
        documentViewer.appendChild(container);
        syncReadMoreVisibility(container);
    };

    // Leitor de Transcrição Revisada e Saneada (Gaveta Lateral Imersiva)
    const renderTranscriptDrawerContent = async (session, filterQuery = '') => {
        let md = session.transcriptMarkdown || '';
        if (!md && session.transcriptUrl) {
            try {
                const resp = await fetch(session.transcriptUrl);
                if (resp.ok) {
                    md = await resp.text();
                    session.transcriptMarkdown = md;
                }
            } catch (err) {
                console.warn('Não foi possível buscar transcriptUrl via fetch:', err);
            }
        }

        if (!md) {
            transcriptDrawerBody.innerHTML = '<div class="empty-state-box">Transcrição revisada indisponível para esta sessão.</div>';
            if (transcriptMatchCount) transcriptMatchCount.textContent = '';
            return;
        }

        const baseVideoUrl = session.videoUrls?.[0] || '';
        const paragraphs = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
        const q = normalizeText(filterQuery);

        transcriptDrawerBody.setAttribute('data-font-size', String(state.transcriptFontSize));
        transcriptDrawerBody.classList.toggle('continuous-mode', state.transcriptViewMode === 'continuous');

        const blocksHtml = [];
        let matchCount = 0;

        paragraphs.forEach((rawBlock) => {
            const trimmed = rawBlock.trim();
            if (!trimmed || trimmed === '---') return;

            if (trimmed.startsWith('#')) {
                if (state.transcriptSpeakerFilter === 'todos') {
                    const cleanHeading = trimmed.replace(/^#+\s*/, '');
                    blocksHtml.push(`<h3 class="transcript-heading">${highlightMatches(cleanHeading, filterQuery)}</h3>`);
                }
                return;
            }

            // Detectar orador e timestamp
            // Formatos canônicos: **[00:23:09] Presidência / Colegiado:** ou **[00:31:18] Min. Herman Benjamin:**
            const turnMatch = trimmed.match(/^\*\*\[(\d{2}:\d{2}:\d{2})\]\s*([^:]+):\*\*\s*(.*)$/s);
            let ts = '';
            let speaker = '';
            let bodyText = trimmed;

            if (turnMatch) {
                ts = turnMatch[1];
                speaker = turnMatch[2].trim();
                bodyText = turnMatch[3].trim();
            }

            const isHerman = /herman\s+benjamin/i.test(speaker) || /herman\s+benjamin/i.test(trimmed);
            const isPresidente = /presidente|presidência/i.test(speaker);
            const isRelator = /relator|relatoria/i.test(speaker);

            // Filtragem por Orador
            if (state.transcriptSpeakerFilter === 'herman' && !isHerman) return;
            if (state.transcriptSpeakerFilter === 'presidente' && !isPresidente) return;
            if (state.transcriptSpeakerFilter === 'relator' && !isRelator) return;

            // Busca por texto
            if (q) {
                const haystack = normalizeText(`${speaker} ${bodyText}`);
                if (!haystack.includes(q)) return;
            }

            matchCount += 1;

            // Tratar formatação de timestamp para YouTube com link direto
            const buildTsLink = (timeStr) => {
                if (!timeStr) return '';
                if (!baseVideoUrl) return `<code>[${timeStr}]</code>`;
                const parts = timeStr.split(':').map(Number);
                const secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
                const sep = baseVideoUrl.includes('?') ? '&' : '?';
                return `<a href="${escapeHtml(`${baseVideoUrl}${sep}t=${secs}s`)}" target="_blank" rel="noopener noreferrer" class="timestamp-pill" title="Reproduzir vídeo em ${timeStr}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px;margin-right:3px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    <span>${timeStr}</span>
                </a>`;
            };

            const tsPill = ts ? buildTsLink(ts) : '';

            // Formatação do corpo do texto
            let formattedBody = highlightMatches(bodyText, filterQuery);
            formattedBody = formattedBody
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/(^|\s)\*(.*?)\*(\s|$)/g, '$1<em>$2</em>$3')
                .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
                .replace(/^- /g, '• ');

            // Tratar timestamps adicionais dentro do texto
            formattedBody = formattedBody.replace(/\[(\d{2}:\d{2}:\d{2})\]/g, (full, subTs) => buildTsLink(subTs));

            if (state.transcriptViewMode === 'continuous') {
                blocksHtml.push(`
                    <div class="transcript-dialogue-card ${isHerman ? 'transcript-dialogue-card--herman' : ''}">
                        <p class="dialogue-card-text">
                            ${tsPill ? `<span style="float:right;margin-left:8px;">${tsPill}</span>` : ''}
                            ${speaker ? `<strong>${highlightMatches(speaker, filterQuery)}:</strong> ` : ''}
                            ${formattedBody}
                        </p>
                    </div>
                `);
            } else {
                blocksHtml.push(`
                    <article class="transcript-dialogue-card ${isHerman ? 'transcript-dialogue-card--herman' : ''}">
                        <div class="dialogue-card-header">
                            <span class="dialogue-speaker-badge">${highlightMatches(speaker || 'Manifestação', filterQuery)}</span>
                            ${tsPill}
                        </div>
                        <p class="dialogue-card-text">${formattedBody}</p>
                    </article>
                `);
            }
        });

        if (transcriptMatchCount) {
            if (filterQuery.trim()) {
                transcriptMatchCount.textContent = `${matchCount} trecho${matchCount === 1 ? '' : 's'}`;
            } else {
                transcriptMatchCount.textContent = `${matchCount} falas`;
            }
        }

        transcriptDrawerBody.innerHTML = blocksHtml.length
            ? blocksHtml.join('')
            : '<div class="empty-state-box">Nenhum trecho encontrado para os filtros selecionados.</div>';
    };

    const openTranscriptDrawer = () => {
        const session = rawSessions.find((s) => s.id === state.activeSessionId);
        if (!session) return;
        transcriptDrawerTitle.textContent = `Transcrição Revisada — ${session.title}`;
        if (drawerDownloadBtn) {
            const docxFileName = `${session.id}_transcricao_revisada.docx`;
            drawerDownloadBtn.setAttribute('download', docxFileName);
            drawerDownloadBtn.href = session.transcriptDocxUrl || session.transcriptUrl || `transcricoes/${docxFileName}`;
        }
        transcriptSearchInput.value = '';
        state.transcriptSpeakerFilter = 'todos';
        speakerPills.forEach((p) => {
            p.classList.toggle('active', p.getAttribute('data-speaker') === 'todos');
        });
        transcriptDrawerBackdrop.hidden = false;
        transcriptDrawer.hidden = false;
        // Forçar reflow para ativar a transição CSS
        void transcriptDrawer.offsetWidth;
        transcriptDrawerBackdrop.classList.add('is-open');
        transcriptDrawer.classList.add('is-open');
        transcriptDrawer.setAttribute('aria-hidden', 'false');
        renderTranscriptDrawerContent(session, '');
        transcriptSearchInput.focus();
    };

    const closeTranscriptDrawer = () => {
        transcriptDrawerBackdrop.classList.remove('is-open');
        transcriptDrawer.classList.remove('is-open');
        transcriptDrawer.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            if (!transcriptDrawer.classList.contains('is-open')) {
                transcriptDrawerBackdrop.hidden = true;
                transcriptDrawer.hidden = true;
            }
        }, 280);
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !transcriptDrawer.hidden) {
            closeTranscriptDrawer();
        }
    });

    // Tema Claro / Escuro
    const applyTheme = (theme) => {
        const isDark = theme === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        localStorage.setItem('stj_gmhb_theme', isDark ? 'dark' : 'light');
        themeToggle.setAttribute('aria-pressed', String(isDark));
        themeLabel.textContent = isDark ? 'Modo claro' : 'Modo escuro';
        const moon = themeToggle.querySelector('.icon-moon');
        const sun = themeToggle.querySelector('.icon-sun');
        if (moon && sun) {
            moon.hidden = isDark;
            sun.hidden = !isDark;
        }
    };

    // Eventos
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderSidebar();
        renderActiveSession();
    });

    orgaoTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            orgaoTabs.forEach((t) => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            state.orgaoFilter = tab.getAttribute('data-orgao') || 'todos';
            renderSidebar();
            renderActiveSession();
        });
    });

    materiaSelect.addEventListener('change', (e) => {
        state.materiaIdFilter = e.target.value;
        renderSidebar();
        renderActiveSession();
    });

    relatorSelect.addEventListener('change', (e) => {
        state.relatorFilter = e.target.value;
        renderSidebar();
        renderActiveSession();
    });

    toggleHermanBtn.addEventListener('click', () => {
        state.onlyHerman = !state.onlyHerman;
        toggleHermanBtn.setAttribute('aria-pressed', String(state.onlyHerman));
        renderSidebar();
        renderActiveSession();
    });

    toggleRelevantBtn.addEventListener('click', () => {
        state.onlyRelevant = !state.onlyRelevant;
        toggleRelevantBtn.setAttribute('aria-pressed', String(state.onlyRelevant));
        renderSidebar();
        renderActiveSession();
    });

    toggleThesisBtn.addEventListener('click', () => {
        state.onlyWithThesis = !state.onlyWithThesis;
        toggleThesisBtn.setAttribute('aria-pressed', String(state.onlyWithThesis));
        renderSidebar();
        renderActiveSession();
    });

    toggleAllDetailsBtn.addEventListener('click', () => {
        state.detailsCollapsed = !state.detailsCollapsed;
        toggleAllDetailsBtn.textContent = state.detailsCollapsed
            ? 'Expandir discussões'
            : 'Recolher discussões';
        renderActiveSession();
    });

    resetAllFiltersBtn.addEventListener('click', () => {
        state.searchQuery = '';
        state.orgaoFilter = 'todos';
        state.materiaIdFilter = '';
        state.relatorFilter = '';
        state.onlyHerman = false;
        state.onlyRelevant = false;
        state.onlyWithThesis = false;

        searchInput.value = '';
        materiaSelect.value = '';
        relatorSelect.value = '';
        toggleHermanBtn.setAttribute('aria-pressed', 'false');
        toggleRelevantBtn.setAttribute('aria-pressed', 'false');
        toggleThesisBtn.setAttribute('aria-pressed', 'false');
        orgaoTabs.forEach((t) => {
            const isTodos = t.getAttribute('data-orgao') === 'todos';
            t.classList.toggle('active', isTodos);
            t.setAttribute('aria-selected', String(isTodos));
        });

        renderSidebar();
        renderActiveSession();
    });

    readTranscriptBtn.addEventListener('click', openTranscriptDrawer);
    closeTranscriptDrawerBtn.addEventListener('click', closeTranscriptDrawer);
    transcriptDrawerBackdrop.addEventListener('click', closeTranscriptDrawer);

    transcriptSearchInput.addEventListener('input', (e) => {
        const session = rawSessions.find((s) => s.id === state.activeSessionId);
        if (session) {
            renderTranscriptDrawerContent(session, e.target.value);
        }
    });

    transcriptFontDec?.addEventListener('click', () => {
        if (state.transcriptFontSize > 13) {
            state.transcriptFontSize -= 1;
            transcriptDrawerBody.setAttribute('data-font-size', String(state.transcriptFontSize));
        }
    });

    transcriptFontInc?.addEventListener('click', () => {
        if (state.transcriptFontSize < 18) {
            state.transcriptFontSize += 1;
            transcriptDrawerBody.setAttribute('data-font-size', String(state.transcriptFontSize));
        }
    });

    transcriptModeDialogue?.addEventListener('click', () => {
        state.transcriptViewMode = 'dialogue';
        transcriptModeDialogue.classList.add('active');
        transcriptModeContinuous.classList.remove('active');
        const session = rawSessions.find((s) => s.id === state.activeSessionId);
        if (session) renderTranscriptDrawerContent(session, transcriptSearchInput.value);
    });

    transcriptModeContinuous?.addEventListener('click', () => {
        state.transcriptViewMode = 'continuous';
        transcriptModeContinuous.classList.add('active');
        transcriptModeDialogue.classList.remove('active');
        const session = rawSessions.find((s) => s.id === state.activeSessionId);
        if (session) renderTranscriptDrawerContent(session, transcriptSearchInput.value);
    });

    fullscreenTranscriptBtn?.addEventListener('click', () => {
        state.transcriptIsFullscreen = !state.transcriptIsFullscreen;
        transcriptDrawer.classList.toggle('fullscreen', state.transcriptIsFullscreen);
        const exp = fullscreenTranscriptBtn.querySelector('.icon-expand');
        const comp = fullscreenTranscriptBtn.querySelector('.icon-compress');
        if (exp && comp) {
            exp.hidden = state.transcriptIsFullscreen;
            comp.hidden = !state.transcriptIsFullscreen;
        }
    });

    speakerPills.forEach((pill) => {
        pill.addEventListener('click', () => {
            speakerPills.forEach((p) => p.classList.remove('active'));
            pill.classList.add('active');
            state.transcriptSpeakerFilter = pill.getAttribute('data-speaker') || 'todos';
            const session = rawSessions.find((s) => s.id === state.activeSessionId);
            if (session) renderTranscriptDrawerContent(session, transcriptSearchInput.value);
        });
    });

    copySummaryBtn.addEventListener('click', async () => {
        const session = rawSessions.find((s) => s.id === state.activeSessionId);
        if (!session || !session.content) return;
        try {
            await navigator.clipboard.writeText(session.content);
            copySummaryLabel.textContent = 'Resumo copiado';
            setTimeout(() => {
                copySummaryLabel.textContent = 'Copiar resumo';
            }, 1800);
        } catch (err) {
            console.error('Erro ao copiar resumo:', err);
        }
    });

    printBtn.addEventListener('click', () => window.print());

    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    mobileMenuBtn?.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    });

    sidebarBackdrop?.addEventListener('click', closeMobileMenu);

    // Rolagem Horizontal Suave via Roda do Mouse nos Chips
    sessionMateriaChips?.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            sessionMateriaChips.scrollLeft += e.deltaY;
        }
    }, { passive: false });

    // Botão Voltar ao Topo
    if (documentViewer && backToTopBtn) {
        documentViewer.addEventListener('scroll', () => {
            if (documentViewer.scrollTop > 320) {
                backToTopBtn.hidden = false;
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        });

        backToTopBtn.addEventListener('click', () => {
            documentViewer.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        } else if (e.key === 'Escape') {
            if (!transcriptDrawer.hidden) {
                closeTranscriptDrawer();
            } else if (sidebar.classList.contains('open')) {
                closeMobileMenu();
            }
        }
    });

    // Inicialização
    applyTheme(localStorage.getItem('stj_gmhb_theme') || 'light');
    populateFilterSelects();
    renderSidebar();
    renderActiveSession();
});
