(async () => {
    "use strict";

    // --- 1. 配置与全局常量 ---
    const SCRIPT_NAME = '[下拉选项框美化]';
    const CONTAINER_ID = 'gr-global-dropdown-container';

    // 预定义的需要延伸宽度的目标映射
    const WIDTH_TARGETS = {
        'themes': 'UI-Theme-Block',
        'world_editor_select': 'WorldInfo',
        'settings_preset_openai': 'left-nav-panel',
        'completion_prompt_manager_footer_append_prompt': 'left-nav-panel',
        'extensionTopBarChatName': 'extensionTopBar'
    };
    
    // WorldInfo 缓存状态
    const worldInfoCache = { options: [] };
    let isWorldInfoCachePopulated = false;
    let entriesListObserver = null;

    // 主题状态
    let isDarkMode = localStorage.getItem('gr-dark-mode') === 'true';

    // 滚动监听器清理队列
    let activeScrollListeners = [];

    // select2 显示区域替换状态
    const replacedSelect2Displays = new Map();

    // 顶置功能
    const PINNED_STORAGE_PREFIX = 'gr-pinned-';
    function getPinKey(selectEl) { return PINNED_STORAGE_PREFIX + (selectEl.id || (selectEl.closest('#WIMultiSelector') ? 'wi-multi' : 'unknown')); }
    function getPinnedValues(selectEl) { try { return JSON.parse(localStorage.getItem(getPinKey(selectEl)) || '[]'); } catch { return []; } }
    function togglePinnedValue(selectEl, value) { const p = getPinnedValues(selectEl); const i = p.indexOf(value); if (i >= 0) p.splice(i, 1); else p.push(value); localStorage.setItem(getPinKey(selectEl), JSON.stringify(p)); return p; }
    function isPinEnabled(selectEl) { if (!selectEl) return false; if (selectEl.id === 'themes') return true; if (selectEl.id === 'settings_preset_openai') return true; if (selectEl.closest('#WIMultiSelector .range-block-range')) return true; return false; }

    // --- 2. 注入样式 ---
    const customStyles = `
        .gr-container-enhanced { position: absolute; pointer-events: none; z-index: 2147483647; border: none !important; outline: none !important; }
        .gr-options { display: none; pointer-events: auto !important; position: absolute; left: 0; width: 100%; background-color: #ffffff !important; border: 1px solid #f0f0f0 !important; border-radius: 12px !important; overflow-y: auto; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06); z-index: 2147483647; scrollbar-width: none !important; -ms-overflow-style: none; }
        body.dark-mode .gr-options { background-color: rgba(30, 30, 30, 1) !important; border: 1px solid rgba(60, 60, 60, 0.5) !important; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
        .gr-options::-webkit-scrollbar { display: none; }
        .gr-container-enhanced.open .gr-options { display: block; }
        .gr-options { top: 100%; margin-top: 4px; animation: slideDown 0.2s ease-out; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .gr-container-enhanced.drop-up .gr-options { top: auto; bottom: 100%; margin-top: 0; margin-bottom: 4px; animation-name: slideUp; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .gr-options * { scrollbar-width: auto !important; outline: none !important; }
        .gr-options input[type="text"], .gr-options input:not([type]), .gr-options textarea:not([type="search"]) { background-color: #fafafa !important; border: 1.5px solid #f5f5f5 !important; transition: border-color 0.2s ease; }
        .gr-options input[type="text"]:hover, .gr-options input:not([type]), .gr-options textarea:not([type="search"]):hover { border-color: #64b5f6 !important; }
        body.dark-mode .gr-options input[type="text"], body.dark-mode .gr-options input:not([type]), body.dark-mode .gr-options textarea:not([type="search"]) { background-color: rgba(50, 50, 50, 1) !important; border: 1.5px solid rgba(80, 80, 80, 0.5) !important; color: #ffffff !important; }
        body.dark-mode .gr-options input[type="text"]:hover, body.dark-mode .gr-options input:not([type]):hover, body.dark-mode .gr-options textarea:not([type="search"]):hover { border-color: rgba(216, 168, 231, 0.5) !important; }
        .gr-search-box { position: sticky; top: 0; background: linear-gradient(to bottom, #ffffff 90%, rgba(255, 255, 255, 0)); padding: 8px 8px 4px 8px; z-index: 1; border: none !important; outline: none !important; cursor: default; }
        .gr-container-enhanced.drop-up .gr-search-box { position: sticky; top: auto; bottom: 0; background: linear-gradient(to top, #ffffff 90%, rgba(255, 255, 255, 0)); padding: 4px 8px 8px 8px; }
        body.dark-mode .gr-search-box { background: linear-gradient(to bottom, rgba(30, 30, 30, 1) 90%, rgba(30, 30, 30, 0)); }
        body.dark-mode .gr-container-enhanced.drop-up .gr-search-box { background: linear-gradient(to top, rgba(30, 30, 30, 1) 90%, rgba(30, 30, 30, 0)); }
        .gr-search-input { width: 100%; padding: 8px 12px; border: 1.5px solid #f5f5f5; border-radius: 8px; font-size: inherit; font-weight: 400; outline: none; box-sizing: border-box; background-color: #fafafa !important; color: #333 !important; transition: border-color 0.2s ease, background-color 0.2s ease; appearance: none !important; cursor: text !important; caret-color: transparent; }
        .gr-search-input::placeholder { color: #b0b0b0; }
        .gr-search-input:hover { border-color: #64b5f6 !important; }
        .gr-search-input:focus { background-color: #ffffff !important; border-color: #42a5f5 !important; caret-color: #42a5f5; }
        body.dark-mode .gr-search-input { background-color: rgba(50, 50, 50, 1) !important; color: #ffffff !important; border: 1.5px solid rgba(80, 80, 80, 0.5) !important; caret-color: transparent; }
        body.dark-mode .gr-search-input::placeholder { color: rgba(255, 255, 255, 0.5); }
        body.dark-mode .gr-search-input:hover { border-color: rgba(216, 168, 231, 0.5) !important; }
        body.dark-mode .gr-search-input:focus { background-color: rgba(40, 40, 40, 1) !important; border-color: rgba(216, 168, 231, 0.7) !important; caret-color: rgba(216, 168, 231, 0.7); }
        .gr-options-container { padding: 2px 0 4px 0; }
        .gr-option { padding: 8px !important; margin: 5px !important; color: #2c3e50 !important; cursor: pointer; transition: all 0.15s ease; user-select: none; border-radius: 6px; font-size: inherit; font-weight: 500; position: relative; }
        .gr-option:hover { background-color: #f8fbff !important; color: #1976d2 !important; transform: translateX(2px); }
        .gr-option:hover::before { content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 60%; background-color: #42a5f5; border-radius: 2px; opacity: 0; animation: fadeIn 0.2s ease forwards; }
        @keyframes fadeIn { to { opacity: 1; } }
        .gr-option.selected { background-color: #e3f2fd !important; color: #1565c0 !important; font-weight: 600; }
        body.dark-mode .gr-option { color: #ffffff !important; }
        body.dark-mode .gr-option:hover { background-color: transparent !important; color: rgba(216, 168, 231, 0.95) !important; }
        body.dark-mode .gr-option:hover::before { background-color: rgba(216, 168, 231, 0.95); }
        body.dark-mode .gr-option.selected { background-color: rgba(216, 168, 231, 0.15) !important; color: rgba(216, 168, 231, 0.95) !important; }
        .gr-option.hidden { display: none; }
        .gr-group-label { padding: 10px 12px 4px 12px; font-size: 12px; font-weight: 700; color: #78909c; text-transform: uppercase; letter-spacing: 0.5px; cursor: default; user-select: none; }
        body.dark-mode .gr-group-label { color: rgba(255, 255, 255, 0.6); }
        .gr-no-results { padding: 32px 20px; text-align: center; color: #9e9e9e; font-size: 14px; }
        body.dark-mode .gr-no-results { color: rgba(255, 255, 255, 0.5); }
        .gr-select2-display { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; min-height: 38px; align-items: center; background-color: #ffffff; border: 1.5px solid #f0f0f0; border-radius: 8px; cursor: pointer; transition: border-color 0.2s ease, box-shadow 0.2s ease; box-sizing: border-box; width: 100%; }
        .gr-select2-display:hover { border-color: #64b5f6; }
        .gr-select2-display.gr-display-focus { border-color: #42a5f5; box-shadow: 0 0 0 2px rgba(66, 165, 245, 0.15); }
        body.dark-mode .gr-select2-display { background-color: rgba(40, 40, 40, 1); border: 1.5px solid rgba(80, 80, 80, 0.5); }
        body.dark-mode .gr-select2-display:hover { border-color: rgba(216, 168, 231, 0.5); }
        body.dark-mode .gr-select2-display.gr-display-focus { border-color: rgba(216, 168, 231, 0.7); box-shadow: 0 0 0 2px rgba(216, 168, 231, 0.1); }
        .gr-select2-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px 3px 8px; background-color: #e3f2fd; color: #1565c0; border-radius: 6px; font-size: 13px; font-weight: 500; line-height: 1.3; white-space: nowrap; max-width: 180px; animation: chipFadeIn 0.15s ease; }
        .gr-select2-chip span { overflow: hidden; text-overflow: ellipsis; }
        @keyframes chipFadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        body.dark-mode .gr-select2-chip { background-color: rgba(216, 168, 231, 0.15); color: rgba(216, 168, 231, 0.95); }
        .gr-select2-chip-remove { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border: none; background: transparent; color: inherit; cursor: pointer; border-radius: 50%; font-size: 14px; line-height: 1; padding: 0; flex-shrink: 0; opacity: 0.7; transition: opacity 0.15s ease, background-color 0.15s ease; }
        .gr-select2-chip-remove:hover { opacity: 1; background-color: rgba(0, 0, 0, 0.1); }
        body.dark-mode .gr-select2-chip-remove:hover { background-color: rgba(255, 255, 255, 0.1); }
        .gr-select2-placeholder { color: #b0b0b0; font-size: inherit; font-weight: 400; padding: 2px 0; user-select: none; pointer-events: none; }
        body.dark-mode .gr-select2-placeholder { color: rgba(255, 255, 255, 0.5); }
        .gr-option-pin { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); cursor: pointer; opacity: 0.2; transition: opacity 0.15s ease, transform 0.15s ease; padding: 2px; line-height: 1; display: flex; align-items: center; color: inherit; }
        .gr-option-pin:hover { opacity: 0.8; transform: translateY(-50%) scale(1.15); }
        .gr-option-pin.pinned { opacity: 0.7; color: #ff9800; }
        .gr-option-pin.pinned:hover { opacity: 1; }
        body.dark-mode .gr-option-pin.pinned { color: #ffb74d; }
        .gr-option.has-pin { padding-right: 26px !important; }
    `;

    // --- 3. 工具函数 ---
    const targetDoc = () => window.parent.document || document;
    
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
  
    function isMobile() {
        return window.innerWidth <= 768;
    }

    // 【终极修复】：智能事件触发器。根据不同的下拉框，使用不同的触发策略
    function smartTriggerChange(selectEl) {
        // 判断是否为世界书高度敏感区域（条目列表或世界书选择器）
        const isWorldInfoSensitive = selectEl.id === 'world_editor_select' || selectEl.closest('#world_popup_entries_list');

        if (isWorldInfoSensitive) {
            // 敏感区域：只触发单一事件，杜绝 SillyTavern 重复渲染条目的 BUG
            if (window.jQuery) {
                window.jQuery(selectEl).trigger('change');
            } else {
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            // 普通区域（如 WIMultiSelector 多选框）：必须原生+jQuery双重轰炸，防止丢属性和共存 BUG
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            selectEl.dispatchEvent(new Event('input', { bubbles: true })); // 补充原生 input
            if (window.jQuery) window.jQuery(selectEl).trigger('change');
        }
    }

    function closeDropdown() {
        const existingContainer = targetDoc().getElementById(CONTAINER_ID);
        if (existingContainer) {
            existingContainer.remove();
        }
        activeScrollListeners.forEach(({ element, handler }) => element.removeEventListener('scroll', handler, true));
        activeScrollListeners = [];
        targetDoc().querySelectorAll('.gr-select2-display.gr-display-focus').forEach(el => el.classList.remove('gr-display-focus'));
        targetDoc().querySelectorAll('.select2-container--focus').forEach(el => el.classList.remove('select2-container--focus'));
    }

    function toggleTheme() {
        isDarkMode = !isDarkMode;
        localStorage.setItem('gr-dark-mode', isDarkMode);
        if (isDarkMode) targetDoc().body.classList.add('dark-mode');
        else targetDoc().body.classList.remove('dark-mode');
    }

    // --- 3.5 select2 多选显示区域替换 ---
    function refreshSelect2Chips(hiddenSelect, state) {
        const { displayEl, select2Span } = state;
        displayEl.innerHTML = '';

        const selectedOptions = Array.from(hiddenSelect.selectedOptions);

        if (selectedOptions.length === 0) {
            const placeholderEl = targetDoc().createElement('span');
            placeholderEl.className = 'gr-select2-placeholder';
            if (select2Span) {
                const searchField = select2Span.querySelector('.select2-search__field');
                placeholderEl.textContent = searchField ? (searchField.getAttribute('placeholder') || '') : '';
            }
            displayEl.appendChild(placeholderEl);
            return;
        }

        selectedOptions.forEach(option => {
            const chip = targetDoc().createElement('span');
            chip.className = 'gr-select2-chip';
            chip.dataset.value = option.value;

            const textSpan = targetDoc().createElement('span');
            textSpan.textContent = option.textContent;
            chip.appendChild(textSpan);

            const removeBtn = targetDoc().createElement('button');
            removeBtn.className = 'gr-select2-chip-remove';
            removeBtn.type = 'button';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = '移除';
            removeBtn.setAttribute('aria-label', `移除 ${option.textContent}`);

            const handleRemove = (e) => {
                e.preventDefault();
                e.stopPropagation();
                option.selected = false;
                // 【使用智能分流触发】
                smartTriggerChange(hiddenSelect);
                refreshSelect2Chips(hiddenSelect, state);
                syncDropdownFromChips(hiddenSelect);
            };

            removeBtn.addEventListener('mousedown', handleRemove);
            removeBtn.addEventListener('touchend', (e) => {
                if (!e.target.closest('.gr-select2-chip-remove')) return;
                handleRemove(e);
            });

            chip.appendChild(removeBtn);
            displayEl.appendChild(chip);
        });
    }

    function syncDropdownFromChips(hiddenSelect) {
        const container = targetDoc().getElementById(CONTAINER_ID);
        if (!container) return;
        const optionsContainer = container.querySelector('.gr-options-container');
        if (!optionsContainer) return;

        optionsContainer.querySelectorAll('.gr-option').forEach(div => {
            const opt = Array.from(hiddenSelect.options).find(o => o.value === div.dataset.value);
            if (opt) div.classList.toggle('selected', opt.selected);
        });
    }

    function replaceSelect2Display(hiddenSelect) {
        if (replacedSelect2Displays.has(hiddenSelect)) return;

        const parentDiv = hiddenSelect.parentElement;
        if (!parentDiv) return;
        const select2Span = parentDiv.querySelector(':scope > span.select2-container');
        const isSelect2 = !!select2Span;

        const displayEl = targetDoc().createElement('div');
        displayEl.className = 'gr-select2-display';
        displayEl.dataset.grSelectId = hiddenSelect.id || hiddenSelect.getAttribute('data-select2-id') || '';

        if (isSelect2) {
            select2Span.style.display = 'none';
            parentDiv.insertBefore(displayEl, select2Span);
        } else {
            hiddenSelect.style.display = 'none';
            parentDiv.insertBefore(displayEl, hiddenSelect.nextSibling);
        }

        const state = { displayEl, select2Span: isSelect2 ? select2Span : null };
        replacedSelect2Displays.set(hiddenSelect, state);

        const optionObserver = new MutationObserver(() => refreshSelect2Chips(hiddenSelect, state));
        optionObserver.observe(hiddenSelect, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });

        hiddenSelect.addEventListener('change', () => refreshSelect2Chips(hiddenSelect, state));

        const cleanupObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (node === hiddenSelect || (node.contains && node.contains(hiddenSelect))) {
                        if (displayEl.parentElement) displayEl.remove();
                        replacedSelect2Displays.delete(hiddenSelect);
                        optionObserver.disconnect();
                        cleanupObserver.disconnect();
                        return;
                    }
                }
            }
        });
        cleanupObserver.observe(parentDiv, { childList: true });

        refreshSelect2Chips(hiddenSelect, state);
    }

    // --- 4. 核心逻辑：动态创建并挂载选项列表 ---
     function openDropdown(originalSelect) {
        closeDropdown();

        const isMultiSelectMode = originalSelect.hasAttribute('multiple');
        if (isMultiSelectMode) {
            originalSelect.multiple = true;
        }
        const isWorldInfoSelect = originalSelect.name === '$' && originalSelect.closest('#world_popup_entries_list');

        originalSelect.style.outline = 'none';
        
        const container = targetDoc().createElement('div');
        container.id = CONTAINER_ID;
        container.className = 'gr-container-enhanced open';

        const optionsList = targetDoc().createElement('div');
        optionsList.className = 'gr-options';

        ['mousedown', 'click', 'touchstart', 'touchend'].forEach(evt => {
            optionsList.addEventListener(evt, e => e.stopPropagation());
        });

        let isTouchScrolling = false;
        optionsList.addEventListener('touchstart', () => { isTouchScrolling = false; }, { passive: true });
        optionsList.addEventListener('touchmove', () => { isTouchScrolling = true; }, { passive: true });

        const searchBox = targetDoc().createElement('div');
        searchBox.className = 'gr-search-box';
        const searchInput = targetDoc().createElement('input');
        searchInput.className = 'gr-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = '搜索选项...';
        searchBox.appendChild(searchInput);
        
        const optionsContainer = targetDoc().createElement('div');
        optionsContainer.className = 'gr-options-container';

        // 主题切换选项
        const themeToggleOption = targetDoc().createElement('div');
        themeToggleOption.className = 'gr-option gr-theme-toggle';
        themeToggleOption.style.display = 'none';
        themeToggleOption.textContent = isDarkMode ? '切换到白天主题' : '切换到黑夜主题';
        const handleThemeToggle = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
            themeToggleOption.textContent = isDarkMode ? '切换到白天主题' : '切换到黑夜主题';
            themeToggleOption.style.display = 'none';
            searchInput.value = '';
            performSearch('');
        };
        themeToggleOption.addEventListener('mousedown', (e) => { if (e.button === 0) handleThemeToggle(e); });
        themeToggleOption.addEventListener('touchend', (e) => { if (!isTouchScrolling) handleThemeToggle(e); });
        optionsContainer.insertBefore(themeToggleOption, optionsContainer.firstChild);

        const THEME_CMD = '/切换主题';
        const performSearch = debounce((searchTerm) => {
            searchTerm = searchTerm.toLowerCase();
            let hasVisible = false;
            
            const groups = optionsContainer.querySelectorAll('.gr-group-label');
            groups.forEach(g => g.dataset.hasVisibleChild = 'false');

            optionsContainer.querySelectorAll('.gr-option:not(.gr-theme-toggle)').forEach(option => {
                const isVisible = option.textContent.toLowerCase().includes(searchTerm);
                option.classList.toggle('hidden', !isVisible);
                if (isVisible) {
                    hasVisible = true;
                    const prevGroup = getPreviousGroupLabel(option);
                    if (prevGroup) prevGroup.dataset.hasVisibleChild = 'true';
                }
            });

            groups.forEach(group => {
                group.style.display = (searchTerm && group.dataset.hasVisibleChild === 'false') ? 'none' : 'block';
            });

            // 主题切换选项：输入为命令前缀时显示
            if (searchTerm.length > 0 && THEME_CMD.startsWith(searchTerm)) {
                themeToggleOption.style.display = '';
                hasVisible = true;
            } else {
                themeToggleOption.style.display = 'none';
            }

            let noResultsMsg = optionsContainer.querySelector('.gr-no-results');
            if (!hasVisible && !noResultsMsg) {
                noResultsMsg = targetDoc().createElement('div');
                noResultsMsg.className = 'gr-no-results';
                noResultsMsg.textContent = '没有找到匹配的选项';
                optionsContainer.appendChild(noResultsMsg);
            } else if (hasVisible && noResultsMsg) {
                noResultsMsg.remove();
            }
        }, 200);

        function getPreviousGroupLabel(elem) {
            let prev = elem.previousElementSibling;
            while (prev) {
                if (prev.classList.contains('gr-group-label')) return prev;
                prev = prev.previousElementSibling;
            }
            return null;
        }

        searchInput.addEventListener('input', (e) => {
            performSearch(e.target.value);
        });

        let validOptionCount = 0;
        const createOptionDiv = (optionNode) => {
            if (optionNode.style && optionNode.style.display === 'none') return null;
            
            validOptionCount++;
            const customOption = targetDoc().createElement('div');
            customOption.className = 'gr-option';
            customOption.textContent = optionNode.textContent;
            customOption.dataset.value = optionNode.value;
            
            if (optionNode.selected) customOption.classList.add('selected');

            // 顶置图标（仅对启用了顶置功能的下拉框）
            if (isPinEnabled(originalSelect)) {
                customOption.classList.add('has-pin');
                const pinnedValues = getPinnedValues(originalSelect);
                const isPinned = pinnedValues.includes(optionNode.value);
                const pinIcon = targetDoc().createElement('span');
                pinIcon.className = 'gr-option-pin' + (isPinned ? ' pinned' : '');
                pinIcon.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z"/></svg>';
                pinIcon.title = isPinned ? '取消固定' : '固定选项';
                const handlePin = (e) => { e.preventDefault(); e.stopPropagation(); togglePinnedValue(originalSelect, optionNode.value); closeDropdown(); openDropdown(originalSelect); };
                pinIcon.addEventListener('mousedown', handlePin);
                pinIcon.addEventListener('touchend', (e) => { if (!isTouchScrolling) handlePin(e); });
                customOption.appendChild(pinIcon);
            }

            const handleSelect = (event) => {
                if (!event.target.closest('.gr-option')) return;

                if (isMultiSelectMode) {
                    const originalOption = Array.from(originalSelect.options).find(opt => opt.value === customOption.dataset.value);
                    if (originalOption) {
                        originalOption.selected = !originalOption.selected;
                        customOption.classList.toggle('selected');
                        // 【使用智能分流触发】
                        smartTriggerChange(originalSelect);
                    }
                } else {
                    originalSelect.value = customOption.dataset.value;
                    // 【使用智能分流触发】
                    smartTriggerChange(originalSelect);
                    closeDropdown();
                }
            };
            
            customOption.addEventListener('mousedown', (e) => { if (e.button === 0) { e.preventDefault(); handleSelect(e); }});
            customOption.addEventListener('touchend', (e) => { if (!isTouchScrolling) { e.preventDefault(); handleSelect(e); }});
            return customOption;
        };

        if (isMultiSelectMode) {
            const allOptions = Array.from(originalSelect.options);
            const selectedOptions = allOptions.filter(opt => opt.selected);
            const pinnedValues = isPinEnabled(originalSelect) ? getPinnedValues(originalSelect) : [];

            selectedOptions.forEach(opt => {
                const div = createOptionDiv(opt);
                if(div) optionsContainer.appendChild(div);
            });

            // 顶置的未选中选项
            if (pinnedValues.length > 0) {
                const pinnedUnselected = allOptions.filter(opt => !opt.selected && pinnedValues.includes(opt.value));
                if (pinnedUnselected.length > 0) {
                    const pinnedLabel = targetDoc().createElement('div');
                    pinnedLabel.className = 'gr-group-label';
                    pinnedLabel.textContent = '已固定';
                    optionsContainer.appendChild(pinnedLabel);
                    pinnedUnselected.forEach(opt => {
                        const div = createOptionDiv(opt);
                        if(div) optionsContainer.appendChild(div);
                    });
                }
            }

            // "其他"分区（仅当存在已固定选项时才显示）
            const hasPinnedItems = pinnedValues.length > 0 && allOptions.some(opt => !opt.selected && pinnedValues.includes(opt.value));
            let hasOther = false;
            Array.from(originalSelect.children).forEach(child => {
                if (child.tagName === 'OPTGROUP') {
                    const unselectedChildren = Array.from(child.children).filter(opt => opt.tagName === 'OPTION' && !opt.selected && !pinnedValues.includes(opt.value));
                    if (unselectedChildren.length > 0) {
                        if (!hasOther && hasPinnedItems) { hasOther = true; const otherLabel = targetDoc().createElement('div'); otherLabel.className = 'gr-group-label'; otherLabel.textContent = '其他'; optionsContainer.appendChild(otherLabel); }
                        const groupLabel = targetDoc().createElement('div');
                        groupLabel.textContent = child.label;
                        optionsContainer.appendChild(groupLabel);
                        unselectedChildren.forEach(opt => {
                            const div = createOptionDiv(opt);
                            if(div) optionsContainer.appendChild(div);
                        });
                    }
                } else if (child.tagName === 'OPTION' && !child.selected && !pinnedValues.includes(child.value)) {
                    if (!hasOther && hasPinnedItems) { hasOther = true; const otherLabel = targetDoc().createElement('div'); otherLabel.className = 'gr-group-label'; otherLabel.textContent = '其他'; optionsContainer.appendChild(otherLabel); }
                    const div = createOptionDiv(child);
                    if(div) optionsContainer.appendChild(div);
                }
            });
        } else if (isWorldInfoSelect && isWorldInfoCachePopulated) {
            worldInfoCache.options.forEach(cachedOpt => {
                const originalOption = Array.from(originalSelect.options).find(opt => opt.value === cachedOpt.value) || {};
                const fakeOptionNode = { textContent: cachedOpt.text, value: cachedOpt.value, selected: originalOption.selected || false };
                const div = createOptionDiv(fakeOptionNode);
                if(div) optionsContainer.appendChild(div);
            });
        } else if (originalSelect.id === 'world_editor_select') {
            const WORLDBOOK_CATEGORIES = [
                { priority: 0, label: null },
                { priority: 1, label: '全局世界书' },
                { priority: 2, label: '角色世界书' },
                { priority: 3, label: '附加世界书' },
                { priority: 4, label: '聊天世界书' },
                { priority: 5, label: null },
            ];

            // 尝试从 parent window（iframe 场景）或当前 window 获取世界书 API
            const resolveApiFn = (name) => {
                try {
                    if (typeof window.parent?.[name] === 'function') return window.parent[name];
                } catch (_) {}
                try {
                    if (typeof window[name] === 'function') return window[name];
                } catch (_) {}
                return null;
            };
            const _getGlobalWbNames = resolveApiFn('getGlobalWorldbookNames');
            const _getCharWbNames   = resolveApiFn('getCharWorldbookNames');
            const _getChatWbName    = resolveApiFn('getChatWorldbookName');

            function getWorldbookPriority(option) {
                if (option.selected) return 0;
                const text = option.textContent.trim();
                try {
                    if (_getGlobalWbNames) {
                        const globalNames = _getGlobalWbNames() || [];
                        if (globalNames.some(n => (n || '').trim() === text)) return 1;
                    }
                    if (_getCharWbNames) {
                        const cw = _getCharWbNames('current');
                        if (cw) {
                            if (cw.primary && cw.primary.trim() === text) return 2;
                            if (Array.isArray(cw.additional) && cw.additional.some(n => (n || '').trim() === text)) return 3;
                        }
                    }
                    if (_getChatWbName) {
                        const chatWb = _getChatWbName('current');
                        if (chatWb && chatWb.trim() === text) return 4;
                    }
                } catch (e) {
                    console.warn(`${SCRIPT_NAME} 世界书分类失败:`, e);
                }
                return 5;
            }

            const allOptions = [];
            Array.from(originalSelect.children).forEach(child => {
                if (child.tagName === 'OPTGROUP') {
                    Array.from(child.children).forEach(opt => {
                        if (opt.tagName === 'OPTION' && opt.style.display !== 'none') allOptions.push(opt);
                    });
                } else if (child.tagName === 'OPTION' && child.style.display !== 'none') {
                    allOptions.push(child);
                }
            });

            allOptions.sort((a, b) => getWorldbookPriority(a) - getWorldbookPriority(b));

            let lastPriority = -1;
            allOptions.forEach(opt => {
                const priority = getWorldbookPriority(opt);
                const cat = WORLDBOOK_CATEGORIES.find(c => c.priority === priority);
                if (cat && cat.label && priority !== lastPriority) {
                    const groupLabel = targetDoc().createElement('div');
                    groupLabel.className = 'gr-group-label';
                    groupLabel.textContent = cat.label;
                    optionsContainer.appendChild(groupLabel);
                }
                lastPriority = priority;
                const div = createOptionDiv(opt);
                if (div) optionsContainer.appendChild(div);
            });
        } else if (isPinEnabled(originalSelect)) {
            const pinnedValues = getPinnedValues(originalSelect);
            const selectedOpt = originalSelect.selectedOptions[0];
            const allOpts = [];

            Array.from(originalSelect.children).forEach(child => {
                if (child.tagName === 'OPTGROUP') {
                    Array.from(child.children).forEach(opt => {
                        if (opt.tagName === 'OPTION' && opt.style.display !== 'none') allOpts.push(opt);
                    });
                } else if (child.tagName === 'OPTION' && child.style.display !== 'none') {
                    allOpts.push(child);
                }
            });

            // 排序：当前选中 → 已固定 → 其余
            const sorted = allOpts.sort((a, b) => {
                const aRank = a === selectedOpt ? 0 : (pinnedValues.includes(a.value) ? 1 : 2);
                const bRank = b === selectedOpt ? 0 : (pinnedValues.includes(b.value) ? 1 : 2);
                return aRank - bRank;
            });

            const hasPinnedOpts = pinnedValues.length > 0 && allOpts.some(opt => pinnedValues.includes(opt.value));
            let lastRank = -1;
            sorted.forEach(opt => {
                const rank = opt === selectedOpt ? 0 : (pinnedValues.includes(opt.value) ? 1 : 2);
                if (rank === 1 && lastRank !== 1) {
                    const pinnedLabel = targetDoc().createElement('div');
                    pinnedLabel.className = 'gr-group-label';
                    pinnedLabel.textContent = '已固定';
                    optionsContainer.appendChild(pinnedLabel);
                }
                if (rank === 2 && lastRank !== 2 && hasPinnedOpts) {
                    const otherLabel = targetDoc().createElement('div');
                    otherLabel.className = 'gr-group-label';
                    otherLabel.textContent = '其他';
                    optionsContainer.appendChild(otherLabel);
                }
                lastRank = rank;
                const div = createOptionDiv(opt);
                if(div) optionsContainer.appendChild(div);
            });
        } else {
            Array.from(originalSelect.children).forEach(child => {
                if (child.tagName === 'OPTGROUP') {
                    const groupLabel = targetDoc().createElement('div');
                    groupLabel.className = 'gr-group-label';
                    groupLabel.textContent = child.label;
                    optionsContainer.appendChild(groupLabel);

                    Array.from(child.children).forEach(opt => {
                        if (opt.tagName === 'OPTION') {
                            const div = createOptionDiv(opt);
                            if(div) optionsContainer.appendChild(div);
                        }
                    });
                } else if (child.tagName === 'OPTION') {
                    const div = createOptionDiv(child);
                    if(div) optionsContainer.appendChild(div);
                }
            });
        }

        let positionSource = originalSelect;
        const select2State = replacedSelect2Displays.get(originalSelect);
        
        // 【核心修复：如果没有被我们的UI替换，则寻找原生的 Select2 容器作为锚点计算宽度和坐标】
        if (select2State) {
            positionSource = select2State.displayEl;
            select2State.displayEl.classList.add('gr-display-focus');
        } else if (originalSelect.classList.contains('select2-hidden-accessible') || originalSelect.hasAttribute('data-select2-id')) {
            const parent = originalSelect.parentElement;
            if (parent) {
                const nativeSelect2 = parent.querySelector('.select2-container');
                if (nativeSelect2) {
                    positionSource = nativeSelect2;
                    nativeSelect2.classList.add('select2-container--focus');
                }
            }
        }
        
        const rect = positionSource.getBoundingClientRect();
        let finalWidth = rect.width; 
        
        if (originalSelect.id === 'qr--set' && isMobile()) {
            const targetEditor = targetDoc().querySelector("#qr--editor");
            if (targetEditor) finalWidth = targetEditor.getBoundingClientRect().right - rect.left;
        } else {
            const targetWidthId = WIDTH_TARGETS[originalSelect.id];
            if (targetWidthId) {
                const targetElement = targetDoc().getElementById(targetWidthId);
                if (targetElement) finalWidth = targetElement.getBoundingClientRect().right - rect.left;
            }
        }

        container.style.width = `${finalWidth}px`;
        container.style.height = `${rect.height}px`;

        const TOP_BOUNDARY_ID = 'top-settings-holder';
        const BOTTOM_BOUNDARY_ID = 'send_form';
        const BOUNDARY_MARGIN = 10;
        const originalSelectRect = positionSource.getBoundingClientRect(); // 基于视觉实际元素计算
        const topBoundaryEl = targetDoc().getElementById(TOP_BOUNDARY_ID);
        const bottomBoundaryEl = targetDoc().getElementById(BOTTOM_BOUNDARY_ID);
        let maxAvailableHeight;
        
        const spaceBelow = window.innerHeight - originalSelectRect.bottom;
        const estimatedMaxHeight = 350; 
        const isDropUp = (spaceBelow < estimatedMaxHeight && originalSelectRect.top > estimatedMaxHeight);
        
        if (isDropUp) {
            container.classList.add('drop-up');
            optionsList.appendChild(optionsContainer);
            optionsList.appendChild(searchBox);
            if (topBoundaryEl) {
                const topBoundaryRect = topBoundaryEl.getBoundingClientRect();
                maxAvailableHeight = originalSelectRect.top - topBoundaryRect.bottom - BOUNDARY_MARGIN;
            } else {
                maxAvailableHeight = originalSelectRect.top - BOUNDARY_MARGIN;
            }
        } else {
            optionsList.appendChild(searchBox);
            optionsList.appendChild(optionsContainer);
            if (bottomBoundaryEl) {
                const bottomBoundaryRect = bottomBoundaryEl.getBoundingClientRect();
                maxAvailableHeight = bottomBoundaryRect.top - originalSelectRect.bottom - BOUNDARY_MARGIN;
            } else {
                maxAvailableHeight = window.innerHeight - originalSelectRect.bottom - BOUNDARY_MARGIN;
            }
        }
        optionsList.style.maxHeight = `${Math.max(100, maxAvailableHeight)}px`;
        searchBox.style.display = validOptionCount >= 10 ? 'block' : 'none';

        const parentDialog = originalSelect.closest('dialog');
        const appendTarget = parentDialog || targetDoc().body;
        
        if (parentDialog) {
            const scrollContainer = parentDialog.querySelector('.popup-body') || parentDialog;
            const parentRect = parentDialog.getBoundingClientRect();
            container.style.top = `${rect.top - parentRect.top + scrollContainer.scrollTop}px`;
            container.style.left = `${rect.left - parentRect.left + scrollContainer.scrollLeft}px`;
        } else {
            container.style.top = `${rect.top + window.scrollY}px`;
            container.style.left = `${rect.left + window.scrollX}px`;
        }

        container.appendChild(optionsList);
        appendTarget.appendChild(container);

        const scrollHandler = (event) => {
            if (optionsList.contains(event.target)) return;
            const activeEl = targetDoc().activeElement;
            if (activeEl && activeEl === searchInput) return;
            closeDropdown();
        };
        
        let parent = originalSelect.parentElement;
        while (parent) {
            activeScrollListeners.push({ element: parent, handler: scrollHandler });
            parent.addEventListener('scroll', scrollHandler, true);
            parent = parent.parentElement;
        }
        activeScrollListeners.push({ element: window, handler: scrollHandler });
        window.addEventListener('scroll', scrollHandler, true);

        setTimeout(() => {
            if (!isMobile() && validOptionCount >= 10) {
                searchInput.focus();
            }
            const selectedItem = optionsContainer.querySelector('.selected');
            if (selectedItem) {
                optionsList.scrollTop = selectedItem.offsetTop - (optionsList.clientHeight / 2);
            }
        }, 10);
    }

    function checkExemptionRules(originalSelect, forceReplace) {
        if (forceReplace) return true;
        const isSelect2 = originalSelect.classList.contains('select2-hidden-accessible') || originalSelect.hasAttribute('data-select2-id');
        const isMultiSelect = originalSelect.hasAttribute('multiple');
        
        if (isMultiSelect) return true;

        if (isSelect2 && !originalSelect.closest('#WIMultiSelector')) {
            return false;
        }
        return true;
    }

    function handleSelectTrigger(e, forceReplace = false) {
        let targetSelect = e.target.closest('select:not([multiple])') || e.target.closest('select[multiple]');

        // 如果点击的是原生的 select2 容器
        if (!targetSelect && e.target.closest('.select2-container')) {
            // 【放行删除按钮】：如果点的是原生标签上的 "x" 按钮，直接让原生处理删除，不要弹窗！
            if (e.target.closest('.select2-selection__choice__remove')) {
                return false;
            }
            
            const select2Element = e.target.closest('.select2-container');
            const select2Id = select2Element.getAttribute('data-select2-id') || select2Element.id?.replace('select2-', '');
            if (select2Id) {
                targetSelect = targetDoc().querySelector(`select[data-select2-id="${select2Id}"]`) ||
                               targetDoc().querySelector(`select#${select2Id}`);
            }
        }

        // 如果点击的是我们的自定义容器
        if (!targetSelect && e.target.closest('.gr-select2-display')) {
            if (e.target.closest('.gr-select2-chip-remove')) return false;
            const displayEl = e.target.closest('.gr-select2-display');
            const selectId = displayEl.dataset.grSelectId;
            if (selectId) {
                targetSelect = targetDoc().getElementById(selectId) ||
                               targetDoc().querySelector(`select[data-select2-id="${selectId}"]`);
            }
        }

        if (!targetSelect) return false;

        // 【核心修改：白名单 UI 替换限制】
        const isMultiSelect = targetSelect.hasAttribute('multiple');
        if (isMultiSelect) {
            // 只替换白名单区域的多选框显示区域 (UI)
            if (targetSelect.closest('#WIMultiSelector .range-block-range')) {
                if (!replacedSelect2Displays.has(targetSelect)) {
                    replaceSelect2Display(targetSelect);
                }
            }
            // 【极其重要】：这里不再有 return false。所有的多选框都会顺畅流向后面的代码，呼出我们的悬浮列表！
        }

        if (!checkExemptionRules(targetSelect, forceReplace)) return false;

        e.preventDefault();
        e.stopPropagation();

        // 强行关闭原生的 Select2 悬浮列表，防止双重弹窗
        if (window.jQuery && window.jQuery(targetSelect).data('select2')) {
            setTimeout(() => window.jQuery(targetSelect).select2('close'), 0);
        }

        const isOpen = targetDoc().getElementById(CONTAINER_ID) !== null;
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown(targetSelect);
        }
        return true;
    }

    function initialize() {
        console.log(`${SCRIPT_NAME} 正在初始化...`);

        const styleSheet = targetDoc().createElement("style");
        styleSheet.innerText = customStyles;
        targetDoc().head.appendChild(styleSheet);
        if (isDarkMode) targetDoc().body.classList.add('dark-mode');

        targetDoc().addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            handleSelectTrigger(e);
        }, true);

        targetDoc().addEventListener('touchstart', (e) => {
            handleSelectTrigger(e);
        }, { passive: false, capture: true });

        targetDoc().addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                const select = targetDoc().activeElement;
                if (select && select.tagName === 'SELECT') {
                    if (handleSelectTrigger({ target: select, preventDefault: ()=>e.preventDefault(), stopPropagation: ()=>e.stopPropagation() })) {
                        e.preventDefault();
                    }
                }
            }
        });

        targetDoc().addEventListener('click', (e) => {
            if (!e.target.closest('.gr-container-enhanced') && !e.target.closest('.gr-select2-display') && e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') {
                closeDropdown();
            }
        });

        window.addEventListener('resize', () => {
            const activeEl = targetDoc().activeElement;
            if (activeEl && activeEl.matches('.gr-container-enhanced.open .gr-search-input')) return;
            closeDropdown();
        });

        const lorebookButtonSelector = "#avatar_controls > div > div.chat_lorebook_button.menu_button.fa-solid.fa-passport.interactable";
        const lorebookButton = targetDoc().querySelector(lorebookButtonSelector);
        if (lorebookButton) {
            lorebookButton.addEventListener('click', () => {
                setTimeout(() => {
                    const popupSelect = targetDoc().querySelector("body > dialog > div.popup-body > div.popup-content > div > div.range-block-range.wide100p > select");
                    if (popupSelect) {
                        popupSelect.addEventListener('mousedown', (e) => handleSelectTrigger(e, true));
                    }
                }, 150);
            });
        }

        const worldInfoDrawer = targetDoc().getElementById('WorldInfo');
        if (worldInfoDrawer) {
            const worldInfoObserver = new MutationObserver((mutations) => {
                mutations.forEach(m => {
                    if (m.attributeName === 'class') {
                        if (m.target.classList.contains('openDrawer')) {
                            const entriesList = targetDoc().getElementById('world_popup_entries_list');
                            if (entriesList && !entriesListObserver) {
                                entriesListObserver = new MutationObserver(() => {
                                    if (isWorldInfoCachePopulated || entriesList.style.display === 'none') return;
                                    const sampleSelect = entriesList.querySelector('div:nth-child(2) > form > div select[name="$"]');
                                    if (sampleSelect && sampleSelect.options.length > 1) {
                                        worldInfoCache.options = Array.from(sampleSelect.options).map(o => ({ text: o.textContent, value: o.value }));
                                        isWorldInfoCachePopulated = true;
                                    }
                                });
                                entriesListObserver.observe(entriesList, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
                            }
                        } else if (m.target.classList.contains('closedDrawer')) {
                            if (entriesListObserver) {
                                entriesListObserver.disconnect();
                                entriesListObserver = null;
                            }
                        }
                    }
                });
            });
            worldInfoObserver.observe(worldInfoDrawer, { attributes: true, attributeFilter: ['class'] });
        }

        function scanAndReplaceSelect2Displays() {
            // 只给白名单里的多选框换皮
            const targetMultiSelects = targetDoc().querySelectorAll('#WIMultiSelector .range-block-range select[multiple]');
            targetMultiSelects.forEach(sel => {
                if (replacedSelect2Displays.has(sel)) return;
                if (sel.parentElement && sel.parentElement.querySelector(':scope > .gr-select2-display')) return;
                replaceSelect2Display(sel);
            });
        }
        scanAndReplaceSelect2Displays();

        const select2DisplayObserver = new MutationObserver(debounce(() => {
            scanAndReplaceSelect2Displays();
        }, 500));
        select2DisplayObserver.observe(targetDoc().body, { childList: true, subtree: true });

        console.log(`${SCRIPT_NAME} 载入完毕！UI 替换白名单限制与全局列表拦截已生效。`);
    }

    if (targetDoc().readyState === 'complete') {
        initialize();
    } else {
        window.parent.addEventListener('load', initialize, { once: true });
    }

})();
