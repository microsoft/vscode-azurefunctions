// @ts-check

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // State
    let state = {
        templates: [],
        filteredTemplates: [],
        selectedTemplate: null,
        filters: {
            language: 'all',
            useCases: [], // Changed to array for multi-select (empty = all)
            search: ''
        },
        projectLocation: '',
        isLoading: true,
        error: null,
        mode: 'browse', // 'browse' | 'ai'
        ai: {
            prompt: '',
            language: 'TypeScript',
            location: '',
            projectData: null,
            isGenerating: false,
            progressTimer: null
        }
    };

    // Language mapping for filter
    const languageFilterMap = {
        'JavaScript': 'node',
        'TypeScript': 'node',
        'Python': 'python',
        'CSharp': 'dotnet',
        'FSharp': 'dotnet',
        'C#': 'dotnet',
        'Java': 'java',
        'PowerShell': 'powershell'
    };

    // Category display names
    const categoryDisplayNames = {
        'starter': 'Starter',
        'web-apis': 'Web APIs',
        'event-processing': 'Event Processing',
        scheduling: 'Scheduled Tasks',
        'ai-ml': 'AI & ML',
        'data-processing': 'Data Processing',
        'workflows': 'Workflows',
        'other': 'Other'
    };

    // Language display names
    const languageDisplayNames = {
        'JavaScript': 'Node.js',
        'TypeScript': 'Node.js',
        'Python': 'Python',
        'CSharp': '.NET',
        'FSharp': '.NET',
        'C#': '.NET',
        'Java': 'Java',
        'PowerShell': 'PowerShell'
    };

    // DOM Elements
    const elements = {
        // Views
        galleryView: document.getElementById('gallery-view'),
        configView: document.getElementById('config-view'),
        creatingView: document.getElementById('creating-view'),

        // Gallery
        searchInput: document.getElementById('search-input'),
        clearSearch: document.getElementById('clear-search'),
        languageFilters: document.getElementById('language-filters'),
        usecaseFilters: document.getElementById('usecase-filters'),
        resultsCount: document.getElementById('results-count'),
        templatesGrid: document.getElementById('templates-grid'),
        emptyState: document.getElementById('empty-state'),
        loadingState: document.getElementById('loading-state'),
        errorState: document.getElementById('error-state'),
        clearFilters: document.getElementById('clear-filters'),
        refreshTemplates: document.getElementById('refresh-templates'),
        retryButton: document.getElementById('retry-button'),
        useCachedButton: document.getElementById('use-cached-button'),

        // Config
        backButton: document.getElementById('back-button'),
        selectedTemplateCard: document.getElementById('selected-template'),
        languageSelect: document.getElementById('language-select'),
        languageDisplay: document.getElementById('language-display'),
        languageHint: document.getElementById('language-hint'),
        locationInput: document.getElementById('location-input'),
        browseButton: document.getElementById('browse-button'),
        readmeLoading: document.getElementById('readme-loading'),
        readmeContent: document.getElementById('readme-content'),
        backToGallery: document.getElementById('back-to-gallery'),
        createProject: document.getElementById('create-project'),
        configForm: document.getElementById('config-form'),
        includedList: document.getElementById('included-list'),

        // Creating
        creatingMessage: document.getElementById('creating-message'),
        creatingDetail: document.getElementById('creating-detail'),

        // Mode toggle
        browseModeTab: document.getElementById('browse-mode-tab'),
        aiModeTab: document.getElementById('ai-mode-tab'),
        browseContent: document.getElementById('browse-content'),
        aiContent: document.getElementById('ai-content'),

        // AI Prompt
        aiPromptSection: document.getElementById('ai-prompt-section'),
        aiPromptInput: document.getElementById('ai-prompt-input'),
        aiLanguageSelect: document.getElementById('ai-language-select'),
        aiGenerateButton: document.getElementById('ai-generate-button'),
        aiChatLink: document.getElementById('ai-chat-link'),
        aiChatConfirmation: document.getElementById('ai-chat-confirmation'),
        aiBackToGenerator: document.getElementById('ai-back-to-generator'),

        // AI Output
        aiOutput: document.getElementById('ai-output'),
        aiGeneratingState: document.getElementById('ai-generating-state'),
        aiStatusText: document.getElementById('ai-status-text'),
        aiSuccessState: document.getElementById('ai-success-state'),
        aiProjectTitle: document.getElementById('ai-project-title'),
        aiProjectDescription: document.getElementById('ai-project-description'),
        aiFilesList: document.getElementById('ai-files-list'),
        aiLocationInput: document.getElementById('ai-location-input'),
        aiBrowseButton: document.getElementById('ai-browse-button'),
        aiCreateButton: document.getElementById('ai-create-button'),
        aiChatFromSuccess: document.getElementById('ai-chat-from-success'),
        aiErrorState: document.getElementById('ai-error-state'),
        aiErrorMessage: document.getElementById('ai-error-message'),
        aiRetryButton: document.getElementById('ai-retry-button'),
        aiChatFromError: document.getElementById('ai-chat-from-error')
    };

    // Initialize
    function init() {
        setupEventListeners();
        requestTemplates();
    }

    // Event Listeners
    function setupEventListeners() {
        // Search
        elements.searchInput?.addEventListener('input', debounce(handleSearch, 300));
        elements.clearSearch?.addEventListener('click', clearSearch);

        // Filters
        elements.languageFilters?.addEventListener('click', handleLanguageFilter);
        elements.usecaseFilters?.addEventListener('click', handleUseCaseFilter);

        // Gallery actions
        elements.clearFilters?.addEventListener('click', clearAllFilters);
        elements.refreshTemplates?.addEventListener('click', handleRefresh);
        elements.retryButton?.addEventListener('click', handleRefresh);
        elements.useCachedButton?.addEventListener('click', handleUseCached);

        // Config actions
        elements.backButton?.addEventListener('click', showGalleryView);
        elements.backToGallery?.addEventListener('click', showGalleryView);
        elements.browseButton?.addEventListener('click', handleBrowse);
        elements.configForm?.addEventListener('submit', handleCreateProject);

        // Mode toggle
        elements.browseModeTab?.addEventListener('click', () => switchMode('browse'));
        elements.aiModeTab?.addEventListener('click', () => switchMode('ai'));

        // AI Prompt
        elements.aiPromptInput?.addEventListener('input', handleAiPromptInput);
        elements.aiLanguageSelect?.addEventListener('change', (e) => {
            state.ai.language = e.target.value;
        });
        elements.aiGenerateButton?.addEventListener('click', handleAiGenerate);

        // AI example chips
        document.querySelectorAll('.example-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                if (prompt && elements.aiPromptInput) {
                    elements.aiPromptInput.value = prompt;
                    state.ai.prompt = prompt;
                    updateAiGenerateButton();
                }
            });
        });

        // AI Output actions
        elements.aiBrowseButton?.addEventListener('click', handleAiBrowse);
        elements.aiCreateButton?.addEventListener('click', handleAiCreate);
        elements.aiRetryButton?.addEventListener('click', handleAiRegenerate);

        // AI Chat escalation
        elements.aiChatLink?.addEventListener('click', () => handleContinueInChat('prompt'));
        elements.aiChatFromSuccess?.addEventListener('click', () => handleContinueInChat('success'));
        elements.aiChatFromError?.addEventListener('click', () => handleContinueInChat('error'));
        elements.aiBackToGenerator?.addEventListener('click', showAiPromptSection);

        // Message handler
        window.addEventListener('message', handleMessage);
    }

    // Message handling
    function handleMessage(event) {
        const message = event.data;

        switch (message.type) {
            case 'templates':
                state.templates = message.templates;
                state.isLoading = false;
                state.error = null;

                // Handle default location if provided and not already set
                if (message.defaultLocation && !state.projectLocation) {
                    state.projectLocation = message.defaultLocation;
                    if (elements.locationInput) {
                        elements.locationInput.value = message.defaultLocation;
                    }
                }

                // Also pre-fill AI location input
                if (message.defaultLocation && !state.ai.location) {
                    state.ai.location = message.defaultLocation;
                    if (elements.aiLocationInput) {
                        elements.aiLocationInput.value = message.defaultLocation;
                    }
                }

                applyFilters();
                updateLoadingState();
                break;

            case 'error':
                state.isLoading = false;
                state.error = message.message;
                updateLoadingState();
                break;

            case 'folderSelected':
                if (message.source === 'ai') {
                    state.ai.location = message.path;
                    if (elements.aiLocationInput) elements.aiLocationInput.value = message.path;
                    updateAiCreateButton();
                } else {
                    state.projectLocation = message.path;
                    if (elements.locationInput) elements.locationInput.value = message.path;
                }
                break;

            case 'readmeLoading':
                if (elements.readmeLoading) elements.readmeLoading.classList.remove('hidden');
                if (elements.readmeContent) elements.readmeContent.innerHTML = '';
                break;

            case 'readmeContent':
                if (elements.readmeLoading) elements.readmeLoading.classList.add('hidden');
                if (elements.readmeContent) {
                    if (message.markdown) {
                        elements.readmeContent.innerHTML =
                            '<div class="readme-header"><span class="codicon codicon-book"></span> README</div>' +
                            renderMarkdown(message.markdown);
                    } else {
                        elements.readmeContent.innerHTML = '';
                    }
                }
                break;

            case 'projectCreated':
                // Project created successfully, panel will close
                break;

            case 'projectCreationFailed':
                showGalleryView();
                vscode.postMessage({
                    type: 'showError',
                    message: message.error
                });
                break;

            case 'creatingProgress':
                elements.creatingDetail.textContent = message.detail;
                break;

            case 'aiGenerating':
                showAiGeneratingState();
                break;

            case 'aiComplete':
                showAiSuccessState(message);
                break;

            case 'aiError':
                showAiErrorState(String(message.error));
                break;

            case 'chatOpened':
                showChatConfirmation();
                break;

            case 'chatUnavailable':
                // Chat open failed — stay on current state, show an inline hint
                vscode.postMessage({
                    type: 'showError',
                    message: 'Could not open Copilot Chat: ' + (message.message || 'Unknown error')
                });
                break;
        }
    }

    // Request templates from extension
    function requestTemplates() {
        state.isLoading = true;
        updateLoadingState();
        vscode.postMessage({ type: 'getTemplates' });
    }

    // Filter logic
    function applyFilters() {
        let results = [...state.templates];

        // Language filter
        if (state.filters.language !== 'all') {
            results = results.filter(t =>
                t.languages.some(lang =>
                    languageFilterMap[lang] === state.filters.language
                )
            );
        }

        // Use case filter (multi-select: show templates matching ANY selected use case)
        // Support both "categories" (array) and legacy "category" (string)
        if (state.filters.useCases.length > 0) {
            results = results.filter(t => {
                const cats = t.categories || (t.category ? [t.category] : []);
                return cats.some(c => state.filters.useCases.includes(c));
            });
        }

        // Search
        if (state.filters.search.trim()) {
            const query = state.filters.search.toLowerCase();
            results = results.filter(t =>
                t.displayName.toLowerCase().includes(query) ||
                t.shortDescription.toLowerCase().includes(query) ||
                (t.tags && t.tags.some(tag => tag.toLowerCase().includes(query)))
            );
        }

        // Sort: Popular first, then by priority, then alphabetically
        results.sort((a, b) => {
            if (a.isPopular && !b.isPopular) return -1;
            if (!a.isPopular && b.isPopular) return 1;
            if (a.priority !== b.priority) return (a.priority || 999) - (b.priority || 999);
            return a.displayName.localeCompare(b.displayName);
        });

        state.filteredTemplates = results;
        renderTemplates();
    }

    // Render templates grid
    function renderTemplates() {
        const grid = elements.templatesGrid;
        if (!grid) return;

        grid.innerHTML = '';

        if (state.filteredTemplates.length === 0) {
            elements.emptyState?.classList.remove('hidden');
            grid.style.display = 'none';
        } else {
            elements.emptyState?.classList.add('hidden');
            grid.style.display = 'grid';

            state.filteredTemplates.forEach(template => {
                const card = createTemplateCard(template);
                grid.appendChild(card);
            });
        }

        elements.resultsCount.textContent = `Showing ${state.filteredTemplates.length} template${state.filteredTemplates.length !== 1 ? 's' : ''}`;
    }

    // Create template card element
    function createTemplateCard(template) {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${template.displayName}. ${template.shortDescription}`);

        // Language badges
        const languagesHtml = template.languages
            .map(lang => {
                const displayName = languageDisplayNames[lang] || lang;
                const filterClass = languageFilterMap[lang] || 'other';
                return `<span class="language-badge ${filterClass}">${displayName}</span>`;
            })
            .filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
            .join('');

        // Category badges — support both "categories" (array) and legacy "category" (string)
        const templateCats = template.categories || (template.category ? [template.category] : []);
        const categoriesHtml = templateCats
            .map(c => `<span class="category-badge">${categoryDisplayNames[c] || c}</span>`)
            .join('');

        // Special badges
        let badgesHtml = categoriesHtml;
        if (template.isPopular) {
            badgesHtml += '<span class="popular-badge"><span class="codicon codicon-star-full"></span>Popular</span>';
        }
        if (template.isNew) {
            badgesHtml += '<span class="new-badge"><span class="codicon codicon-sparkle"></span>New</span>';
        }

        card.innerHTML = `
            <div class="card-languages">${languagesHtml}</div>
            <h3 class="card-title">${escapeHtml(template.displayName)}</h3>
            <p class="card-description">${escapeHtml(template.shortDescription)}</p>
            <div class="card-footer">
                <div class="card-badges">${badgesHtml}</div>
                <button class="use-template-btn" data-template-id="${template.id}">Use Template</button>
            </div>
        `;

        // Event listeners
        const useBtn = card.querySelector('.use-template-btn');
        useBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            selectTemplate(template);
        });

        card.addEventListener('click', () => selectTemplate(template));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectTemplate(template);
            }
        });

        return card;
    }

    // Select template and show config view
    function selectTemplate(template) {
        state.selectedTemplate = template;
        renderConfigView();
        showConfigView();

        vscode.postMessage({
            type: 'templateSelected',
            templateId: template.id,
            template: template
        });
    }

    // Render configuration view
    function renderConfigView() {
        const template = state.selectedTemplate;
        if (!template) return;

        // Selected template card
        const languagesHtml = template.languages
            .map(lang => {
                const displayName = languageDisplayNames[lang] || lang;
                const filterClass = languageFilterMap[lang] || 'other';
                return `<span class="language-badge ${filterClass}">${displayName}</span>`;
            })
            .filter((v, i, a) => a.indexOf(v) === i)
            .join('');

        elements.selectedTemplateCard.innerHTML = `
            <h2>${escapeHtml(template.displayName)}</h2>
            <p>${escapeHtml(template.shortDescription)}</p>
            <div class="card-languages">${languagesHtml}</div>
        `;

        // Language select or static display
        const select = elements.languageSelect;
        const display = elements.languageDisplay;
        select.innerHTML = '';

        // Get unique languages for this template
        const uniqueLanguages = [...new Set(template.languages)];

        if (uniqueLanguages.length === 1) {
            // Single language — show as plain text, hide the dropdown
            const lang = uniqueLanguages[0];
            const option = document.createElement('option');
            option.value = lang;
            select.appendChild(option);
            select.classList.add('hidden');
            if (display) {
                display.textContent = lang;
                display.classList.remove('hidden');
            }
        } else {
            // Multiple languages — show dropdown
            uniqueLanguages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang;
                option.textContent = lang;
                select.appendChild(option);
            });
            select.classList.remove('hidden');
            if (display) {
                display.classList.add('hidden');
            }
            select.addEventListener('change', updateLanguageHint);
        }

        // Set hint based on language
        updateLanguageHint();

        // Render what's included list from template
        renderWhatsIncluded(template);
    }

    // Render what's included list from template data
    function renderWhatsIncluded(template) {
        const list = elements.includedList;
        if (!list) return;

        list.innerHTML = '';

        // Use template's whatsIncluded array if available, otherwise use defaults
        const items = template.whatsIncluded && template.whatsIncluded.length > 0
            ? template.whatsIncluded
            : [
                'Working function code with best practices',
                'Bicep infrastructure files for Azure deployment',
                'README with setup instructions',
                'VS Code debug configuration'
            ];

        items.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="codicon codicon-check"></span> ${escapeHtml(item)}`;
            list.appendChild(li);
        });
    }

    // Update language hint
    function updateLanguageHint() {
        const lang = elements.languageSelect?.value;
        let hint = '';

        if (lang === 'Python') {
            hint = 'Recommended: v2 programming model';
        } else if (lang === 'JavaScript' || lang === 'TypeScript') {
            hint = 'Recommended: v4 programming model';
        } else if (lang === 'CSharp' || lang === 'C#') {
            hint = 'Uses .NET isolated worker model';
        }

        if (elements.languageHint) {
            elements.languageHint.textContent = hint;
        }
    }

    // View switching
    function showGalleryView() {
        elements.galleryView?.classList.add('active');
        elements.configView?.classList.remove('active');
        elements.creatingView?.classList.remove('active');
        // Clear README so next template starts fresh
        if (elements.readmeContent) elements.readmeContent.innerHTML = '';
        if (elements.readmeLoading) elements.readmeLoading.classList.add('hidden');
    }

    function showConfigView() {
        elements.galleryView?.classList.remove('active');
        elements.configView?.classList.add('active');
        elements.creatingView?.classList.remove('active');
    }

    function showCreatingView() {
        elements.galleryView?.classList.remove('active');
        elements.configView?.classList.remove('active');
        elements.creatingView?.classList.add('active');
    }

    // Update loading state
    function updateLoadingState() {
        if (state.isLoading) {
            elements.loadingState?.classList.remove('hidden');
            elements.errorState?.classList.add('hidden');
            elements.templatesGrid.style.display = 'none';
            elements.emptyState?.classList.add('hidden');
        } else if (state.error) {
            elements.loadingState?.classList.add('hidden');
            elements.errorState?.classList.remove('hidden');
            elements.templatesGrid.style.display = 'none';
            elements.emptyState?.classList.add('hidden');
        } else {
            elements.loadingState?.classList.add('hidden');
            elements.errorState?.classList.add('hidden');
        }
    }

    // Event handlers
    function handleSearch(e) {
        state.filters.search = e.target.value;
        elements.clearSearch?.classList.toggle('hidden', !e.target.value);
        applyFilters();
    }

    function clearSearch() {
        elements.searchInput.value = '';
        state.filters.search = '';
        elements.clearSearch?.classList.add('hidden');
        applyFilters();
    }

    function handleLanguageFilter(e) {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;

        // Update active state
        elements.languageFilters?.querySelectorAll('.filter-chip').forEach(c => {
            c.classList.remove('active');
            c.setAttribute('aria-checked', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-checked', 'true');

        state.filters.language = chip.dataset.value;
        applyFilters();
    }

    function handleUseCaseFilter(e) {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;

        const value = chip.dataset.value;

        // Handle "All" button - clears all selections
        if (value === 'all') {
            state.filters.useCases = [];
            elements.usecaseFilters?.querySelectorAll('.filter-chip').forEach(c => {
                const isAll = c.dataset.value === 'all';
                c.classList.toggle('active', isAll);
                c.setAttribute('aria-checked', isAll ? 'true' : 'false');
            });
        } else {
            // Toggle the clicked filter
            const index = state.filters.useCases.indexOf(value);
            if (index > -1) {
                // Remove if already selected
                state.filters.useCases.splice(index, 1);
                chip.classList.remove('active');
                chip.setAttribute('aria-checked', 'false');
            } else {
                // Add to selection
                state.filters.useCases.push(value);
                chip.classList.add('active');
                chip.setAttribute('aria-checked', 'true');
            }

            // Update "All" button state
            const allChip = elements.usecaseFilters?.querySelector('[data-value="all"]');
            if (allChip) {
                const noneSelected = state.filters.useCases.length === 0;
                allChip.classList.toggle('active', noneSelected);
                allChip.setAttribute('aria-checked', noneSelected ? 'true' : 'false');
            }
        }

        applyFilters();
    }

    function clearAllFilters() {
        state.filters = { language: 'all', useCases: [], search: '' };
        elements.searchInput.value = '';
        elements.clearSearch?.classList.add('hidden');

        // Reset filter chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.value === 'all');
            chip.setAttribute('aria-checked', chip.dataset.value === 'all' ? 'true' : 'false');
        });

        applyFilters();
    }

    function handleRefresh() {
        vscode.postMessage({ type: 'refreshTemplates' });
        requestTemplates();
    }

    function handleUseCached() {
        vscode.postMessage({ type: 'useCachedTemplates' });
    }

    function handleBrowse() {
        vscode.postMessage({ type: 'browseFolder', source: 'template' });
    }

    function handleAiBrowse() {
        vscode.postMessage({ type: 'browseFolder', source: 'ai' });
    }

    // Mode switching
    function switchMode(mode) {
        state.mode = mode;

        const isBrowse = mode === 'browse';
        elements.browseModeTab?.classList.toggle('active', isBrowse);
        elements.aiModeTab?.classList.toggle('active', !isBrowse);
        elements.browseContent?.classList.toggle('hidden', !isBrowse);
        elements.aiContent?.classList.toggle('hidden', isBrowse);
    }

    // AI Prompt handlers
    function handleAiPromptInput(e) {
        state.ai.prompt = e.target.value.trim();
        updateAiGenerateButton();
    }

    function updateAiGenerateButton() {
        if (elements.aiGenerateButton) {
            elements.aiGenerateButton.disabled = !state.ai.prompt || state.ai.isGenerating;
        }
    }

    function updateAiCreateButton() {
        if (elements.aiCreateButton) {
            elements.aiCreateButton.disabled = !state.ai.location || !state.ai.projectData;
        }
    }

    function handleAiGenerate() {
        const prompt = elements.aiPromptInput?.value.trim();
        const language = elements.aiLanguageSelect?.value || 'TypeScript';
        if (!prompt) return;

        state.ai.prompt = prompt;
        state.ai.language = language;
        state.ai.isGenerating = true;
        state.ai.projectData = null;

        // Show generating UI immediately — don't wait for the extension roundtrip
        showAiGeneratingState();

        vscode.postMessage({ type: 'generateWithCopilot', prompt, language });
    }

    function handleAiRegenerate() {
        // Reset output and regenerate with same prompt
        state.ai.projectData = null;
        state.ai.location = '';
        if (elements.aiLocationInput) elements.aiLocationInput.value = '';
        updateAiCreateButton();

        if (state.ai.prompt) {
            state.ai.isGenerating = true;
            updateAiGenerateButton();
            vscode.postMessage({
                type: 'generateWithCopilot',
                prompt: state.ai.prompt,
                language: state.ai.language
            });
        }
    }

    function handleAiCreate() {
        const location = state.ai.location;
        const projectData = state.ai.projectData;
        if (!location || !projectData) return;

        showCreatingView();
        elements.creatingMessage.textContent = 'Creating AI-generated project...';
        elements.creatingDetail.textContent = 'Writing project files';

        vscode.postMessage({
            type: 'createAiProject',
            files: projectData.files,
            location: location
        });
    }

    // AI state display functions
    const aiProgressMessages = [
        'Analyzing your requirements...',
        'Designing project structure...',
        'Writing function code...',
        'Adding configuration files...'
    ];

    function showAiGeneratingState() {
        state.ai.isGenerating = true;
        updateAiGenerateButton();

        // Show output area
        elements.aiOutput?.classList.remove('hidden');
        elements.aiGeneratingState?.classList.remove('hidden');
        elements.aiSuccessState?.classList.add('hidden');
        elements.aiErrorState?.classList.add('hidden');

        // Reset and animate progress steps
        let step = 0;
        const steps = document.querySelectorAll('.ai-step');
        steps.forEach((s, i) => {
            s.className = 'ai-step' + (i === 0 ? ' active' : '');
            const icon = s.querySelector('.codicon');
            if (icon) {
                icon.className = i === 0
                    ? 'codicon codicon-loading codicon-modifier-spin'
                    : 'codicon codicon-circle-outline';
            }
        });

        // Hide extended-wait in case of regenerate
        document.getElementById('ai-extended-wait')?.classList.add('hidden');

        // Clear any existing timer
        if (state.ai.progressTimer) clearInterval(state.ai.progressTimer);

        state.ai.progressTimer = setInterval(() => {
            const isLastStep = step === steps.length - 1;

            // Mark current step done only if it is NOT the last step —
            // the last step keeps its spinner running until aiComplete arrives.
            if (!isLastStep && steps[step]) {
                steps[step].className = 'ai-step done';
                const icon = steps[step].querySelector('.codicon');
                if (icon) icon.className = 'codicon codicon-check';
            }

            step++;

            if (step < steps.length) {
                steps[step].classList.add('active');
                const icon = steps[step].querySelector('.codicon');
                if (icon) icon.className = 'codicon codicon-loading codicon-modifier-spin';
                if (elements.aiStatusText) {
                    elements.aiStatusText.textContent = aiProgressMessages[step] || 'Finishing up...';
                }

                // Last step reached — stop the timer and reveal extended-wait after 3 s
                if (step === steps.length - 1) {
                    clearInterval(state.ai.progressTimer);
                    state.ai.progressTimer = null;
                    setTimeout(() => {
                        if (state.ai.isGenerating) {
                            document.getElementById('ai-extended-wait')?.classList.remove('hidden');
                        }
                    }, 3000);
                }
            } else {
                clearInterval(state.ai.progressTimer);
                state.ai.progressTimer = null;
            }
        }, 2500);
    }

    function showAiSuccessState(message) {
        state.ai.isGenerating = false;
        state.ai.projectData = message.projectData;

        // Stop progress timer
        if (state.ai.progressTimer) {
            clearInterval(state.ai.progressTimer);
            state.ai.progressTimer = null;
        }

        // Mark all steps done (including the last one that was still spinning)
        document.querySelectorAll('.ai-step').forEach(s => {
            s.className = 'ai-step done';
            const icon = s.querySelector('.codicon');
            if (icon) icon.className = 'codicon codicon-check';
        });
        document.getElementById('ai-extended-wait')?.classList.add('hidden');

        // Transition to success state
        setTimeout(() => {
            elements.aiGeneratingState?.classList.add('hidden');
            elements.aiSuccessState?.classList.remove('hidden');
            elements.aiErrorState?.classList.add('hidden');

            // Populate success content
            if (elements.aiProjectTitle) elements.aiProjectTitle.textContent = message.title || '';
            if (elements.aiProjectDescription) elements.aiProjectDescription.textContent = message.description || '';

            // Render file list
            if (elements.aiFilesList) {
                elements.aiFilesList.innerHTML = '';
                const files = message.files || [];
                files.forEach(filePath => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="codicon codicon-file"></span>${escapeHtml(filePath)}`;
                    elements.aiFilesList.appendChild(li);
                });
            }

            // Restore location if already picked
            if (state.ai.location && elements.aiLocationInput) {
                elements.aiLocationInput.value = state.ai.location;
            }

            updateAiGenerateButton();
            updateAiCreateButton();
        }, 400);
    }

    function showAiErrorState(errorMessage) {
        state.ai.isGenerating = false;
        if (state.ai.progressTimer) {
            clearInterval(state.ai.progressTimer);
            state.ai.progressTimer = null;
        }

        elements.aiGeneratingState?.classList.add('hidden');
        elements.aiSuccessState?.classList.add('hidden');
        elements.aiErrorState?.classList.remove('hidden');

        if (elements.aiErrorMessage) elements.aiErrorMessage.textContent = errorMessage;
        updateAiGenerateButton();
    }

    function handleContinueInChat(context) {
        const prompt = state.ai.prompt || elements.aiPromptInput?.value.trim() || '';
        const language = state.ai.language || elements.aiLanguageSelect?.value || 'TypeScript';
        vscode.postMessage({
            type: 'continueInChat',
            prompt,
            language,
            context,
            projectData: context === 'success' ? state.ai.projectData : undefined
        });
    }

    function showChatConfirmation() {
        elements.aiPromptSection?.classList.add('hidden');
        elements.aiOutput?.classList.add('hidden');
        elements.aiChatConfirmation?.classList.remove('hidden');
    }

    function showAiPromptSection() {
        elements.aiChatConfirmation?.classList.add('hidden');
        elements.aiPromptSection?.classList.remove('hidden');
        // Restore output if there was a result
        if (state.ai.projectData || state.ai.isGenerating) {
            elements.aiOutput?.classList.remove('hidden');
        }
    }

    function handleCreateProject(e) {
        e.preventDefault();

        const template = state.selectedTemplate;
        if (!template) return;

        const language = elements.languageSelect?.value;
        const location = elements.locationInput?.value;

        if (!language || !location) {
            return;
        }

        showCreatingView();
        elements.creatingMessage.textContent = `Creating project...`;
        elements.creatingDetail.textContent = 'Cloning template repository';

        vscode.postMessage({
            type: 'createProject',
            template: template,
            language: language,
            location: location
        });
    }

    // Utility functions
    function debounce(fn, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Simple markdown-to-HTML renderer for README display
    function renderMarkdown(md) {
        // 0. Strip HTML comments (<!-- ... -->)
        md = md.replace(/<!--[\s\S]*?-->/g, '').trim();

        // 1. Extract and protect code blocks
        const codeBlocks = [];
        md = md.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            codeBlocks.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escaped}</code></pre>`);
            return `\x00BLOCK${codeBlocks.length - 1}\x00`;
        });

        // 2. Escape HTML in remaining text
        md = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 3. Inline code
        md = md.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 4. Images (strip — unsafe origins)
        md = md.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

        // 5. Links (http/https only; show text for others)
        md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        md = md.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

        // 6. Bold / italic
        md = md.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        md = md.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
        md = md.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
        md = md.replace(/__(.+?)__/g, '<strong>$1</strong>');

        // 7. Headings
        md = md.replace(/^(#{1,6})\s+(.+)$/gm, (_, h, text) =>
            `<h${h.length}>${text.trim()}</h${h.length}>`);

        // 8. Blockquotes
        md = md.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');

        // 9. Horizontal rules
        md = md.replace(/^[-*_]{3,}\s*$/gm, '<hr>');

        // 10. Tables (basic)
        md = md.replace(/^\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (_, header, rows) => {
            const ths = header.split('|').map(c => `<th>${c.trim()}</th>`).join('');
            const trs = rows.trim().split('\n').map(row => {
                const tds = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1)
                    .map(c => `<td>${c.trim()}</td>`).join('');
                return `<tr>${tds}</tr>`;
            }).join('');
            return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
        });

        // 11. Lists and paragraphs (line by line)
        const lines = md.split('\n');
        const out = [];
        let inUL = false, inOL = false;

        for (const line of lines) {
            const ulM = line.match(/^[-*+]\s+(.+)$/);
            const olM = line.match(/^\d+\.\s+(.+)$/);

            if (ulM) {
                if (inOL) { out.push('</ol>'); inOL = false; }
                if (!inUL) { out.push('<ul>'); inUL = true; }
                out.push(`<li>${ulM[1]}</li>`);
            } else if (olM) {
                if (inUL) { out.push('</ul>'); inUL = false; }
                if (!inOL) { out.push('<ol>'); inOL = true; }
                out.push(`<li>${olM[1]}</li>`);
            } else {
                if (inUL) { out.push('</ul>'); inUL = false; }
                if (inOL) { out.push('</ol>'); inOL = false; }
                // Skip wrapping lines that already have block-level tags
                if (/^<(h[1-6]|pre|blockquote|hr|ul|ol|li|table|thead|tbody|tr|div)/.test(line)) {
                    out.push(line);
                } else if (line.trim() === '') {
                    out.push('');
                } else {
                    out.push(`<p>${line}</p>`);
                }
            }
        }
        if (inUL) out.push('</ul>');
        if (inOL) out.push('</ol>');

        // 12. Restore code blocks
        let html = out.join('\n');
        html = html.replace(/\x00BLOCK(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);

        return html;
    }

    // Start
    init();
})();
