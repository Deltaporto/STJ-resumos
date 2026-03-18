document.addEventListener('DOMContentLoaded', () => {
    const rawSessions = Array.isArray(window.resumosData) ? window.resumosData : [];
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const icons = {
        scale: '<path d="m16 16 3-8 3 8c-1 1.8-2.3 3-3 3s-2-.9-3-3Z"></path><path d="m2 16 3-8 3 8c-1 1.8-2.3 3-3 3s-2-.9-3-3Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h18"></path><path d="M4 7 2 3"></path><path d="M10 7 8 3"></path><path d="m14 7 2-4"></path><path d="m20 7 2-4"></path>',
        search: '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
        moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>',
        sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
        copy: '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
        printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><path d="M6 9V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"></path><rect x="6" y="14" width="12" height="8" rx="1"></rect>',
        'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path>',
        'building-2': '<path d="M6 22V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v18Z"></path><path d="M6 12H4a1 1 0 0 0-1 1v9"></path><path d="M18 9h2a1 1 0 0 1 1 1v12"></path><path d="M10 6h4"></path><path d="M10 10h4"></path><path d="M10 14h4"></path><path d="M10 18h4"></path>',
        youtube: '<path d="M2.5 17a24.1 24.1 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.1 24.1 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17"></path><path d="m10 15 5-3-5-3z"></path>',
        'chevron-down': '<path d="m6 9 6 6 6-6"></path>',
        'chevron-up': '<path d="m18 15-6-6-6 6"></path>',
        'arrow-up': '<path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path>',
        'chevrons-down-up': '<path d="m7 20 5-5 5 5"></path><path d="m7 4 5 5 5-5"></path>',
        'chevrons-up-down': '<path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path>',
        menu: '<line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line>',
        x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
        check: '<path d="M20 6 9 17l-5-5"></path>',
        'calendar-days': '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path>',
        'rows-3': '<path d="M21 6H3"></path><path d="M21 12H3"></path><path d="M21 18H3"></path>'
    };

    const sessionsList = document.getElementById('sessionsList');
    const searchInput = document.getElementById('searchInput');
    const documentViewer = document.getElementById('documentViewer');
    const docMeta = document.getElementById('docMeta');
    const themeToggle = document.getElementById('themeToggle');
    const copyBtn = document.getElementById('copyBtn');
    const printBtn = document.getElementById('printBtn');
    const watchBtn = document.getElementById('watchBtn');
    const resultsInfo = document.getElementById('resultsInfo');

    let activeSessionId = null;
    let accordionSequence = 0;

    const createIcon = (name, attributes = {}) => {
        const svg = document.createElementNS(svgNamespace, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = icons[name] || '';

        Object.entries(attributes).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                svg.setAttribute(key, value);
            }
        });

        return svg;
    };

    const renderIcons = (root = document) => {
        root.querySelectorAll('[data-lucide]').forEach((element) => {
            const iconName = element.getAttribute('data-lucide');
            if (!icons[iconName]) {
                return;
            }

            const svg = createIcon(iconName, {
                class: element.getAttribute('class'),
                style: element.getAttribute('style'),
                id: element.getAttribute('id'),
                role: element.getAttribute('role')
            });

            if (element.hasAttribute('aria-label')) {
                svg.setAttribute('aria-label', element.getAttribute('aria-label'));
                svg.removeAttribute('aria-hidden');
            }

            element.replaceWith(svg);
        });
    };

    const escapeHtml = (text) => String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const stripMarkdown = (text) => String(text)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#+\s+/gm, '')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizeText = (text) => stripMarkdown(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const sanitizeUrl = (url) => (/^https?:\/\//i.test(url.trim()) ? url.trim() : '#');

    const applyInlineFormatting = (text) => text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');

    const renderInlineMarkdown = (text) => {
        let html = escapeHtml(text);
        const linkTokens = [];

        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
            const token = `__LINK_TOKEN_${linkTokens.length}__`;
            const safeUrl = sanitizeUrl(url);
            const safeLabel = applyInlineFormatting(escapeHtml(label));

            linkTokens.push(
                `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`
            );

            return token;
        });

        html = applyInlineFormatting(html);

        linkTokens.forEach((linkMarkup, index) => {
            html = html.replace(`__LINK_TOKEN_${index}__`, linkMarkup);
        });

        return html;
    };

    const renderMarkdown = (markdown) => {
        const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
        const output = [];
        const paragraphBuffer = [];
        const listStack = [];

        const closeParagraph = () => {
            if (paragraphBuffer.length === 0) {
                return;
            }

            output.push(`<p>${renderInlineMarkdown(paragraphBuffer.join(' ').trim())}</p>`);
            paragraphBuffer.length = 0;
        };

        const closeListItem = () => {
            const currentList = listStack[listStack.length - 1];
            if (currentList && currentList.openItem) {
                output.push('</li>');
                currentList.openItem = false;
            }
        };

        const closeListsToIndent = (indent) => {
            while (listStack.length && listStack[listStack.length - 1].indent > indent) {
                closeListItem();
                const list = listStack.pop();
                output.push(`</${list.type}>`);
            }
        };

        const closeAllLists = () => closeListsToIndent(-1);

        lines.forEach((line) => {
            const trimmed = line.trim();

            if (!trimmed) {
                closeParagraph();
                return;
            }

            const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                closeParagraph();
                closeAllLists();
                const level = headingMatch[1].length;
                output.push(`<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
                return;
            }

            if (/^\s*---+\s*$/.test(line)) {
                closeParagraph();
                closeAllLists();
                output.push('<hr>');
                return;
            }

            const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
            if (listMatch) {
                closeParagraph();

                const indent = listMatch[1].length;
                const listType = /^\d+\.$/.test(listMatch[2]) ? 'ol' : 'ul';

                closeListsToIndent(indent);

                if (listStack.length && listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== listType) {
                    closeListItem();
                    const previousList = listStack.pop();
                    output.push(`</${previousList.type}>`);
                }

                if (!listStack.length || indent > listStack[listStack.length - 1].indent || listStack[listStack.length - 1].type !== listType) {
                    output.push(`<${listType}>`);
                    listStack.push({ type: listType, indent, openItem: false });
                } else {
                    closeListItem();
                }

                const currentList = listStack[listStack.length - 1];
                output.push(`<li>${renderInlineMarkdown(listMatch[3].trim())}`);
                currentList.openItem = true;
                return;
            }

            if (listStack.length) {
                const currentList = listStack[listStack.length - 1];
                const indent = line.match(/^\s*/)[0].length;

                if (indent > currentList.indent && currentList.openItem) {
                    output.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
                    return;
                }

                closeAllLists();
            }

            paragraphBuffer.push(trimmed);
        });

        closeParagraph();
        closeAllLists();

        return output.join('\n');
    };

    const extractYoutubeUrl = (content) => {
        const match = content.match(/\[.*?\]\((https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+)\)/);
        return match ? match[1] : null;
    };

    const parseSections = (content) => {
        const lines = content.replace(/\r\n?/g, '\n').split('\n');
        const sections = [];
        let currentSection = null;

        lines.forEach((line) => {
            const headingMatch = line.match(/^##\s+(.*)$/);
            if (headingMatch) {
                currentSection = {
                    title: stripMarkdown(headingMatch[1]),
                    lines: []
                };
                sections.push(currentSection);
                return;
            }

            if (currentSection) {
                currentSection.lines.push(line);
            }
        });

        return sections;
    };

    const findSection = (content, keywords) => {
        const normalizedKeywords = keywords.map((keyword) => normalizeText(keyword));
        return parseSections(content).find((section) => {
            const title = normalizeText(section.title);
            return normalizedKeywords.some((keyword) => title.includes(keyword));
        }) || null;
    };

    const extractLeadParagraph = (content) => {
        const lines = content.replace(/\r\n?/g, '\n').split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            if (/^##\s+/.test(trimmed)) {
                break;
            }

            if (trimmed.startsWith('#') || trimmed === '---' || trimmed.startsWith('- ') || /^\d+\.\s+/.test(trimmed)) {
                continue;
            }

            if (/^\*\*(Vídeo|Data|Órgão):/i.test(trimmed)) {
                continue;
            }

            if (/^\*Resumo gerado via Gemini Pro/i.test(trimmed) || /^\*Transcrição obtida automaticamente/i.test(trimmed)) {
                continue;
            }

            return stripMarkdown(trimmed);
        }

        const resumoMatch = content.match(/^- \*\*Resumo da discussão:\*\*\s*(.+)$/im)
            || content.match(/^- \*\*Resumo:\*\*\s*(.+)$/im);
        if (resumoMatch && resumoMatch[1]) {
            return stripMarkdown(resumoMatch[1]);
        }

        const highlights = extractHighlights(content);
        if (highlights.length > 0) {
            return highlights[0];
        }

        return 'Resumo consolidado da sessao, organizado para leitura editorial e navegacao por processo.';
    };

    const countProcesses = (content) => {
        const h3Count = (content.match(/^###\s+/gm) || []).length;
        const boldCount = (content.match(/^\*\*(\d+|\[.*?\])\./gm) || []).length;
        return Math.max(h3Count, boldCount, 0);
    };

    const extractHighlights = (content) => {
        const section = findSection(content, ['destaques', 'destaques institucionais', 'destaques da sessão']);
        if (!section) {
            return [];
        }

        return section.lines
            .map((line) => line.trim())
            .filter((line) => line.startsWith('- '))
            .map((line) => stripMarkdown(line.replace(/^-+\s*/, '')))
            .slice(0, 5);
    };

    const extractRelatores = (content) => {
        const matches = content.matchAll(/-\s*\*\*Relator:\*\*\s*(?:Min\.)?\s*([^\*\n\r]+)/gi);
        const relatores = [];
        for (const match of matches) {
            if (match[1]) {
                const name = match[1].trim().replace(/[\.,]+$/, '');
                if (name.length > 3) {
                    relatores.push(name);
                }
            }
        }
        return [...new Set(relatores)];
    };

    const extractTheses = (content) => {
        const lines = content.split('\n');
        const theses = [];
        let capturingSubItems = false;
        let currentProcessTitle = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Rastrear o processo atual para associar a tese
            const isHeadingProcess = line.match(/^###\s+(.*)$/);
            const isParagraphProcess = line.match(/^\*\*(\d+|\[.*?\])\.\s*(.*?)\*\*/);
            
            if (isHeadingProcess) {
                currentProcessTitle = stripMarkdown(isHeadingProcess[1]);
            } else if (isParagraphProcess) {
                currentProcessTitle = stripMarkdown(isParagraphProcess[2]);
            }

            const headerMatch = line.match(/^\s*-\s*\*\*Tese\s+fixada:\*\*\s*(.*)$/i);

            if (headerMatch) {
                const inlineContent = headerMatch[1].trim();
                if (inlineContent) {
                    theses.push({
                        text: stripMarkdown(inlineContent),
                        processTitle: currentProcessTitle
                    });
                    capturingSubItems = false;
                } else {
                    capturingSubItems = true;
                }
                continue;
            }

            if (capturingSubItems) {
                if (line.match(/^\s*-?\s*\*\*/) || line.match(/^##/) || (line.trim() === '' && theses.length > 0)) {
                    capturingSubItems = false;
                    continue;
                }

                const subItemMatch = line.match(/^\s*(\d+\.|-|\*)\s*(.*)$/);
                if (subItemMatch) {
                    const subContent = subItemMatch[2].trim();
                    if (subContent) {
                        theses.push({
                            text: stripMarkdown(subContent),
                            processTitle: currentProcessTitle
                        });
                    }
                }
            }
        }
        
        return theses.filter((t) => t.text.length > 8);
    };

    const extractStats = (content) => {
        const section = findSection(content, ['estatisticas', 'estatísticas']);
        if (!section) {
            return [];
        }

        return section.lines
            .map((line) => line.trim())
            .filter((line) => line.startsWith('- '))
            .map((line) => {
                const richMatch = line.match(/^-+\s+\*\*(.+?)\*\*:\s*(.+)$/);
                const plainMatch = line.match(/^-+\s+(.+?):\s*(.+)$/);
                const match = richMatch || plainMatch;

                if (!match) {
                    return null;
                }

                return {
                    label: stripMarkdown(match[1]),
                    value: stripMarkdown(match[2])
                };
            })
            .filter(Boolean);
    };

    const buildPrimaryStats = (session) => {
        const getStat = (keyword) => session.stats.find((item) => normalizeText(item.label).includes(keyword));

        return [
            {
                label: 'Processos mapeados',
                value: String(session.processCount || 0)
            },
            getStat('providos'),
            getStat('desprovidos'),
            getStat('outros') || getStat('parcialmente')
        ].filter(Boolean);
    };

    const getCompactStatMeta = (item) => {
        const fullValue = String(item.value).trim();
        const leadingNumber = fullValue.match(/^\d+/);

        if (leadingNumber && fullValue.length > leadingNumber[0].length + 2) {
            return {
                displayValue: leadingNumber[0],
                fullValue
            };
        }

        return {
            displayValue: fullValue,
            fullValue
        };
    };

    const sessions = rawSessions.map((session, index) => {
        const edition = index + 1;
        return {
            ...session,
            edition,
            editionLabel: String(edition).padStart(2, '0'),
            processCount: countProcesses(session.content),
            videoUrl: extractYoutubeUrl(session.content),
            summary: extractLeadParagraph(session.content),
            highlights: extractHighlights(session.content),
            theses: extractTheses(session.content),
            stats: extractStats(session.content),
            relatores: extractRelatores(session.content)
        };
    });

    const allRelatores = [...new Set(sessions.flatMap(s => s.relatores))].sort();

    const updateResultsInfo = (filteredSessions, filter) => {
        if (!resultsInfo) {
            return;
        }

        const count = filteredSessions.length;
        const total = sessions.length;
        const suffix = filter
            ? ` para "${filter.trim()}"`
            : '';

        if (count === total && !filter.trim()) {
            resultsInfo.textContent = `${count} sessoes no arquivo`;
            return;
        }

        resultsInfo.textContent = `${count} ${count === 1 ? 'sessao encontrada' : 'sessoes encontradas'}${suffix}`;
    };

    const buildTimestampUrl = (sessionUrl, seconds) => {
        try {
            const url = new URL(sessionUrl);
            url.searchParams.set('t', `${seconds}s`);
            return url.toString();
        } catch (error) {
            const separator = sessionUrl.includes('?') ? '&' : '?';
            return `${sessionUrl}${separator}t=${seconds}s`;
        }
    };

    const parseTimestampToSeconds = (timestamp) => {
        const timeParts = timestamp.split(':').reverse();
        let seconds = 0;

        if (timeParts[0]) {
            seconds += Number.parseInt(timeParts[0], 10);
        }

        if (timeParts[1]) {
            seconds += Number.parseInt(timeParts[1], 10) * 60;
        }

        if (timeParts[2]) {
            seconds += Number.parseInt(timeParts[2], 10) * 3600;
        }

        return seconds;
    };

    const setAccordionOpenState = (header, content, isOpen) => {
        header.classList.toggle('open', isOpen);
        header.setAttribute('aria-expanded', String(isOpen));
        content.setAttribute('aria-hidden', String(!isOpen));

        if (isOpen) {
            content.style.maxHeight = `${content.scrollHeight}px`;
            content.style.opacity = '1';

            const onTransitionEnd = () => {
                if (header.getAttribute('aria-expanded') === 'true') {
                    content.style.maxHeight = 'none';
                }

                content.removeEventListener('transitionend', onTransitionEnd);
            };

            content.addEventListener('transitionend', onTransitionEnd);
        } else {
            content.style.maxHeight = `${content.scrollHeight}px`;
            content.offsetHeight; // force reflow
            content.style.maxHeight = '0px';
            content.style.opacity = '0';
        }
    };

    const closeOpenAccordions = (root, exceptHeader = null) => {
        root.querySelectorAll('.process-accordion-header.open').forEach((openHeader) => {
            if (openHeader === exceptHeader) {
                return;
            }

            const openContent = openHeader.nextElementSibling;
            if (openContent && openContent.classList.contains('process-accordion-content')) {
                setAccordionOpenState(openHeader, openContent, false);
            }
        });
    };

    const scrollAccordionIntoView = (header, behavior = 'auto') => {
        const viewerRect = documentViewer.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const targetTop = documentViewer.scrollTop + headerRect.top - viewerRect.top - 14;
        const nextTop = Math.max(targetTop, 0);

        if (behavior === 'smooth') {
            documentViewer.scrollTo({
                top: nextTop,
                behavior: 'smooth'
            });
            return;
        }

        documentViewer.scrollTop = nextTop;
    };

    const scrollToProcess = (processTitle) => {
        if (!processTitle) return;
        
        const normalizedTarget = normalizeText(processTitle);
        const headers = Array.from(documentViewer.querySelectorAll('.process-accordion-header'));
        
        const targetHeader = headers.find(header => {
            const titleEl = header.querySelector('.accordion-title');
            return titleEl && normalizeText(titleEl.textContent).includes(normalizedTarget);
        });

        if (targetHeader) {
            const content = targetHeader.nextElementSibling;
            if (content && content.classList.contains('process-accordion-content')) {
                const isOpen = targetHeader.getAttribute('aria-expanded') === 'true';
                if (!isOpen) {
                    closeOpenAccordions(documentViewer.querySelector('.markdown-body'), targetHeader);
                    setAccordionOpenState(targetHeader, content, true);
                }
                
                setTimeout(() => {
                    scrollAccordionIntoView(targetHeader, 'smooth');
                    targetHeader.classList.add('highlight-flash');
                    setTimeout(() => targetHeader.classList.remove('highlight-flash'), 2000);
                }, 100);
            }
        }
    };

    const scheduleAccordionScroll = (header) => {
        if (header._scrollTimer) {
            window.clearTimeout(header._scrollTimer);
        }

        const runSmoothScroll = () => scrollAccordionIntoView(header, 'smooth');

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(runSmoothScroll);
        });

        header._scrollTimer = window.setTimeout(() => {
            scrollAccordionIntoView(header, 'auto');
            header._scrollTimer = null;
        }, 380);
    };

    const enhanceAccordionHeader = (header, sessionUrl, root) => {
        accordionSequence += 1;

        const headerId = `process-header-${accordionSequence}`;
        const contentId = `process-content-${accordionSequence}`;
        const timeRegex = /\(In[ií]cio:\s*((\d+:)?\d+:\d{2})\)/i;
        const rawHtml = header.innerHTML;
        const timestampMatch = rawHtml.match(timeRegex) || header.textContent.match(timeRegex);
        
        let cleanedHtml = rawHtml;
        if (timestampMatch && sessionUrl) {
            cleanedHtml = rawHtml.replace(timeRegex, '').trim();
        }

        header.classList.add('process-accordion-header');
        header.id = headerId;
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('aria-controls', contentId);
        header.innerHTML = '';

        const title = document.createElement('span');
        title.className = 'accordion-title';
        title.innerHTML = cleanedHtml;
        header.appendChild(title);

        const meta = document.createElement('span');
        meta.className = 'accordion-meta';
        header.appendChild(meta);

        if (timestampMatch && sessionUrl) {
            const timestamp = timestampMatch[1];
            const timestampLink = document.createElement('a');
            timestampLink.href = buildTimestampUrl(sessionUrl, parseTimestampToSeconds(timestamp));
            timestampLink.target = '_blank';
            timestampLink.rel = 'noopener noreferrer';
            timestampLink.className = 'timestamp-link';
            timestampLink.setAttribute('aria-label', `Abrir video no tempo ${timestamp}`);
            timestampLink.append(createIcon('youtube', { class: 'timestamp-icon' }));
            timestampLink.append(document.createTextNode(timestamp));
            meta.appendChild(timestampLink);
        }

        meta.appendChild(createIcon('chevron-down', { class: 'accordion-icon' }));

        const content = document.createElement('div');
        content.id = contentId;
        content.className = 'process-accordion-content';
        content.setAttribute('role', 'region');
        content.setAttribute('aria-labelledby', headerId);
        content.setAttribute('aria-hidden', 'true');

        const toggleAccordion = () => {
            const isOpen = header.getAttribute('aria-expanded') === 'true';

            if (!isOpen) {
                closeOpenAccordions(root, header);
            }

            setAccordionOpenState(header, content, !isOpen);

            if (!isOpen) {
                scheduleAccordionScroll(header);
            }
        };

        header.addEventListener('click', (event) => {
            if (event.target.closest('.timestamp-link')) {
                return;
            }

            toggleAccordion();
        });

        header.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleAccordion();
            }
        });

        return content;
    };

    const buildAccordions = (session) => {
        const body = documentViewer.querySelector('.markdown-body');
        if (!body) {
            return;
        }

        const children = Array.from(body.children);
        let currentContent = null;

        children.forEach((child) => {
            const isHeadingProcess = child.tagName === 'H3';
            const isParagraphProcess = child.tagName === 'P'
                && child.firstElementChild
                && child.firstElementChild.tagName === 'STRONG'
                && /^(\d+|\[.*?\])\./.test(child.firstElementChild.textContent.trim());

            if (isHeadingProcess || isParagraphProcess) {
                currentContent = enhanceAccordionHeader(child, session.videoUrl, body);
                child.parentNode.insertBefore(currentContent, child.nextSibling);
                return;
            }

            if (currentContent && !['H1', 'H2', 'HR'].includes(child.tagName)) {
                currentContent.appendChild(child);
                return;
            }

            if (['H2', 'HR'].includes(child.tagName)) {
                currentContent = null;
            }
        });

        const firstHeader = body.querySelector('.process-accordion-header');
        const firstContent = firstHeader ? firstHeader.nextElementSibling : null;
        if (firstHeader && firstContent && firstContent.classList.contains('process-accordion-content')) {
            setAccordionOpenState(firstHeader, firstContent, true);
        }
    };

    const buildHeroCard = (session) => {
        const heroCard = document.createElement('section');
        heroCard.className = 'hero-card hero-card--document reveal-target';
        heroCard.innerHTML = `
            <div class="hero-kicker-row">
                <span class="hero-kicker">Caderno de Sessao</span>
                <span class="hero-edition">Edicao ${session.editionLabel}</span>
            </div>

            <h2 class="meta-title">${escapeHtml(session.title)}</h2>
            <p class="meta-summary">${escapeHtml(session.summary)}</p>

            <div class="hero-chip-row">
                <span class="hero-chip">
                    <i data-lucide="calendar-days"></i>
                    ${escapeHtml(session.date)}
                </span>
                <span class="hero-chip">
                    <i data-lucide="building-2"></i>
                    ${escapeHtml(session.orgao)}
                </span>
                <span class="hero-chip">
                    <i data-lucide="rows-3"></i>
                    ${escapeHtml(String(session.processCount))} processos
                </span>
            </div>
        `;

        renderIcons(heroCard);
        return heroCard;
    };

    const renderHeaderMeta = (session) => {
        docMeta.innerHTML = `
            <div class="doc-meta-compact">
                <div class="doc-meta-copy">
                    <span class="doc-meta-kicker">Sessao ativa · Edicao ${session.editionLabel}</span>
                    <p class="doc-meta-title">${escapeHtml(session.title)}</p>
                    <div class="doc-meta-details">
                        <span class="doc-meta-detail">${escapeHtml(session.date)}</span>
                        <span class="doc-meta-detail">${escapeHtml(session.orgao)}</span>
                        <span class="doc-meta-detail">${escapeHtml(String(session.processCount))} processos</span>
                    </div>
                </div>
            </div>
        `;
    };

    const renderWatchAction = (session) => {
        if (!session.videoUrl) {
            watchBtn.hidden = true;
            watchBtn.setAttribute('href', '#');
            return;
        }

        watchBtn.hidden = false;
        watchBtn.setAttribute('href', session.videoUrl);
        watchBtn.setAttribute('aria-label', `Assistir video da sessao ${session.title}`);
    };

    const renderSidebar = (filter = '') => {
        const normalizedFilter = filter.trim().toLowerCase();
        sessionsList.innerHTML = '';
        
        const relatorSelect = document.getElementById('relatorSelect');
        const relatorFilter = relatorSelect ? relatorSelect.value : '';

        const filteredSessions = sessions.filter((session) => {
            const matchesText = !normalizedFilter
                || session.title.toLowerCase().includes(normalizedFilter)
                || session.orgao.toLowerCase().includes(normalizedFilter)
                || session.date.toLowerCase().includes(normalizedFilter);
                
            const matchesRelator = !relatorFilter || session.relatores.includes(relatorFilter);
            
            return matchesText && matchesRelator;
        });

        updateResultsInfo(filteredSessions, filter);

        if (filteredSessions.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'sessions-empty-state';
            emptyMessage.textContent = 'Nenhum resumo encontrado para esse filtro.';
            sessionsList.appendChild(emptyMessage);
            return;
        }

        const highlightMatch = (text, query) => {
            if (!query) {
                return escapeHtml(text);
            }

            const escaped = escapeHtml(text);
            const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${safeQuery})`, 'gi');
            return escaped.replace(regex, '<mark>$1</mark>');
        };

        filteredSessions.forEach((session, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `session-item ${session.id === activeSessionId ? 'active' : ''}`;
            button.style.setProperty('--delay', `${index * 60}ms`);
            button.setAttribute('aria-pressed', String(session.id === activeSessionId));
            button.setAttribute('aria-label', `Abrir resumo ${session.title}`);

            // Build content safely — all user text is escaped via escapeHtml before any HTML wrapping
            const titleHtml = highlightMatch(session.title, normalizedFilter);
            const dateHtml = highlightMatch(session.date, normalizedFilter);
            const orgaoHtml = highlightMatch(session.orgao, normalizedFilter);

            const topDiv = document.createElement('div');
            topDiv.className = 'session-item-top';

            const indexSpan = document.createElement('span');
            indexSpan.className = 'session-index';
            indexSpan.textContent = `Ed. ${session.editionLabel}`;
            topDiv.appendChild(indexSpan);

            const countSpan = document.createElement('span');
            countSpan.className = 'session-count';
            countSpan.textContent = `${session.processCount} processos`;
            topDiv.appendChild(countSpan);

            button.appendChild(topDiv);

            const titleSpan = document.createElement('span');
            titleSpan.className = 'session-title';
            titleSpan.innerHTML = titleHtml;
            button.appendChild(titleSpan);

            const metaDiv = document.createElement('div');
            metaDiv.className = 'session-meta-row';

            const dateSpan = document.createElement('span');
            dateSpan.className = 'session-date';
            dateSpan.appendChild(createIcon('calendar-days', { width: '14', height: '14' }));
            const dateText = document.createElement('span');
            dateText.innerHTML = dateHtml;
            dateSpan.appendChild(dateText);
            metaDiv.appendChild(dateSpan);

            const orgaoSpan = document.createElement('span');
            orgaoSpan.className = 'session-orgao';
            orgaoSpan.appendChild(createIcon('building-2', { width: '14', height: '14' }));
            const orgaoText = document.createElement('span');
            orgaoText.innerHTML = orgaoHtml;
            orgaoSpan.appendChild(orgaoText);
            metaDiv.appendChild(orgaoSpan);

            button.appendChild(metaDiv);

            button.addEventListener('click', () => selectSession(session.id));
            sessionsList.appendChild(button);
        });
    };

    const buildStatsMarkup = (session) => buildPrimaryStats(session)
        .map((item) => `
            <div class="stat-card">
                <span class="stat-label">${escapeHtml(item.label)}</span>
                <span class="stat-value">${escapeHtml(item.value)}</span>
            </div>
        `)
        .join('');

    const buildHighlightsMarkup = (session) => {
        if (!session.highlights.length) {
            return '<p>Nenhum destaque institucional extraido automaticamente para esta sessao.</p>';
        }

        return `
            <ul class="aside-highlights">
                ${session.highlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join('')}
            </ul>
        `;
    };

    const setupScrollReveals = () => {
        const targets = documentViewer.querySelectorAll('.reveal-target');
        if (!targets.length) {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { root: documentViewer, threshold: 0.1 });

        targets.forEach((target) => observer.observe(target));
    };

    const animateStats = () => {
        const statValues = documentViewer.querySelectorAll('.stat-value[data-target]');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                const el = entry.target;
                const targetText = el.getAttribute('data-target');
                const targetNum = Number.parseInt(targetText, 10);
                observer.unobserve(el);

                if (Number.isNaN(targetNum)) {
                    el.textContent = targetText;
                    return;
                }

                const duration = 800;
                const startTime = performance.now();

                const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

                const tick = (now) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const eased = easeOutQuart(progress);
                    el.textContent = String(Math.round(eased * targetNum));

                    if (progress < 1) {
                        requestAnimationFrame(tick);
                    } else {
                        el.textContent = targetText;
                    }
                };

                requestAnimationFrame(tick);
            });
        }, { root: documentViewer, threshold: 0.3 });

        statValues.forEach((el) => observer.observe(el));
    };

    const addResultBadges = () => {
        documentViewer.querySelectorAll('.accordion-title').forEach((title) => {
            const text = title.textContent.toLowerCase();
            const patterns = [
                { regex: /\bneg\w*\s+provimento\b|\bdesprovid[oa]\b|\bimprovid[oa]\b/, cls: 'desprovido', label: 'Desprovido' },
                { regex: /\bparcial\w*\s+provid[oa]\b|\bprovid[oa]\s+em\s+parte\b/, cls: 'parcial', label: 'Parcial' },
                { regex: /\bprovid[oa]\b|\bdeu[\s-]+provimento\b/, cls: 'provido', label: 'Provido' },
                { regex: /\bsuspens[oa]\b|\bsuspenso\b/, cls: 'suspenso', label: 'Suspenso' },
                { regex: /\badiad[oa]\b|\bretirad[oa]\b/, cls: 'adiado', label: 'Adiado' }
            ];

            for (const { regex, cls, label } of patterns) {
                if (regex.test(text)) {
                    const badge = document.createElement('span');
                    badge.className = `result-badge result-badge--${cls}`;
                    badge.textContent = label;
                    title.parentNode.querySelector('.accordion-meta')?.prepend(badge);
                    break;
                }
            }
        });
    };

    const addDropCaps = () => {
        documentViewer.querySelectorAll('.process-accordion-content').forEach((content) => {
            const firstP = content.querySelector('p');
            if (firstP && firstP.textContent.trim().length > 40) {
                firstP.classList.add('drop-cap');
            }
        });
    };

    const addPullQuotes = () => {
        documentViewer.querySelectorAll('.process-accordion-content p').forEach((p) => {
            if (/tese\s+fixada/i.test(p.textContent)) {
                const quote = document.createElement('blockquote');
                quote.className = 'pull-quote';
                quote.innerHTML = p.innerHTML;
                p.replaceWith(quote);
            }
        });
    };

    const renderDocument = (session) => {
        accordionSequence = 0;
        const renderedHtml = renderMarkdown(session.content);

        const progressBar = document.createElement('div');
        progressBar.className = 'reading-progress';
        progressBar.setAttribute('role', 'progressbar');
        progressBar.setAttribute('aria-label', 'Progresso de leitura');

        const layout = document.createElement('div');
        layout.className = 'reader-layout';

        const heroCard = buildHeroCard(session);

        const overviewSection = document.createElement('section');
        overviewSection.className = 'overview-strip reveal-target';

        const overviewStats = document.createElement('div');
        overviewStats.className = 'overview-card';
        const statsLabel = document.createElement('span');
        statsLabel.className = 'panel-label';
        statsLabel.textContent = 'Quadro da sessao';
        const statsGrid = document.createElement('div');
        statsGrid.className = 'stat-grid';
        buildPrimaryStats(session).forEach((item) => {
            const statMeta = getCompactStatMeta(item);
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.title = statMeta.fullValue;
            const sl = document.createElement('span');
            sl.className = 'stat-label';
            sl.textContent = item.label;
            const sv = document.createElement('span');
            sv.className = 'stat-value';
            sv.setAttribute('data-target', statMeta.displayValue);
            sv.textContent = '0';
            card.append(sl, sv);
            statsGrid.appendChild(card);
        });
        overviewStats.append(statsLabel, statsGrid);

        overviewSection.append(overviewStats);

        const readerColumns = document.createElement('div');
        readerColumns.className = 'reader-columns';

        const readerPaper = document.createElement('div');
        readerPaper.className = 'reader-paper reveal-target';

        const paperHead = document.createElement('div');
        paperHead.className = 'paper-head';

        const kickerSpan = document.createElement('span');
        kickerSpan.className = 'paper-kicker';
        kickerSpan.textContent = 'Leitura integral';

        const toggleAllBtn = document.createElement('button');
        toggleAllBtn.type = 'button';
        toggleAllBtn.className = 'toggle-all-btn';
        toggleAllBtn.setAttribute('aria-label', 'Expandir todos os processos');
        toggleAllBtn.appendChild(createIcon('chevrons-up-down', {}));
        const toggleLabel = document.createElement('span');
        toggleLabel.textContent = 'Expandir todos';
        toggleAllBtn.appendChild(toggleLabel);

        const chipSpan = document.createElement('span');
        chipSpan.className = 'paper-chip';
        chipSpan.textContent = 'Navegacao por processo';

        paperHead.append(kickerSpan, toggleAllBtn, chipSpan);

        const markdownBody = document.createElement('div');
        markdownBody.className = 'markdown-body';
        markdownBody.innerHTML = renderedHtml;

        readerPaper.append(paperHead, markdownBody);

        const aside = document.createElement('aside');
        aside.className = 'reader-aside';

        const asideCard1 = document.createElement('section');
        asideCard1.className = 'aside-card reveal-target';
        const asideLabel1 = document.createElement('span');
        asideLabel1.className = 'panel-label';
        asideLabel1.textContent = 'Tesauro de Teses';
        asideCard1.appendChild(asideLabel1);

        if (session.theses && session.theses.length) {
            const ul = document.createElement('ul');
            ul.className = 'aside-highlights aside-theses';
            session.theses.forEach((t) => {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'thesis-nav-btn';
                btn.textContent = t.text;
                btn.title = t.processTitle ? `Ir para julgado: ${t.processTitle}` : 'Navegar para este julgado';
                
                btn.addEventListener('click', () => {
                    scrollToProcess(t.processTitle);
                });
                
                li.appendChild(btn);
                ul.appendChild(li);
            });
            asideCard1.appendChild(ul);
        } else {
            const noHighlights = document.createElement('p');
            noHighlights.textContent = 'Nenhuma tese extraída para esta sessão.';
            asideCard1.appendChild(noHighlights);
        }

        const asideCard2 = document.createElement('section');
        asideCard2.className = 'aside-card aside-card-accent reveal-target';
        const asideLabel2 = document.createElement('span');
        asideLabel2.className = 'panel-label';
        asideLabel2.textContent = 'Leitura guiada';
        const guideP = document.createElement('p');
        guideP.textContent = 'Abra um processo por vez para manter a pauta limpa e comparavel. O video da sessao fica disponivel no topo para consulta paralela.';
        asideCard2.append(asideLabel2, guideP);

        aside.append(asideCard1, asideCard2);
        readerColumns.append(readerPaper, aside);
        layout.append(heroCard, overviewSection, readerColumns);

        documentViewer.textContent = '';
        documentViewer.append(progressBar, layout);

        buildAccordions(session);
        addResultBadges();
        addDropCaps();
        addPullQuotes();
        setupScrollReveals();
        animateStats();

        // Toggle all accordions
        let allExpanded = false;
        toggleAllBtn.addEventListener('click', () => {
            allExpanded = !allExpanded;
            const headers = markdownBody.querySelectorAll('.process-accordion-header');
            headers.forEach((header) => {
                const content = header.nextElementSibling;
                if (content && content.classList.contains('process-accordion-content')) {
                    setAccordionOpenState(header, content, allExpanded);
                }
            });
            toggleAllBtn.textContent = '';
            toggleAllBtn.appendChild(createIcon(allExpanded ? 'chevrons-down-up' : 'chevrons-up-down', {}));
            const newLabel = document.createElement('span');
            newLabel.textContent = allExpanded ? 'Recolher todos' : 'Expandir todos';
            toggleAllBtn.appendChild(newLabel);
            toggleAllBtn.setAttribute('aria-label', allExpanded ? 'Recolher todos os processos' : 'Expandir todos os processos');
        });

        // Filtragem interna por relator selecionado
        const relatorSelect = document.getElementById('relatorSelect');
        const currentRelator = relatorSelect ? relatorSelect.value : '';
        if (currentRelator) {
            const headers = markdownBody.querySelectorAll('.process-accordion-header');
            let firstMatch = true;
            
            headers.forEach((h) => {
                const content = h.nextElementSibling;
                const isContentMatch = content && content.textContent.toLowerCase().includes(`relator: min. ${currentRelator.toLowerCase()}`);
                const isTitleMatch = h.textContent.toLowerCase().includes(currentRelator.toLowerCase());
                
                if (isContentMatch || isTitleMatch) {
                    h.style.display = '';
                    if (content) {
                        content.style.display = '';
                        setAccordionOpenState(h, content, true);
                    }
                    if (firstMatch) {
                        firstMatch = false;
                        setTimeout(() => h.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
                    }
                } else {
                    h.style.display = 'none';
                    if (content) {
                        content.style.display = 'none';
                        h.classList.remove('open');
                    }
                }
            });
        }

        documentViewer.scrollTop = 0;

        // Focus management (Phase 5.2)
        const readerHero = documentViewer.querySelector('.hero-card');
        if (readerHero) {
            readerHero.setAttribute('tabindex', '-1');
            readerHero.focus({ preventScroll: true });
        }
    };

    // ─── Mobile drawer (declarations) ───

    const sidebar = document.querySelector('.sidebar');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    const openMobileDrawer = () => {
        sidebar.classList.add('sidebar--open');
        backdrop.classList.add('active');
        requestAnimationFrame(() => backdrop.classList.add('visible'));
        document.body.style.overflow = 'hidden';
        hamburgerBtn?.setAttribute('aria-expanded', 'true');
    };

    const closeMobileDrawer = () => {
        sidebar.classList.remove('sidebar--open');
        backdrop.classList.remove('visible');
        window.setTimeout(() => backdrop.classList.remove('active'), 300);
        document.body.style.overflow = '';
        hamburgerBtn?.setAttribute('aria-expanded', 'false');
    };

    const selectSession = (id) => {
        activeSessionId = id;
        renderSidebar(searchInput.value);

        const session = sessions.find((item) => item.id === id);
        if (!session) {
            return;
        }

        // Crossfade transition
        documentViewer.classList.add('viewer-transitioning');

        window.setTimeout(() => {
            renderHeaderMeta(session);
            renderWatchAction(session);
            renderDocument(session);
            documentViewer.classList.remove('viewer-transitioning');
        }, 150);

        // Close mobile drawer if open
        closeMobileDrawer();
    };

    const setThemeState = (theme) => {
        const isDark = theme === 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        const darkIcon = document.querySelector('.theme-icon-dark');
        const lightIcon = document.querySelector('.theme-icon-light');
        const themeText = document.querySelector('.theme-text');

        if (darkIcon) {
            darkIcon.style.display = isDark ? 'none' : 'block';
        }

        if (lightIcon) {
            lightIcon.style.display = isDark ? 'block' : 'none';
        }

        if (themeText) {
            themeText.textContent = isDark ? 'Modo Claro' : 'Modo Noturno';
        }

        themeToggle.setAttribute('aria-pressed', String(isDark));
        themeToggle.setAttribute(
            'aria-label',
            isDark
                ? 'Tema escuro ativado. Alternar para modo claro'
                : 'Tema claro ativado. Alternar para modo escuro'
        );
    };

    const setButtonState = (button, iconName, label) => {
        const iconClass = button.id === 'copyBtn' ? 'action-btn-icon' : 'action-btn-icon';
        button.innerHTML = '';
        button.appendChild(createIcon(iconName, { class: iconClass }));

        const span = document.createElement('span');
        span.className = 'action-label';
        span.textContent = label;
        button.appendChild(span);
    };

    renderIcons();
    renderSidebar();
    setThemeState(localStorage.getItem('theme') || 'light');

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        setThemeState(currentTheme === 'dark' ? 'light' : 'dark');
    });

    searchInput.addEventListener('input', (event) => {
        renderSidebar(event.target.value);
    });

    const relatorSelect = document.getElementById('relatorSelect');
    if (relatorSelect) {
        allRelatores.forEach(relator => {
            const option = document.createElement('option');
            option.value = relator;
            option.textContent = relator;
            relatorSelect.appendChild(option);
        });
        
        relatorSelect.addEventListener('change', () => {
            renderSidebar(searchInput.value);
            if (activeSessionId) {
                const session = sessions.find(s => s.id === activeSessionId);
                if (session) renderDocument(session);
            }
        });
    }

    copyBtn.addEventListener('click', async () => {
        if (!activeSessionId) {
            return;
        }

        const session = sessions.find((item) => item.id === activeSessionId);
        if (!session) {
            return;
        }

        try {
            await navigator.clipboard.writeText(session.content);
            setButtonState(copyBtn, 'check', 'Copiado');

            window.setTimeout(() => {
                setButtonState(copyBtn, 'copy', 'Copiar');
            }, 1800);
        } catch (error) {
            console.error('Falha ao copiar resumo:', error);
            setButtonState(copyBtn, 'copy', 'Copiar');
        }
    });

    printBtn.addEventListener('click', () => {
        window.print();
    });

    // ─── Reading progress bar ───

    let progressRaf = null;
    documentViewer.addEventListener('scroll', () => {
        if (progressRaf) {
            return;
        }

        progressRaf = requestAnimationFrame(() => {
            const bar = documentViewer.querySelector('.reading-progress');
            const { scrollTop, scrollHeight, clientHeight } = documentViewer;
            const progress = scrollHeight <= clientHeight ? 0 : scrollTop / (scrollHeight - clientHeight);

            if (bar) {
                bar.style.setProperty('--progress', String(Math.min(progress, 1)));
            }

            // Back-to-top visibility
            const backToTop = document.querySelector('.back-to-top');
            if (backToTop) {
                backToTop.classList.toggle('visible', scrollTop > 400);
            }

            progressRaf = null;
        });
    });

    // ─── Back-to-top button ───

    const backToTop = document.createElement('button');
    backToTop.type = 'button';
    backToTop.className = 'back-to-top';
    backToTop.setAttribute('aria-label', 'Voltar ao topo');
    backToTop.appendChild(createIcon('arrow-up', {}));
    backToTop.addEventListener('click', () => {
        documentViewer.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(backToTop);

    // ─── Keyboard shortcuts ───

    document.addEventListener('keydown', (event) => {
        // Ctrl+K → focus search
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            searchInput.focus();
            searchInput.select();
            return;
        }

        // Arrow navigation between accordion headers
        const activeEl = document.activeElement;
        if (activeEl && activeEl.classList.contains('process-accordion-header')) {
            const headers = Array.from(documentViewer.querySelectorAll('.process-accordion-header'));
            const currentIndex = headers.indexOf(activeEl);

            if (event.key === 'ArrowDown' && currentIndex < headers.length - 1) {
                event.preventDefault();
                headers[currentIndex + 1].focus();
            } else if (event.key === 'ArrowUp' && currentIndex > 0) {
                event.preventDefault();
                headers[currentIndex - 1].focus();
            }
        }
    });

    // ─── Mobile drawer (event listeners) ───

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', () => {
            const isOpen = sidebar.classList.contains('sidebar--open');
            if (isOpen) {
                closeMobileDrawer();
            } else {
                openMobileDrawer();
            }
        });
    }

    backdrop.addEventListener('click', closeMobileDrawer);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && sidebar.classList.contains('sidebar--open')) {
            closeMobileDrawer();
        }
    });

    // ─── Initialization ───

    if (sessions.length > 0) {
        selectSession(sessions[0].id);
    }

    window.addEventListener('resize', () => {
        document.querySelectorAll('.process-accordion-header.open').forEach((header) => {
            const content = header.nextElementSibling;
            if (content && content.classList.contains('process-accordion-content')) {
                content.style.maxHeight = `${content.scrollHeight}px`;
            }
        });
    });
});
