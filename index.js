(async () => {
    "use strict";

    // --- 1. 配置 ---
    const SCRIPT_NAME = '[The Great Replacer V1.0]'; /
    const REPLACED_MARKER = 'data-great-replacer-processed';

    // 需要向上弹出的<select>元素的ID列表
    const DROP_UP_IDS = ['custom_prompt_post_processing', 'model_custom_select'];

    // 需要延伸宽度的<select>及其目标容器ID的映射
    const WIDTH_TARGETS = {
        'themes': 'UI-Theme-Block',
        'world_editor_select': 'WorldInfo',
        'settings_preset_openai': 'left-nav-panel',
        'completion_prompt_manager_footer_append_prompt': 'left-nav-panel'
    };
    
    // 为 world_popup_entries_list 中的下拉框提供选项缓存
    const worldInfoCache = {
        options: []
    };
    // 标志位，表示缓存是否已成功填充，防止重复缓存
    let isWorldInfoCachePopulated = false;

    // 用于监听 WorldInfo 内部变化的观察者，初始为 null
    let entriesListObserver = null;


    // --- 2. 注入样式 ---
    const customStyles = `
        /* 新的容器样式，现在是一个在body中的绝对定位元素 */
        .gr-container-enhanced {
            position: absolute;
            pointer-events: none;
            z-index: 2147483647;
            border: none !important;
            outline: none !important;
        }

        /* 选项列表 (这是我们要美化的核心) */
        .gr-options {
            display: none;
            pointer-events: auto !important;
            position: absolute;
            left: 0;
            width: 100%;
            background-color: #ffffff !important;
            border: 1px solid #f0f0f0 !important;
            border-radius: 12px !important;
            overflow-y: auto;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
            z-index: 2147483647;
            scrollbar-width: none !important;
            -ms-overflow-style: none;
        }
        .gr-options::-webkit-scrollbar { display: none; }
        .gr-container-enhanced.open .gr-options { display: block; }

        /* --- 默认向下弹出 (drop-down) 的样式 --- */
        .gr-options {
            top: 100%;
            margin-top: 4px;
            max-height: calc(100vh - var(--dropdown-top) - 20px);
            animation: slideDown 0.2s ease-out;
        }
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* --- 向上弹出 (drop-up) 的样式 --- */
        .gr-container-enhanced.drop-up .gr-options {
            top: auto;
            bottom: 100%;
            margin-top: 0;
            margin-bottom: 4px;
            animation-name: slideUp;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .gr-options * {
            scrollbar-width: auto !important;
            outline: none !important;
        }
        .gr-options input[type="text"], .gr-options input:not([type]), .gr-options textarea:not([type="search"]) {
            background-color: #fafafa !important;
            border: 1.5px solid #f5f5f5 !important;
            transition: border-color 0.2s ease;
        }
        .gr-options input[type="text"]:hover, .gr-options input:not([type]):hover, .gr-options textarea:not([type="search"]):hover {
            border-color: #64b5f6 !important;
        }
        .gr-search-box {
            position: sticky; top: 0;
            background: linear-gradient(to bottom, #ffffff 90%, rgba(255, 255, 255, 0));
            padding: 8px 8px 4px 8px; z-index: 1;
            border: none !important;
            outline: none !important;
            cursor: default;
        }
        .gr-container-enhanced.drop-up .gr-search-box {
            position: sticky;
            top: auto;
            bottom: 0;
            background: linear-gradient(to top, #ffffff 90%, rgba(255, 255, 255, 0));
            padding: 4px 8px 8px 8px;
        }
        .gr-search-input {
            width: 100%; padding: 8px 12px; border: 1.5px solid #f5f5f5;
            border-radius: 8px; font-size: inherit; font-weight: 400; outline: none;
            box-sizing: border-box; background-color: #fafafa !important; color: #333 !important;
            transition: border-color 0.2s ease, background-color 0.2s ease;
            -webkit-appearance: none !important; appearance: none !important;
            cursor: text !important;
        }
        .gr-search-input::placeholder { color: #b0b0b0; }
        .gr-search-input:hover {
            border-color: #64b5f6 !important;
        }
        .gr-search-input:focus {
            background-color: #ffffff !important;
            border-color: #42a5f5 !important;
            caret-color: #42a5f5;
        }
        .gr-options-container { padding: 2px 0 4px 0; }
        .gr-option {
            padding: 8px !important; margin: 5px !important; color: #2c3e50 !important;
            cursor: pointer; transition: all 0.15s ease; user-select: none;
            border-radius: 6px; font-size: inherit; font-weight: 500; position: relative;
        }
        .gr-option:hover {
            background-color: #f8fbff !important; color: #1976d2 !important;
            transform: translateX(2px);
        }
        .gr-option:hover::before {
            content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
            width: 3px; height: 60%; background-color: #42a5f5; border-radius: 2px;
            opacity: 0; animation: fadeIn 0.2s ease forwards;
        }
        @keyframes fadeIn { to { opacity: 1; } }
        .gr-option.selected {
            background-color: #e3f2fd !important; color: #1565c0 !important; font-weight: 600;
        }
        .gr-option.hidden { display: none; }
       
        .gr-group-label {
            padding: 10px 12px 4px 12px;
            font-size: 12px;
            font-weight: 700;
            color: #78909c; /* 蓝灰色 */
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: default;
            user-select: none;
        }

        .gr-no-results {
            padding: 32px 20px; text-align: center; color: #9e9e9e; font-size: 14px;
        }
    `;

    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function replaceSelect(originalSelect) {
        if (originalSelect.hasAttribute(REPLACED_MARKER)) return;
        originalSelect.setAttribute(REPLACED_MARKER, 'true');
        
        originalSelect.style.outline = 'none';
        originalSelect.style.border = 'none';

        const container = window.parent.document.createElement('div');
        container.className = 'gr-container-enhanced';

        if (DROP_UP_IDS.includes(originalSelect.id)) {
            container.classList.add('drop-up');
        }

        const optionsList = window.parent.document.createElement('div');
        optionsList.className = 'gr-options';
        optionsList.addEventListener('mousedown', (e) => e.stopPropagation());

        const searchBox = window.parent.document.createElement('div');
        searchBox.className = 'gr-search-box';
        searchBox.style.display = 'none';
        const searchInput = window.parent.document.createElement('input');
        searchInput.className = 'gr-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = '搜索选项...';
        searchBox.appendChild(searchInput);
        
        const optionsContainer = window.parent.document.createElement('div');
        optionsContainer.className = 'gr-options-container';
        
        if (container.classList.contains('drop-up')) {
            optionsList.appendChild(optionsContainer);
            optionsList.appendChild(searchBox);
        } else {
            optionsList.appendChild(searchBox);
            optionsList.appendChild(optionsContainer);
        }
        
        const performSearch = debounce((searchTerm) => {
            searchTerm = searchTerm.toLowerCase();
            let hasVisible = false;
            optionsContainer.querySelectorAll('.gr-option').forEach(option => {
                const isVisible = option.textContent.toLowerCase().includes(searchTerm);
                option.classList.toggle('hidden', !isVisible);
                if(isVisible) hasVisible = true;
            });
            let noResultsMsg = optionsContainer.querySelector('.gr-no-results');
            if (!hasVisible && !noResultsMsg) {
                noResultsMsg = window.parent.document.createElement('div');
                noResultsMsg.className = 'gr-no-results';
                noResultsMsg.textContent = '没有找到匹配的选项';
                optionsContainer.appendChild(noResultsMsg);
            } else if (hasVisible && noResultsMsg) {
                noResultsMsg.remove();
            }
        }, 200);
        
        searchInput.addEventListener('input', (e) => performSearch(e.target.value));
        searchInput.addEventListener('mouseenter', () => searchInput.focus());
        searchInput.addEventListener('mouseleave', () => { if (searchInput.value === '') searchInput.blur(); });
        searchInput.addEventListener('click', e => e.stopPropagation());
        searchInput.addEventListener('mousedown', e => e.preventDefault());

        function updateContainerPosition() {
            if (!window.parent.document.body.contains(originalSelect)) return;
            const rect = originalSelect.getBoundingClientRect();
            let finalWidth = rect.width;
            const targetWidthId = WIDTH_TARGETS[originalSelect.id];
            if (targetWidthId) {
                const targetElement = window.parent.document.getElementById(targetWidthId);
                if (targetElement) {
                    const targetRect = targetElement.getBoundingClientRect();
                    finalWidth = targetRect.right - rect.left;
                }
            }
            container.style.position = 'absolute';
            container.style.top = `${rect.top + window.scrollY}px`;
            container.style.left = `${rect.left + window.scrollX}px`;
            container.style.width = `${finalWidth}px`;
            container.style.height = `${rect.height}px`;
        }
        
        const isWorldInfoSelect = originalSelect.name === '$' && originalSelect.closest('#world_popup_entries_list');
        
        function populateOptions() {
            optionsContainer.innerHTML = '';
            
            // 辅助函数，用于创建单个选项元素，避免代码重复
            const createOptionDiv = (optionNode) => {
                const customOption = window.parent.document.createElement('div');
                customOption.className = 'gr-option';
                customOption.textContent = optionNode.textContent;
                customOption.dataset.value = optionNode.value;
                if (optionNode.selected) {
                    customOption.classList.add('selected');
                }
                customOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    originalSelect.value = customOption.dataset.value;
                    originalSelect.dispatchEvent(new Event('change', { 'bubbles': true }));
                    container.classList.remove('open');
                });
                return customOption;
            };

            // 如果是特殊下拉框并且缓存已经填充
            if (isWorldInfoSelect && isWorldInfoCachePopulated) {
                worldInfoCache.options.forEach(cachedOpt => {
                    const fakeOptionNode = {
                        textContent: cachedOpt.text,
                        value: cachedOpt.value,
                        selected: originalSelect.value === cachedOpt.value
                    };
                    optionsContainer.appendChild(createOptionDiv(fakeOptionNode));
                });
            } else {
                // 否则，从DOM读取，并处理 optgroup
                Array.from(originalSelect.children).forEach(child => {
                    if (child.tagName === 'OPTGROUP') {
                        // 如果是 optgroup，为其创建一个标题
                        const groupLabel = window.parent.document.createElement('div');
                        groupLabel.className = 'gr-group-label';
                        groupLabel.textContent = child.label;
                        optionsContainer.appendChild(groupLabel);

                        // 然后遍历 optgroup 内的 option
                        Array.from(child.children).forEach(optionNode => {
                            if (optionNode.tagName === 'OPTION') {
                                optionsContainer.appendChild(createOptionDiv(optionNode));
                            }
                        });
                    } else if (child.tagName === 'OPTION') {
                        // 如果是顶级的 option
                        optionsContainer.appendChild(createOptionDiv(child));
                    }
                });
            }
            
            // 使用 originalSelect.options.length 来判断是否显示搜索框，这能正确统计所有<option>
            searchBox.style.display = originalSelect.options.length >= 10 ? 'block' : 'none';
            searchInput.value = '';
            performSearch(''); // 填充后重置搜索
        }
        
        populateOptions();

        let scrollListeners = [];
        
        originalSelect.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (container.classList.contains('open')) {
                container.classList.remove('open');
                scrollListeners.forEach(({ element, handler }) => element.removeEventListener('scroll', handler, true));
                scrollListeners = [];
                return;
            }
            window.parent.document.querySelectorAll('.gr-container-enhanced.open').forEach(c => c.classList.remove('open'));
            
            updateContainerPosition();
            
            const rect = originalSelect.getBoundingClientRect();
            if (container.classList.contains('drop-up')) {
                const maxAvailableHeight = rect.top - 20;
                optionsList.style.maxHeight = `${maxAvailableHeight}px`;
            } else {
                const dropdownTop = rect.bottom + 4;
                const maxAvailableHeight = window.innerHeight - dropdownTop - 20;
                optionsList.style.maxHeight = `${maxAvailableHeight}px`;
                optionsList.style.setProperty('--dropdown-top', `${dropdownTop}px`);
            }
            
            container.classList.add('open');
            populateOptions();
            
            const scrollHandler = (event) => {
                if (optionsList.contains(event.target)) return;
                container.classList.remove('open');
                scrollListeners.forEach(({ element, handler }) => element.removeEventListener('scroll', handler, true));
                scrollListeners = [];
            };
            
            let parent = originalSelect.parentElement;
            while (parent) {
                scrollListeners.push({ element: parent, handler: scrollHandler });
                parent.addEventListener('scroll', scrollHandler, true);
                parent = parent.parentElement;
            }
            
            scrollListeners.push({ element: window, handler: scrollHandler });
            window.addEventListener('scroll', scrollHandler, true);
        });

        container.appendChild(optionsList);
        window.parent.document.body.appendChild(container);
    }
    
    // 【无变动】启动对 world_popup_entries_list 的监听
    function startObservingEntriesList() {
        if (entriesListObserver) return; // 防止重复启动

        const entriesList = window.parent.document.getElementById('world_popup_entries_list');
        if (!entriesList) {
            console.warn(`${SCRIPT_NAME}: Could not find 'world_popup_entries_list' to observe.`);
            return;
        }

        console.log(`${SCRIPT_NAME}: WorldInfo opened. Started observing 'world_popup_entries_list'.`);

        entriesListObserver = new MutationObserver(() => {
            if (isWorldInfoCachePopulated || entriesList.style.display === 'none') {
                return;
            }
            const sampleSelect = entriesList.querySelector('div:nth-child(2) > form > div select[name="$"]');
            if (sampleSelect && sampleSelect.options.length > 1) {
                worldInfoCache.options = Array.from(sampleSelect.options).map(opt => ({
                    text: opt.textContent,
                    value: opt.value
                }));
                isWorldInfoCachePopulated = true;
                console.log(`${SCRIPT_NAME}: Successfully cached ${worldInfoCache.options.length} world info options.`);
            }
        });
        entriesListObserver.observe(entriesList, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });
    }

    function stopObservingEntriesList() {
        if (entriesListObserver) {
            entriesListObserver.disconnect();
            entriesListObserver = null;
            console.log(`${SCRIPT_NAME}: WorldInfo closed. Stopped observing 'world_popup_entries_list'.`);
        }
    }

    /**
     * 初始化脚本
     */
    function initialize() {
        console.log(`${SCRIPT_NAME} is running!`);

        const styleSheet = window.parent.document.createElement("style");
        styleSheet.innerText = customStyles;
        window.parent.document.head.appendChild(styleSheet);
        
        const closeAllOpenDropdowns = () => {
            window.parent.document.querySelectorAll('.gr-container-enhanced.open').forEach(container => {
                container.classList.remove('open');
            });
        };

        window.parent.document.addEventListener('click', (e) => {
            if (!e.target.closest('.gr-container-enhanced') && !e.target.hasAttribute(REPLACED_MARKER)) {
                closeAllOpenDropdowns();
            }
        });

        window.addEventListener('resize', closeAllOpenDropdowns);
        
        window.parent.document.querySelectorAll(`select:not([${REPLACED_MARKER}])`).forEach(replaceSelect);
        
        const bodyObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.tagName === 'SELECT' && !node.hasAttribute(REPLACED_MARKER)) {
                            replaceSelect(node);
                        }
                        node.querySelectorAll(`select:not([${REPLACED_MARKER}])`).forEach(replaceSelect);
                    }
                });
            }
        });
        bodyObserver.observe(window.parent.document.body, { childList: true, subtree: true });

        const worldInfoDrawer = window.parent.document.getElementById('WorldInfo');
        if (worldInfoDrawer) {
            const worldInfoObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.classList.contains('openDrawer')) {
                            startObservingEntriesList();
                        } else if (target.classList.contains('closedDrawer')) {
                            stopObservingEntriesList();
                        }
                    }
                }
            });

            worldInfoObserver.observe(worldInfoDrawer, {
                attributes: true,
                attributeFilter: ['class']
            });
        } else {
            console.warn(`${SCRIPT_NAME}: Could not find '#WorldInfo' to set up drawer observer.`);
        }

        console.log(`${SCRIPT_NAME} initialization complete.`);
    }

    if (window.parent.document.readyState === 'complete') {
        initialize();
    } else {
        window.parent.addEventListener('load', initialize, { once: true });
    }

})();
