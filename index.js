(async () => {
    "use strict";

    // --- 1. 配置 ---
    const SCRIPT_NAME = '[The Great Replacer V1.3]'; // 版本号更新
    const REPLACED_MARKER = 'data-great-replacer-processed-v2';

    // 需要向上弹出的<select>元素的ID列表
    const DROP_UP_IDS = ['custom_prompt_post_processing', 'model_custom_select'];

    // 需要延伸宽度的<select>及其目标容器ID的映射
    const WIDTH_TARGETS = {
        'themes': 'UI-Theme-Block',
        'world_editor_select': 'WorldInfo',
        'settings_preset_openai': 'left-nav-panel',
        'completion_prompt_manager_footer_append_prompt': 'left-nav-panel',
        'extensionTopBarChatName': 'extensionTopBar'
    };
    
    // 为 world_popup_entries_list 中的下拉框提供选项缓存
    const worldInfoCache = {
        options: []
    };
    // 标志位，表示缓存是否已成功填充，防止重复缓存
    let isWorldInfoCachePopulated = false;

    // 用于监听 WorldInfo 内部变化的观察者，初始为 null
    let entriesListObserver = null;

    // 主题状态
    let isDarkMode = localStorage.getItem('gr-dark-mode') === 'true';

    // --- 核心修改开始 (1/4): 增加一个状态对象来管理特殊过滤 ---
    // 这个对象将以 select 的 ID 为键，存储其过滤状态 (true/false)
    const specialFilterState = {};
    // --- 核心修改结束 (1/4) ---

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
        
        /* 暗色模式样式 */
        body.dark-mode .gr-options {
            background-color: rgba(30, 30, 30, 1) !important;
            border: 1px solid rgba(60, 60, 60, 0.5) !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
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
        
        /* 暗色模式输入框样式 */
        body.dark-mode .gr-options input[type="text"],
        body.dark-mode .gr-options input:not([type]),
        body.dark-mode .gr-options textarea:not([type="search"]) {
            background-color: rgba(50, 50, 50, 1) !important;
            border: 1.5px solid rgba(80, 80, 80, 0.5) !important;
            color: #ffffff !important;
        }
        body.dark-mode .gr-options input[type="text"]:hover,
        body.dark-mode .gr-options input:not([type]):hover,
        body.dark-mode .gr-options textarea:not([type="search"]):hover {
            border-color: rgba(216, 168, 231, 0.5) !important;
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
        
        /* 暗色模式搜索框背景 */
        body.dark-mode .gr-search-box {
            background: linear-gradient(to bottom, rgba(30, 30, 30, 1) 90%, rgba(30, 30, 30, 0));
        }
        body.dark-mode .gr-container-enhanced.drop-up .gr-search-box {
            background: linear-gradient(to top, rgba(30, 30, 30, 1) 90%, rgba(30, 30, 30, 0));
        }
        .gr-search-input {
            width: 100%; padding: 8px 12px; border: 1.5px solid #f5f5f5;
            border-radius: 8px; font-size: inherit; font-weight: 400; outline: none;
            box-sizing: border-box; background-color: #fafafa !important; color: #333 !important;
            transition: border-color 0.2s ease, background-color 0.2s ease;
            -webkit-appearance: none !important; appearance: none !important;
            cursor: text !important;
            caret-color: transparent; /* 默认隐藏光标 */
        }
        .gr-search-input::placeholder { color: #b0b0b0; }
        .gr-search-input:hover {
            border-color: #64b5f6 !important;
        }
        .gr-search-input:focus {
            background-color: #ffffff !important;
            border-color: #42a5f5 !important;
            caret-color: #42a5f5; /* 只在聚焦时显示光标 */
        }
        
        /* 暗色模式搜索输入框 */
        body.dark-mode .gr-search-input {
            background-color: rgba(50, 50, 50, 1) !important;
            color: #ffffff !important;
            border: 1.5px solid rgba(80, 80, 80, 0.5) !important;
            caret-color: transparent; /* 默认隐藏光标 */
        }
        body.dark-mode .gr-search-input::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }
        body.dark-mode .gr-search-input:hover {
            border-color: rgba(216, 168, 231, 0.5) !important;
        }
        body.dark-mode .gr-search-input:focus {
            background-color: rgba(40, 40, 40, 1) !important;
            border-color: rgba(216, 168, 231, 0.7) !important;
            caret-color: rgba(216, 168, 231, 0.7); /* 只在聚焦时显示紫色光标 */
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
        
        /* 暗色模式选项样式 */
        body.dark-mode .gr-option {
            color: #ffffff !important;
        }
        body.dark-mode .gr-option:hover {
            background-color: transparent !important; /* 悬停时不要背景色 */
            color: rgba(216, 168, 231, 0.95) !important; /* 只改变文字颜色 */
        }
        body.dark-mode .gr-option:hover::before {
            background-color: rgba(216, 168, 231, 0.95); /* 左侧指示条颜色 */
        }
        body.dark-mode .gr-option.selected {
            background-color: rgba(216, 168, 231, 0.15) !important; /* 选中项的背景色 */
            color: rgba(216, 168, 231, 0.95) !important;
        }
        .gr-option.hidden { display: none; }

        /* optgroup 标签的样式 */
        .gr-group-label {
            padding: 10px 12px 4px 12px;
            font-size: 12px;
            font-weight: 700;
            color: #78909c;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: default;
            user-select: none;
        }
        
        /* 暗色模式组标签 */
        body.dark-mode .gr-group-label {
            color: rgba(255, 255, 255, 0.6);
        }

        .gr-no-results {
            padding: 32px 20px; text-align: center; color: #9e9e9e; font-size: 14px;
        }
        
        /* 暗色模式无结果提示 */
        body.dark-mode .gr-no-results {
            color: rgba(255, 255, 255, 0.5);
        }
    `;

    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

	function replaceSelect(originalSelect, forceReplace = false) {
		if (originalSelect.hasAttribute(REPLACED_MARKER)) return;

		if (!forceReplace && originalSelect.closest('.popup')) {
			return;
		}
		if (forceReplace) {
			console.log(`${SCRIPT_NAME}: Force-replacing a whitelisted <select> element inside a popup.`, originalSelect);
		}

		if (originalSelect.classList.contains('select2-hidden-accessible') || originalSelect.hasAttribute('data-select2-id')) {
			if (!originalSelect.closest('#WIMultiSelector')) {
				return;
			}
		}

		const isMultiSelectMode = originalSelect.closest('#WIMultiSelector') !== null;
		if (isMultiSelectMode) {
			originalSelect.multiple = true;
		}
        
        // --- 核心修改开始 (2/4): 识别目标下拉框并初始化其过滤状态 ---
        const isPresetManagerSelect = originalSelect.id === 'completion_prompt_manager_footer_append_prompt';
        if (isPresetManagerSelect) {
            // 默认关闭过滤
            specialFilterState[originalSelect.id] = false; 
            console.log(`${SCRIPT_NAME}: Detected Preset Manager dropdown. Special commands enabled: /过滤, /取消过滤`);
        }
        // --- 核心修改结束 (2/4) ---

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

		['mousedown', 'click', 'touchstart', 'touchend'].forEach(eventType => {
			optionsList.addEventListener(eventType, (e) => {
				e.stopPropagation();
			});
		});

		let isTouchScrolling = false;
		optionsList.addEventListener('touchstart', () => { isTouchScrolling = false; }, { passive: true });
		optionsList.addEventListener('touchmove', () => { isTouchScrolling = true; }, { passive: true });

		const searchBox = window.parent.document.createElement('div');
		searchBox.className = 'gr-search-box';
		searchBox.style.display = 'none';
		const searchInput = window.parent.document.createElement('input');
		searchInput.className = 'gr-search-input';
		searchInput.type = 'text';
		searchInput.placeholder = '搜索或输入命令...'; // 更新提示文本
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
		
        // --- 核心修改开始 (3/4): 修改搜索框的 input 事件，加入命令处理 ---
		searchInput.addEventListener('input', (e) => {
			const searchTerm = e.target.value;
            
            // 检查是否为预设管理器的特殊命令
            if (isPresetManagerSelect) {
                if (searchTerm === '/过滤') {
                    specialFilterState[originalSelect.id] = true;
                    console.log(`${SCRIPT_NAME}: 预设管理器(${originalSelect.id}) 已开启过滤模式。`);
                    searchInput.value = ''; // 清空输入框
                    populateOptions();      // 重新填充选项以应用过滤
                    performSearch('');      // 重置搜索
                    return; // 阻止后续的普通搜索
                }
                if (searchTerm === '/取消过滤') {
                    specialFilterState[originalSelect.id] = false;
                    console.log(`${SCRIPT_NAME}: 预设管理器(${originalSelect.id}) 已关闭过滤模式。`);
                    searchInput.value = '';
                    populateOptions();
                    performSearch('');
                    return;
                }
            }
            
            // 原有的主题切换命令
			if (searchTerm === '/切换主题') {
				toggleTheme();
				searchInput.value = '';
				performSearch('');
				return;
			}

			performSearch(searchTerm);
		});
        // --- 核心修改结束 (3/4) ---
		
		function updateContainerPosition() {
			if (!window.parent.document.body.contains(originalSelect)) return;
		
			const parentDialog = originalSelect.closest('dialog');
		
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
			container.style.width = `${finalWidth}px`;
			container.style.height = `${rect.height}px`;
		
			if (parentDialog) {
				const parentRect = parentDialog.getBoundingClientRect();
				const scrollContainer = parentDialog.querySelector('.popup-body') || parentDialog;
				container.style.top = `${rect.top - parentRect.top + scrollContainer.scrollTop}px`;
				container.style.left = `${rect.left - parentRect.left + scrollContainer.scrollLeft}px`;
			} else {
				container.style.top = `${rect.top + window.scrollY}px`;
				container.style.left = `${rect.left + window.scrollX}px`;
			}
		}
		
		const isWorldInfoSelect = originalSelect.name === '$' && originalSelect.closest('#world_popup_entries_list');
		
		function populateOptions() {
			optionsContainer.innerHTML = '';
			
			const createOptionDiv = (optionNode) => {
				const customOption = window.parent.document.createElement('div');
				customOption.className = 'gr-option';
				customOption.textContent = optionNode.textContent;
				customOption.dataset.value = optionNode.value;
				
				if (optionNode.selected) {
					customOption.classList.add('selected');
				}

				const handleSelect = (event) => {
					if (!event.target.closest('.gr-option')) return;
					if (!container.classList.contains('open')) return;
					
					if (isMultiSelectMode) {
						const originalOption = Array.from(originalSelect.options).find(opt => opt.value === customOption.dataset.value);
						if (originalOption) {
							originalOption.selected = !originalOption.selected;
							customOption.classList.toggle('selected');
							originalSelect.dispatchEvent(new Event('change', { 'bubbles': true }));
						}
					} else {
						originalSelect.value = customOption.dataset.value;
						originalSelect.dispatchEvent(new Event('change', { 'bubbles': true }));
						container.classList.remove('open');
					}
				};
				
				customOption.addEventListener('mousedown', (e) => {
					if (e.button === 0) {
						e.preventDefault();
						handleSelect(e);
					}
				});

				customOption.addEventListener('touchend', (e) => {
					if (!isTouchScrolling) {
						e.preventDefault();
						handleSelect(e);
					}
				});

				return customOption;
			};

			// --- 核心修改开始 (4/4): 修改 populateOptions 函数以集成过滤逻辑 ---
            const isFilterActive = isPresetManagerSelect && specialFilterState[originalSelect.id] === true;

            if (isFilterActive) {
                // 如果是预设管理器且过滤已开启
                const listSelector = '#completion_prompt_manager_list';
                const listItemSelector = 'li[data-pm-identifier]';
                const list = window.parent.document.querySelector(listSelector);
                const existingIdentifiers = new Set();

                if (list) {
                    list.querySelectorAll(listItemSelector).forEach(item => {
                        const identifier = item.dataset.pmIdentifier;
                        if (identifier) existingIdentifiers.add(identifier);
                    });
                } else {
                    console.warn(`${SCRIPT_NAME}: Filter is active, but list '${listSelector}' was not found.`);
                }

                Array.from(originalSelect.options).forEach(optionNode => {
                    // 如果选项的值不在已存在的标识符集合中，或者选项没有值（通常是占位符），则创建它
                    if (!optionNode.value || !existingIdentifiers.has(optionNode.value)) {
                        optionsContainer.appendChild(createOptionDiv(optionNode));
                    }
                });

            } else if (isMultiSelectMode) {
				// 多选模式的逻辑
				const allOptions = Array.from(originalSelect.options);
				const selectedOptions = allOptions.filter(opt => opt.selected);
				
				selectedOptions.forEach(optionNode => {
					optionsContainer.appendChild(createOptionDiv(optionNode));
				});
				
				Array.from(originalSelect.children).forEach(child => {
					if (child.tagName === 'OPTGROUP') {
						const unselectedChildren = Array.from(child.children).filter(opt => opt.tagName === 'OPTION' && !opt.selected);
						if (unselectedChildren.length > 0) {
							const groupLabel = window.parent.document.createElement('div');
							groupLabel.className = 'gr-group-label';
							groupLabel.textContent = child.label;
							optionsContainer.appendChild(groupLabel);
							unselectedChildren.forEach(optionNode => {
								optionsContainer.appendChild(createOptionDiv(optionNode));
							});
						}
					} else if (child.tagName === 'OPTION' && !child.selected) {
						optionsContainer.appendChild(createOptionDiv(child));
					}
				});

			} else if (isWorldInfoSelect && isWorldInfoCachePopulated) {
				// WorldInfo 的缓存逻辑
				worldInfoCache.options.forEach(cachedOpt => {
					const originalOption = Array.from(originalSelect.options).find(opt => opt.value === cachedOpt.value) || {};
					const fakeOptionNode = {
						textContent: cachedOpt.text,
						value: cachedOpt.value,
						selected: originalOption.selected || false
					};
					optionsContainer.appendChild(createOptionDiv(fakeOptionNode));
				});
			} else {
				// 默认的通用逻辑
				Array.from(originalSelect.children).forEach(child => {
					if (child.tagName === 'OPTGROUP') {
						const groupLabel = window.parent.document.createElement('div');
						groupLabel.className = 'gr-group-label';
						groupLabel.textContent = child.label;
						optionsContainer.appendChild(groupLabel);

						Array.from(child.children).forEach(optionNode => {
							if (optionNode.tagName === 'OPTION') {
								optionsContainer.appendChild(createOptionDiv(optionNode));
							}
						});
					} else if (child.tagName === 'OPTION') {
						optionsContainer.appendChild(createOptionDiv(child));
					}
				});
			}
			// --- 核心修改结束 (4/4) ---
			
			searchBox.style.display = originalSelect.options.length >= 10 ? 'block' : 'none';
			// 注意：这里我们不再重置 searchInput 的值，因为它可能包含用户正在输入的命令或搜索词
			performSearch(searchInput.value);
		}
		
		populateOptions();

		let scrollListeners = [];
		
		const openDropdown = (e) => {
			e.preventDefault();
			e.stopPropagation();

			if (container.classList.contains('open')) {
				container.classList.remove('open');
				scrollListeners.forEach(({ element, handler }) => element.removeEventListener('scroll', handler, true));
				scrollListeners = [];
				return;
			}
			window.parent.document.querySelectorAll('.gr-container-enhanced.open').forEach(c => c.classList.remove('open'));
			
			updateContainerPosition();

			const TOP_BOUNDARY_ID = 'top-settings-holder';
			const BOTTOM_BOUNDARY_ID = 'send_form';
			const BOUNDARY_MARGIN = 10;
			const originalSelectRect = originalSelect.getBoundingClientRect();
			const topBoundaryEl = window.parent.document.getElementById(TOP_BOUNDARY_ID);
			const bottomBoundaryEl = window.parent.document.getElementById(BOTTOM_BOUNDARY_ID);
			let maxAvailableHeight;
			if (container.classList.contains('drop-up')) {
				if (topBoundaryEl) {
					const topBoundaryRect = topBoundaryEl.getBoundingClientRect();
					maxAvailableHeight = originalSelectRect.top - topBoundaryRect.bottom - BOUNDARY_MARGIN;
				} else {
					maxAvailableHeight = originalSelectRect.top - BOUNDARY_MARGIN;
				}
			} else {
				if (bottomBoundaryEl) {
					const bottomBoundaryRect = bottomBoundaryEl.getBoundingClientRect();
					maxAvailableHeight = bottomBoundaryRect.top - originalSelectRect.bottom - BOUNDARY_MARGIN;
				} else {
					maxAvailableHeight = window.innerHeight - originalSelectRect.bottom - BOUNDARY_MARGIN;
				}
			}
			optionsList.style.maxHeight = `${Math.max(0, maxAvailableHeight)}px`;
			
			container.classList.add('open');
			populateOptions();
			
			const scrollHandler = (event) => {
				if (optionsList.contains(event.target)) return;
				const activeEl = window.parent.document.activeElement;
				if (activeEl && activeEl === searchInput) {
					return;
				}

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
		};

		originalSelect.addEventListener('mousedown', openDropdown);
		originalSelect.addEventListener('touchend', openDropdown);

		originalSelect.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
		});

		container.appendChild(optionsList);

		const parentDialog = originalSelect.closest('dialog');
		const appendTarget = parentDialog || window.parent.document.body;
		appendTarget.appendChild(container);
	}
    
    function startObservingEntriesList() {
        if (entriesListObserver) return; 

        const entriesList = window.parent.document.getElementById('world_popup_entries_list');
        if (!entriesList) {
            console.warn(`${SCRIPT_NAME}: Could not find 'world_popup_entries_list' to observe.`);
            return;
        }

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
        }
    }

    function toggleTheme() {
        isDarkMode = !isDarkMode;
        localStorage.setItem('gr-dark-mode', isDarkMode);
        
        if (isDarkMode) {
            window.parent.document.body.classList.add('dark-mode');
        } else {
            window.parent.document.body.classList.remove('dark-mode');
        }
        
        console.log(`${SCRIPT_NAME}: 主题已切换为 ${isDarkMode ? '暗色' : '亮色'} 模式`);
    }
    
    function initialize() {
        console.log(`${SCRIPT_NAME} is running!`);

        const styleSheet = window.parent.document.createElement("style");
        styleSheet.innerText = customStyles;
        window.parent.document.head.appendChild(styleSheet);
        
        if (isDarkMode) {
            window.parent.document.body.classList.add('dark-mode');
        }
        
        const lorebookButtonSelector = "#avatar_controls > div > div.chat_lorebook_button.menu_button.fa-solid.fa-passport.interactable";
        const lorebookButton = window.parent.document.querySelector(lorebookButtonSelector);

        if (lorebookButton) {
            lorebookButton.addEventListener('click', () => {
                setTimeout(() => {
                    const popupSelectSelector = "body > dialog > div.popup-body > div.popup-content > div > div.range-block-range.wide100p > select";
                    const popupSelect = window.parent.document.querySelector(popupSelectSelector);
                    
                    if (popupSelect && !popupSelect.hasAttribute(REPLACED_MARKER)) {
                        replaceSelect(popupSelect, true);
                    }
                }, 100);
            });
        }
        
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

        window.addEventListener('resize', () => {
            const activeEl = window.parent.document.activeElement;
            if (activeEl && activeEl.matches('.gr-container-enhanced.open .gr-search-input')) {
                return;
            }
            closeAllOpenDropdowns();
        });
        
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
        }

        console.log(`${SCRIPT_NAME} initialization complete.`);
    }

    if (window.parent.document.readyState === 'complete') {
        initialize();
    } else {
        window.parent.addEventListener('load', initialize, { once: true });
    }

})();
