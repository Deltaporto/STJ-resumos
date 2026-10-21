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
    const downloadPautaBtn = document.getElementById('downloadPautaBtn');
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
        detailsCollapsed: true,
        hermanSpotlightCollapsed: false,
        viewMode: 'session', // 'session' (sessão completa) | 'pauta' (pauta / ordem do dia) | 'theses' (só teses)
        pautaCategoryFilter: 'todas',
        highlightsSpotlightCollapsed: false,
        transcriptViewMode: 'dialogue', // 'dialogue' | 'continuous'
        transcriptSpeakerFilter: 'todos', // 'todos' | 'herman' | 'presidente' | 'relator'
        transcriptFontSize: 17,
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
            const partesStr = Array.isArray(proc.partes)
                ? proc.partes.map((p) => `${p.papel || ''} ${p.nome || ''}`).join(' ')
                : '';
            const pautaItemsStr = Array.isArray(proc.pautaItems)
                ? proc.pautaItems.map((it) => `item ${it.item} item 0${it.item} ${it.processo || ''} ${it.assunto || ''} ${it.temaRepetitivo || ''}`).join(' ')
                : '';
            const haystack = normalizeText([
                proc.heading,
                proc.processNumber,
                proc.theme,
                proc.materia?.code,
                proc.relator,
                proc.resultado,
                proc.hermanManifestation,
                proc.tese,
                proc.resumoDiscussao,
                proc.assuntoOficial,
                proc.temaRepetitivo,
                proc.resultadoOficial,
                partesStr,
                pautaItemsStr
            ].join(' '));
            if (!haystack.includes(q)) {
                return false;
            }
        }

        return true;
    };

    // Verifica se um item da pauta oficial atende à busca / filtro de relator
    const pautaItemMatchesFilters = (it) => {
        if (state.relatorFilter && state.relatorFilter !== '__CONVOCADOS__') {
            const relNorm = normalizeText(state.relatorFilter);
            const itRelNorm = normalizeText(`${it.relator || ''} ${it.vistor || ''} ${it.ministro_sessao || ''}`);
            if (!itRelNorm.includes(relNorm)) return false;
        }
        if (state.onlyHerman) {
            const itRelNorm = normalizeText(`${it.relator || ''} ${it.vistor || ''} ${it.ministro_sessao || ''}`);
            if (!itRelNorm.includes('herman benjamin')) return false;
        }
        if (state.searchQuery.trim()) {
            const q = normalizeText(state.searchQuery);
            const partesStr = Array.isArray(it.partes)
                ? it.partes.map((p) => `${p.papel || ''} ${p.nome || ''}`).join(' ')
                : '';
            const soStr = Array.isArray(it.sustentacoes_orais)
                ? it.sustentacoes_orais.map((s) => `${s.advogado || ''} ${s.partes || ''}`).join(' ')
                : '';
            const haystack = normalizeText([
                `item ${it.item}`,
                `item ${String(it.item).padStart(2, '0')}`,
                it.processo,
                it.cabecalho_pdf,
                it.registro_formatado,
                it.tema_repetitivo,
                it.relator,
                it.vistor,
                it.categoria,
                it.assunto,
                it.resultado_oficial,
                partesStr,
                soStr
            ].join(' '));
            if (!haystack.includes(q)) return false;
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

        // Também aceita se o termo de busca bater no título/data/órgão da sessão ou em algum item da Pauta
        if (state.searchQuery.trim() && matchingProcesses.length === 0) {
            const q = normalizeText(state.searchQuery);
            const sessionHeaderHaystack = normalizeText(`${session.title} ${session.date} ${session.orgao}`);
            if (sessionHeaderHaystack.includes(q)) {
                return { matches: true, matchingProcesses: procs };
            }
            const pautaItens = Array.isArray(session.pauta?.itens) ? session.pauta.itens : [];
            if (pautaItens.some(pautaItemMatchesFilters)) {
                return { matches: true, matchingProcesses };
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
        syncSidebarToggleLabel();
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
        // Também é chamada ao escolher uma sessão no desktop: o rótulo reflete o layout atual
        syncSidebarToggleLabel();
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

    const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';

    const timestampLink = (item, title) => (item.timestamp && item.videoUrl
        ? `<a href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noopener noreferrer" class="timestamp-pill" title="${title}">
            ${PLAY_ICON}<span>${escapeHtml(item.timestamp)}${item.partLabel ? ` · ${escapeHtml(item.partLabel)}` : ''}</span>
           </a>`
        : '');

    const queryMatches = (text) => {
        const q = normalizeText(state.searchQuery.trim());
        return Boolean(q) && normalizeText(text || '').includes(q);
    };

    // Linha de destaque: título sempre visível, texto aberto sob demanda
    // (ou automaticamente quando a busca encontra algo nele)
    const disclosureRow = ({ title, text, actionsHtml }) => {
        const open = queryMatches(text);
        return `
            <li class="disclosure-row ${open ? 'is-open' : ''}">
                <button type="button" class="disclosure-toggle" aria-expanded="${open}">
                    <span class="disclosure-chevron" aria-hidden="true"></span>
                    <span class="disclosure-title">${highlightMatches(title, state.searchQuery)}</span>
                </button>
                ${actionsHtml ? `<div class="disclosure-actions">${actionsHtml}</div>` : ''}
                <p class="disclosure-text">${highlightMatches(text, state.searchQuery)}</p>
            </li>
        `;
    };

    const setupDisclosureRows = (root) => {
        root.querySelectorAll('.disclosure-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const open = btn.closest('.disclosure-row').classList.toggle('is-open');
                btn.setAttribute('aria-expanded', String(open));
            });
        });
    };

    // Rolar até um card de processo específico
    const scrollToProcessCard = (processIndex) => {
        const card = document.getElementById(`process-card-${processIndex}`);
        if (!card) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
        card.classList.add('process-card--highlight-flash');
        setTimeout(() => card.classList.remove('process-card--highlight-flash'), 1800);
    };

    // Rolar até um item específico da Pauta da Sessão
    const scrollToPautaItem = (itemNum) => {
        const el = document.getElementById(`pauta-item-${itemNum}`);
        if (!el) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'center' });
        el.classList.add('process-card--highlight-flash');
        setTimeout(() => el.classList.remove('process-card--highlight-flash'), 1800);
    };

    // Modo "Só teses": leitura contínua das teses, agrupadas pelo que significam juridicamente
    const THESIS_GROUPS = [
        { type: 'final', title: 'Teses fixadas', desc: 'Entendimentos firmados pelo colegiado nesta sessão.' },
        { type: 'proposta', title: 'Teses propostas', desc: 'Julgamentos ainda em curso: pedido de vista, adiamento ou proposta do relator.' },
        { type: 'vencido', title: 'Teses de voto vencido', desc: 'Posições que não prevaleceram no julgamento.' }
    ];
    const thesisGroupOf = (t) => (t.type === 'proposta' || t.type === 'vencido' ? t.type : 'final');

    const setViewMode = (mode, { focusProcess, focusPautaItem } = {}) => {
        state.viewMode = mode;
        if (focusPautaItem) {
            state.pautaCategoryFilter = 'todas';
        }
        renderActiveSession();
        if (focusProcess) {
            requestAnimationFrame(() => scrollToProcessCard(focusProcess));
        } else if (focusPautaItem) {
            requestAnimationFrame(() => scrollToPautaItem(focusPautaItem));
        } else {
            documentViewer.scrollTo({ top: 0, behavior: 'auto' });
        }
    };

    const buildViewSwitch = (thesesCount, pautaCount = 0) => {
        const group = document.createElement('div');
        group.className = 'view-switch';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Modo de leitura');
        group.innerHTML = `
            <button type="button" data-view="session" aria-pressed="${state.viewMode === 'session'}">Sessão completa</button>
            <button type="button" data-view="pauta" aria-pressed="${state.viewMode === 'pauta'}" ${pautaCount ? '' : 'disabled'}>
                Pauta da sessão <span class="view-switch-count">${pautaCount}</span>
            </button>
            <button type="button" data-view="theses" aria-pressed="${state.viewMode === 'theses'}" ${thesesCount ? '' : 'disabled'}>
                Só teses <span class="view-switch-count">${thesesCount}</span>
            </button>
        `;
        group.querySelectorAll('[data-view]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.dataset.view !== state.viewMode) setViewMode(btn.dataset.view);
            });
        });
        return group;
    };

    const renderPautaReading = (session, pauta) => {
        const allItems = Array.isArray(pauta?.itens) ? pauta.itens : [];
        const matchedBySearchAndRelator = allItems.filter(pautaItemMatchesFilters);

        // Categorias presentes na pauta
        const catCounts = {};
        matchedBySearchAndRelator.forEach((it) => {
            const cat = it.categoria || 'Pauta';
            catCounts[cat] = (catCounts[cat] || 0) + 1;
        });
        const categories = Object.keys(catCounts);

        const shown = state.pautaCategoryFilter === 'todas'
            ? matchedBySearchAndRelator
            : matchedBySearchAndRelator.filter((it) => (it.categoria || 'Pauta') === state.pautaCategoryFilter);

        const section = document.createElement('section');
        section.className = 'pauta-reading';
        section.setAttribute('aria-label', 'Pauta de julgamentos e Ordem do Dia');

        const pdfDownloadUrl = session.pautaPdfUrl || pauta?.url_pauta_pdf || '';
        const docLinksHtml = [
            pdfDownloadUrl
                ? `<a href="${escapeHtml(pdfDownloadUrl)}" download="${escapeHtml(session.id || 'sessao')}_pauta_oficial.pdf" target="_blank" rel="noopener noreferrer" class="btn-action btn-action--primary" title="Baixar PDF original da Pauta de Julgamentos do STJ">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:14px;height:14px;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l3 3 3-3"></path><path d="M12 11v7"></path></svg>
                    <span>Baixar pauta original (PDF)</span>
                   </a>`
                : '',
            pauta?.url_pauta_pdf && session.pautaPdfUrl
                ? `<a href="${escapeHtml(pauta.url_pauta_pdf)}" target="_blank" rel="noopener noreferrer" class="btn-action" title="Abrir no portal do Calendário de Sessões do STJ">
                    <span>Ver no STJ</span>
                   </a>`
                : '',
            pauta?.url_ata_pdf
                ? `<a href="${escapeHtml(pauta.url_ata_pdf)}" target="_blank" rel="noopener noreferrer" class="btn-action" title="Abrir PDF oficial da Ata de Julgamento no portal do STJ">
                    <span>Ata oficial (PDF)</span>
                   </a>`
                : ''
        ].filter(Boolean).join('');

        const categoryChipsHtml = categories.length > 1
            ? `
                <div class="materia-chips-bar pauta-category-bar" role="group" aria-label="Filtrar categoria da Ordem do Dia">
                    <button type="button" class="materia-chip ${state.pautaCategoryFilter === 'todas' ? 'active' : ''}" data-pauta-cat="todas">
                        <span>Todas da Ordem do Dia</span>
                        <span class="materia-chip-count">${matchedBySearchAndRelator.length}</span>
                    </button>
                    ${categories.map((cat) => `
                        <button type="button" class="materia-chip ${state.pautaCategoryFilter === cat ? 'active' : ''}" data-pauta-cat="${escapeHtml(cat)}">
                            <span>${escapeHtml(cat)}</span>
                            <span class="materia-chip-count">${catCounts[cat]}</span>
                        </button>
                    `).join('')}
                </div>
            `
            : '';

        const entriesHtml = shown.map((it) => {
            const itemNumPad = String(it.item || '').padStart(2, '0');
            const kickerParts = [
                `Item ${itemNumPad}`,
                it.categoria || 'Ordem do Dia',
                it.registro_formatado ? `Reg. ${it.registro_formatado}` : ''
            ].filter(Boolean).map(escapeHtml).join(' · ');

            const partesStr = Array.isArray(it.partes) && it.partes.length
                ? it.partes.map((p) => `${p.papel}: ${p.nome}`).join(' · ')
                : '';

            const soStr = Array.isArray(it.sustentacoes_orais) && it.sustentacoes_orais.length
                ? it.sustentacoes_orais.map((s) => (s.partes ? `${s.advogado} (${s.partes})` : s.advogado)).join(' · ')
                : '';

            const relStr = it.vistor
                ? `${it.relator} (Voto-Vista: ${it.vistor})`
                : (it.relator || it.ministro_sessao || 'Não informado');

            const titleText = it.assunto
                ? `${it.processo} — ${it.assunto}`
                : it.processo;

            const actionsHtml = [
                it.timestamp && it.videoUrl ? timestampLink(it, 'Abrir vídeo no momento do apregoamento') : '',
                it.matchedProcessIndex
                    ? `<button type="button" class="jump-process-btn" data-jump-index="${it.matchedProcessIndex}">Ver resumo do julgado (nº ${it.matchedProcessIndex})</button>`
                    : '<span class="pauta-unmatched-note">Apreciado em bloco / lista ou sem debate individualizado</span>'
            ].filter(Boolean).join('');

            return `
                <li id="pauta-item-${it.item}" class="thesis-entry pauta-entry">
                    <div class="pauta-entry-top">
                        <p class="thesis-entry-kicker">${kickerParts}</p>
                        ${it.resultado_oficial ? `<span class="pauta-result-tag">${highlightMatches(it.resultado_oficial, state.searchQuery)}</span>` : ''}
                    </div>
                    <h5 class="thesis-entry-title">
                        ${highlightMatches(titleText, state.searchQuery)}
                        ${it.tema_repetitivo ? `<span class="tema-repetitivo-badge">${highlightMatches(it.tema_repetitivo, state.searchQuery)}</span>` : ''}
                    </h5>
                    <div class="process-meta-grid pauta-meta-grid">
                        <span class="meta-pair"><strong>Relator</strong> ${highlightMatches(relStr, state.searchQuery)}</span>
                        ${partesStr ? `<span class="meta-pair"><strong>Partes</strong> ${highlightMatches(partesStr, state.searchQuery)}</span>` : ''}
                        ${soStr ? `<span class="meta-pair"><strong>Sustentação</strong> ${highlightMatches(soStr, state.searchQuery)}</span>` : ''}
                    </div>
                    <div class="thesis-entry-actions">
                        ${actionsHtml}
                    </div>
                </li>
            `;
        }).join('');

        section.innerHTML = `
            <div class="column-section-header pauta-reading-header">
                <div class="spotlight-title-group">
                    <h3 class="column-section-title">Pauta de Julgamentos e Ordem do Dia</h3>
                    <span class="spotlight-kicker">Relação oficial de processos pautados no STJ (${escapeHtml(pauta?.tipo_sessao || 'Sessão Ordinária')} · ${allItems.length} itens · ${pauta?.total_sustentacoes || 0} sustentações orais)</span>
                </div>
                <div class="spotlight-header-actions">
                    <span class="column-section-count">${shown.length === allItems.length ? `${allItems.length} itens` : `${shown.length} de ${allItems.length}`}</span>
                    ${docLinksHtml}
                </div>
            </div>
            ${categoryChipsHtml}
            ${entriesHtml ? `<ol class="thesis-entries pauta-entries">${entriesHtml}</ol>` : '<div class="empty-state-box">Nenhum item da pauta corresponde aos filtros ativos.</div>'}
        `;

        section.querySelectorAll('[data-pauta-cat]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.pautaCategoryFilter = btn.getAttribute('data-pauta-cat') || 'todas';
                renderActiveSession();
            });
        });

        section.querySelectorAll('[data-jump-index]').forEach((btn) => {
            btn.addEventListener('click', () => setViewMode('session', { focusProcess: btn.getAttribute('data-jump-index') }));
        });

        return section;
    };

    const renderThesesReading = (session, theses, matchingProcesses) => {
        // Os filtros da barra (matéria, relator, recortes, busca) valem também aqui
        const visible = new Set(matchingProcesses.map((p) => String(p.index)));
        const shown = theses.filter((t) => visible.has(String(t.processIndex)));

        const section = document.createElement('section');
        section.className = 'theses-reading';
        section.setAttribute('aria-label', 'Teses da sessão');

        const groupsHtml = THESIS_GROUPS.map((g) => {
            const items = shown.filter((t) => thesisGroupOf(t) === g.type);
            if (!items.length) return '';
            const entries = items.map((t) => {
                const proc = session.processes?.find((pr) => String(pr.index) === String(t.processIndex));
                const title = proc?.theme || t.processTitle || t.processNumber;
                const kicker = [`Nº ${t.processIndex}`, t.materiaShort, t.relator].filter(Boolean).map(escapeHtml).join(' · ');
                return `
                    <li class="thesis-entry">
                        <p class="thesis-entry-kicker">${kicker}</p>
                        <h5 class="thesis-entry-title">${highlightMatches(title, state.searchQuery)}</h5>
                        ${t.processNumber && t.processNumber !== title ? `<p class="thesis-entry-process">${highlightMatches(t.processNumber, state.searchQuery)}</p>` : ''}
                        <p class="thesis-entry-text">${highlightMatches(t.text, state.searchQuery)}</p>
                        <div class="thesis-entry-actions">
                            ${timestampLink(t, 'Abrir vídeo no momento do julgamento')}
                            <button type="button" class="jump-process-btn" data-jump-index="${t.processIndex}">Ver julgado nº ${t.processIndex}</button>
                        </div>
                    </li>
                `;
            }).join('');
            return `
                <section class="thesis-group">
                    <header class="thesis-group-header">
                        <h4 class="thesis-group-title">${g.title} <span class="column-section-count">${items.length}</span></h4>
                        <p class="thesis-group-desc">${g.desc}</p>
                    </header>
                    <ol class="thesis-entries">${entries}</ol>
                </section>
            `;
        }).join('');

        section.innerHTML = `
            <div class="column-section-header">
                <h3 class="column-section-title">Teses da sessão</h3>
                <span class="column-section-count">${shown.length === theses.length ? `${theses.length} teses` : `${shown.length} de ${theses.length}`}</span>
            </div>
            ${groupsHtml || '<div class="empty-state-box">Nenhuma tese corresponde aos filtros ativos.</div>'}
        `;

        section.querySelectorAll('[data-jump-index]').forEach((btn) => {
            btn.addEventListener('click', () => setViewMode('session', { focusProcess: btn.getAttribute('data-jump-index') }));
        });
        return section;
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

        // Avisa o painel do assistente qual sessão está aberta
        document.dispatchEvent(new CustomEvent('portal:sessao-ativa', { detail: { id: session.id } }));

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
            a.className = 'btn-action btn-action--collapsible';
            const label = videos.length > 1 ? `YouTube (${v.label})` : 'YouTube';
            a.title = `Assistir ${videos.length > 1 ? `à ${v.label} ` : ''}no YouTube`;
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

        // Configurar download do documento oficial da pauta (PDF original)
        const pautaPdfTarget = session.pautaPdfUrl || session.pauta?.url_pauta_pdf || session.pautaOfficialUrl || '';
        if (downloadPautaBtn) {
            if (pautaPdfTarget) {
                downloadPautaBtn.hidden = false;
                downloadPautaBtn.href = pautaPdfTarget;
                downloadPautaBtn.setAttribute('download', `${session.id || 'sessao'}_pauta_oficial.pdf`);
                const totalItensPauta = session.pauta?.total_itens || session.stats?.pautaTotal || 0;
                downloadPautaBtn.title = totalItensPauta
                    ? `Baixar PDF original da Pauta de Julgamentos do STJ (${totalItensPauta} processos pautados)`
                    : 'Baixar PDF original da Pauta de Julgamentos do STJ';
            } else {
                downloadPautaBtn.hidden = true;
            }
        }

        renderSessionMateriaChips(session);

        // Filtrar processos da sessão atual
        const { matchingProcesses } = evaluateSessionMatch(session);
        const stats = session.stats || {};

        const container = document.createElement('div');
        container.className = 'session-container';

        const sessionTheses = Array.isArray(session.theses) ? session.theses : [];
        const sessionPauta = session.pauta || null;
        const pautaCount = Array.isArray(sessionPauta?.itens) ? sessionPauta.itens.length : 0;

        if (state.viewMode === 'pauta' && pautaCount) {
            container.classList.add('session-container--reading');
            container.append(buildViewSwitch(sessionTheses.length, pautaCount), renderPautaReading(session, sessionPauta));
            documentViewer.innerHTML = '';
            documentViewer.appendChild(container);
            return;
        }

        if (state.viewMode === 'theses' && sessionTheses.length) {
            container.classList.add('session-container--reading');
            container.append(buildViewSwitch(sessionTheses.length, pautaCount), renderThesesReading(session, sessionTheses, matchingProcesses));
            documentViewer.innerHTML = '';
            documentViewer.appendChild(container);
            return;
        }
        container.appendChild(buildViewSwitch(sessionTheses.length, pautaCount));

        // 1. Faixa de Indicadores Objetivos da Sessão
        const statsStrip = document.createElement('dl');
        statsStrip.className = 'session-summary';
        statsStrip.setAttribute('aria-label', 'Indicadores da sessão');
        const summaryItems = [
            ['Processos apreciados', stats.total ?? session.processes.length],
            ['Com atuação do Min. Herman', stats.hermanCount ?? 0, 'summary-item--herman'],
            ['Itens na pauta oficial', pautaCount || (stats.total ?? session.processes.length)],
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

            const itemsHtml = filteredHermanList.map((item) => disclosureRow({
                title: item.title || 'Intervenção em sessão',
                text: item.text,
                actionsHtml: `${timestampLink(item, 'Abrir vídeo no momento da manifestação')}${item.processIndex
                    ? `<button type="button" class="jump-process-btn" data-jump-index="${item.processIndex}">Julgado nº ${item.processIndex}</button>`
                    : ''}`
            })).join('');

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
            setupDisclosureRows(spotlight);

            const toggleSpotlightBtn = spotlight.querySelector('#toggleHermanSpotlightBtn');
            if (toggleSpotlightBtn) {
                toggleSpotlightBtn.addEventListener('click', () => {
                    state.hermanSpotlightCollapsed = !state.hermanSpotlightCollapsed;
                    const grid = spotlight.querySelector('.spotlight-grid');
                    if (grid) {
                        grid.classList.toggle('collapsed', state.hermanSpotlightCollapsed);
                    }
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

            const hCardsHtml = filteredHighlights.map((h) => disclosureRow({
                title: h.title || 'Destaque do colegiado',
                text: h.text,
                actionsHtml: timestampLink(h, 'Abrir vídeo no momento do julgamento')
            })).join('');

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
            setupDisclosureRows(highlightsSpotlight);

            const toggleHBtn = highlightsSpotlight.querySelector('#toggleHighlightsSpotlightBtn');
            if (toggleHBtn) {
                toggleHBtn.addEventListener('click', () => {
                    state.highlightsSpotlightCollapsed = !state.highlightsSpotlightCollapsed;
                    const grid = highlightsSpotlight.querySelector('.highlights-grid');
                    if (grid) {
                        grid.classList.toggle('collapsed', state.highlightsSpotlightCollapsed);
                    }
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

                const discussionCollapsed = state.detailsCollapsed && !queryMatches(proc.resumoDiscussao);

                const teseLabelMap = {
                    final: 'Tese fixada',
                    proposta: 'Tese proposta (julgamento em curso)',
                    vencido: 'Tese do voto vencido'
                };
                const teseHeader = teseLabelMap[proc.teseType] || 'Tese ou entendimento';

                const pautaItems = Array.isArray(proc.pautaItems) ? proc.pautaItems : [];
                let pautaBadge = '';
                if (pautaItems.length > 0) {
                    const nums = pautaItems.map((it) => String(it.item).padStart(2, '0')).join(', ');
                    const labelPauta = pautaItems.length > 1 ? `Itens ${nums} da pauta` : `Item ${nums} da pauta`;
                    pautaBadge = `<button type="button" class="pauta-item-badge" data-pauta-item="${pautaItems[0].item}" title="Ver na Pauta / Ordem do Dia oficial da sessão">${escapeHtml(labelPauta)}</button>`;
                }

                const partesStr = Array.isArray(proc.partes) && proc.partes.length
                    ? proc.partes.slice(0, 4).map((p) => `${p.papel}: ${p.nome}`).join(' · ')
                    : '';

                card.innerHTML = `
                    <div class="process-card-top">
                        <div class="process-badges-left">
                            <span class="process-index-badge">Nº ${proc.index}</span>
                            ${pautaBadge}
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
                        ${proc.theme ? `<p class="process-number-code">${highlightMatches(proc.processNumber, state.searchQuery)}${proc.temaRepetitivo && !proc.processNumber.includes(proc.temaRepetitivo) && !proc.theme.includes(proc.temaRepetitivo) ? ` · <span class="tema-repetitivo-inline">${highlightMatches(proc.temaRepetitivo, state.searchQuery)}</span>` : ''}</p>` : ''}
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
                        ${proc.assuntoOficial ? `<span class="meta-pair"><strong>Assunto</strong> ${highlightMatches(proc.assuntoOficial, state.searchQuery)}</span>` : ''}
                        ${partesStr ? `<span class="meta-pair"><strong>Partes</strong> ${highlightMatches(partesStr, state.searchQuery)}</span>` : ''}
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
                        <div class="process-discussion-wrapper ${discussionCollapsed ? 'collapsed' : ''}">
                            <button type="button" class="process-discussion-toggle">
                                <span>${discussionCollapsed ? 'Mostrar resumo da discussão' : 'Ocultar resumo da discussão'}</span>
                            </button>
                            <p class="process-discussion-text">${highlightMatches(proc.resumoDiscussao, state.searchQuery)}</p>
                        </div>
                    ` : ''}
                `;

                const pautaBtn = card.querySelector('.pauta-item-badge');
                if (pautaBtn) {
                    pautaBtn.addEventListener('click', () => {
                        setViewMode('pauta', { focusPautaItem: pautaBtn.getAttribute('data-pauta-item') });
                    });
                }

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
                <div class="spotlight-header-actions">
                    <span class="column-section-count">${theses.length}</span>
                    <button type="button" class="btn-subtle read-all-theses-btn" title="Ler todas as teses em coluna larga, agrupadas por tipo">Ler todas</button>
                </div>
            </div>
            <ul class="theses-list">${thesesItemsMarkup}</ul>
        `;

        thesesPanel.querySelector('.read-all-theses-btn')?.addEventListener('click', () => setViewMode('theses'));

        thesesPanel.querySelectorAll('[data-jump-index]').forEach((btn) => {
            btn.addEventListener('click', () => {
                scrollToProcessCard(btn.getAttribute('data-jump-index'));
            });
        });

        asideCol.appendChild(thesesPanel);
        // Coluna de leitura única: resumo, destaques e processos com a mesma largura;
        // as teses ficam na lateral desde o topo
        const mainCol = document.createElement('div');
        mainCol.className = 'main-column';
        mainCol.append(...container.children, procsCol);
        columns.append(mainCol, asideCol);
        container.appendChild(columns);

        documentViewer.innerHTML = '';
        documentViewer.appendChild(container);
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

        applyTranscriptFontSize();
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

    // Tamanho do texto da transcrição: 14px a 22px, em rem para somar à preferência do navegador
    const applyTranscriptFontSize = () => {
        transcriptDrawerBody.setAttribute('data-font-size', String(state.transcriptFontSize));
        transcriptDrawerBody.style.fontSize = `${state.transcriptFontSize / 16}rem`;
    };

    transcriptFontDec?.addEventListener('click', () => {
        if (state.transcriptFontSize > 14) {
            state.transcriptFontSize -= 1;
            applyTranscriptFontSize();
        }
    });

    transcriptFontInc?.addEventListener('click', () => {
        if (state.transcriptFontSize < 22) {
            state.transcriptFontSize += 1;
            applyTranscriptFontSize();
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

    // Barra lateral: gaveta sobreposta no celular; coluna recolhível no desktop
    const appShell = document.querySelector('.app-shell');
    const isMobileLayout = () => window.matchMedia('(max-width: 860px)').matches;

    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');

    const isSidebarVisible = () => (isMobileLayout()
        ? sidebar.classList.contains('open')
        : !appShell.classList.contains('sidebar-collapsed'));

    const syncSidebarToggleLabel = () => {
        const visible = String(isSidebarVisible());
        mobileMenuBtn.setAttribute('aria-expanded', visible);
        sidebarCollapseBtn.setAttribute('aria-expanded', visible);
    };

    const setDesktopSidebarCollapsed = (collapsed) => {
        appShell.classList.toggle('sidebar-collapsed', collapsed);
        try {
            localStorage.setItem('stj_gmhb_sidebar', collapsed ? 'collapsed' : 'expanded');
        } catch (err) { /* preferência só não é lembrada */ }
        syncSidebarToggleLabel();
    };

    // O foco acompanha o controle: quem recolhe passa o foco ao botão de reabrir e vice-versa
    const hideSidebar = ({ moveFocus = false } = {}) => {
        if (isMobileLayout()) {
            closeMobileMenu();
        } else {
            setDesktopSidebarCollapsed(true);
        }
        if (moveFocus) mobileMenuBtn.focus();
    };

    const showSidebar = ({ moveFocus = false } = {}) => {
        if (isMobileLayout()) {
            openMobileMenu();
        } else {
            setDesktopSidebarCollapsed(false);
        }
        if (moveFocus) sidebarCollapseBtn.focus();
    };

    const toggleSidebar = () => (isSidebarVisible() ? hideSidebar() : showSidebar());

    sidebarCollapseBtn?.addEventListener('click', () => hideSidebar({ moveFocus: true }));
    mobileMenuBtn?.addEventListener('click', () => (isSidebarVisible()
        ? hideSidebar()
        : showSidebar({ moveFocus: true })));
    window.matchMedia('(max-width: 860px)').addEventListener('change', syncSidebarToggleLabel);

    try {
        appShell.classList.toggle('sidebar-collapsed', localStorage.getItem('stj_gmhb_sidebar') === 'collapsed');
    } catch (err) { /* sem armazenamento: começa expandida */ }
    syncSidebarToggleLabel();

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
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            toggleSidebar();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            // A busca fica na barra lateral: garante que ela esteja visível
            if (isMobileLayout()) {
                if (!sidebar.classList.contains('open')) openMobileMenu();
            } else if (appShell.classList.contains('sidebar-collapsed')) {
                setDesktopSidebarCollapsed(false);
            }
            syncSidebarToggleLabel();
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

    // O assistente pede para abrir uma sessão citada na resposta
    document.addEventListener('assistente:abrir-sessao', (e) => {
        const id = e.detail?.id;
        if (!id || !rawSessions.some((s) => s.id === id)) return;
        state.activeSessionId = id;
        renderSidebar();
        renderActiveSession();
        documentViewer.scrollTo({ top: 0 });
    });

    // Inicialização
    applyTheme(localStorage.getItem('stj_gmhb_theme') || 'light');
    populateFilterSelects();
    renderSidebar();
    renderActiveSession();
});
