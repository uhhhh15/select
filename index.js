(async () => {
    "use strict";

    // --- 1. 配置与全局常量 ---
    const SCRIPT_NAME = '[下拉选项框美化]';
    const CONTAINER_ID = 'gr-global-dropdown-container';
    const STORAGE_KEY = '[酒馆]酒馆助手脚本-下拉选项框美化';

    // 统一存储管理
    const Storage = {
        data: null,
        init() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                this.data = raw ? JSON.parse(raw) : { settings: {}, pinned: {}, meta: {} };
                // 迁移旧数据
                this.migrateOldStorage();
            } catch { this.data = { settings: {}, pinned: {}, meta: {} }; }
        },
        migrateOldStorage() {
            // 迁移 dark mode
            const oldDarkMode = localStorage.getItem('gr-dark-mode');
            if (oldDarkMode !== null && !this.data.settings.hasOwnProperty('darkMode')) {
                this.data.settings.darkMode = oldDarkMode === 'true';
                localStorage.removeItem('gr-dark-mode');
            }
            // 迁移 preset filter
            const oldPresetFilter = localStorage.getItem('gr-preset-filter-enabled');
            if (oldPresetFilter !== null && !this.data.settings.hasOwnProperty('presetFilterEnabled')) {
                this.data.settings.presetFilterEnabled = oldPresetFilter === 'true';
                localStorage.removeItem('gr-preset-filter-enabled');
            }
            // 迁移 sort top
            const oldSortTop = localStorage.getItem('gr-sort-selected-top');
            if (oldSortTop !== null && !this.data.settings.hasOwnProperty('sortSelectedToTop')) {
                this.data.settings.sortSelectedToTop = oldSortTop === 'true';
                localStorage.removeItem('gr-sort-selected-top');
            }
            // 迁移 pinned 数据
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('gr-pinned-')) {
                    const selectId = key.replace('gr-pinned-', '');
                    if (!this.data.pinned[selectId]) {
                        try {
                            this.data.pinned[selectId] = JSON.parse(localStorage.getItem(key) || '[]');
                            localStorage.removeItem(key);
                        } catch { }
                    }
                }
            }
            // 迁移 welcome popup
            const oldWelcome = localStorage.getItem('gr-welcome-popup-2026-4-19');
            if (oldWelcome !== null && !this.data.meta.hasOwnProperty('welcomePopupShown')) {
                this.data.meta.welcomePopupShown = oldWelcome === 'true';
                localStorage.removeItem('gr-welcome-popup-2026-4-19');
            }
            this.save();
        },
        save() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        },
        getSetting(key, defaultValue = null) {
            if (!this.data) this.init();
            return this.data.settings.hasOwnProperty(key) ? this.data.settings[key] : defaultValue;
        },
        setSetting(key, value) {
            if (!this.data) this.init();
            this.data.settings[key] = value;
            this.save();
        },
        getPinned(selectId) {
            if (!this.data) this.init();
            return this.data.pinned[selectId] || [];
        },
        setPinned(selectId, values) {
            if (!this.data) this.init();
            this.data.pinned[selectId] = values;
            this.save();
        },
        getMeta(key, defaultValue = null) {
            if (!this.data) this.init();
            return this.data.meta.hasOwnProperty(key) ? this.data.meta[key] : defaultValue;
        },
        setMeta(key, value) {
            if (!this.data) this.init();
            this.data.meta[key] = value;
            this.save();
        }
    };
    Storage.init();

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
    let isDarkMode = Storage.getSetting('darkMode', false);

    // 滚动监听器清理队列
    let activeScrollListeners = [];

    // select2 显示区域替换状态
    const replacedSelect2Displays = new Map();

    // 【预设管理器过滤持久化状态】
    let isPresetFilterEnabled = Storage.getSetting('presetFilterEnabled', false);

    // 【选中项是否置顶持久化状态】
    let isSortSelectedToTop = Storage.getSetting('sortSelectedToTop', false); // 默认关闭

    // 顶置功能
    // 【修复2】固定项身份：优先用选项文本（稳定），文本在同一 select 内不唯一时回退 value+文本；
    // 兼容旧版本存下的"纯 value / 纯文本"记录（下次写入时自动升级为新格式）。
    const dupTextCache = new WeakMap();
    function optionKey(selectEl, opt) {
        if (!opt) return '';
        const text = String(opt.textContent || '').trim();
        let cache = dupTextCache.get(selectEl);
        if (!cache || cache.size !== selectEl.options.length) {
            const counts = new Map();
            Array.from(selectEl.options).forEach(o => {
                const t = String(o.textContent || '').trim();
                counts.set(t, (counts.get(t) || 0) + 1);
            });
            const dup = new Set();
            counts.forEach((c, t) => { if (c > 1) dup.add(t); });
            cache = { size: selectEl.options.length, dup };
            dupTextCache.set(selectEl, cache);
        }
        return cache.dup.has(text) ? `v\u0000${opt.value}\u0000${text}` : `t\u0000${text}`;
    }
    function isLegacyPinnedKey(k) { return typeof k !== 'string' || (!k.startsWith('t\u0000') && !k.startsWith('v\u0000')); }
    // 顶置记录的存储键
    function pinStorageKey(selectEl) {
        return selectEl.id || (selectEl.closest('#WIMultiSelector') ? 'wi-multi' : 'unknown');
    }
    function getPinnedValues(selectEl) { return Storage.getPinned(pinStorageKey(selectEl)); }
    function pinnedKeyList(selectEl) {
        return getPinnedValues(selectEl).map(item => {
            if (!isLegacyPinnedKey(item)) return item;
            const opts = Array.from(selectEl.options);
            const byText = opts.filter(o => String(o.textContent || '').trim() === item);
            if (byText.length === 1) return optionKey(selectEl, byText[0]);
            const byValue = opts.filter(o => o.value === item);
            if (byValue.length === 1) return optionKey(selectEl, byValue[0]);
            return String(item);
        });
    }
    function isPinnedOption(selectEl, pinnedKeys, opt) {
        if (!opt || !pinnedKeys || pinnedKeys.length === 0) return false;
        if (pinnedKeys.includes(optionKey(selectEl, opt))) return true;
        // 旧记录兜底（纯 value / 纯文本）
        return pinnedKeys.includes(opt.value) || pinnedKeys.includes(String(opt.textContent || '').trim());
    }
    function togglePinnedValue(selectEl, opt) {
        const key = pinStorageKey(selectEl);
        const p = getPinnedValues(selectEl);
        const text = String(opt.textContent || '').trim();
        const k = optionKey(selectEl, opt);
        const i = p.findIndex(v => v === k || (isLegacyPinnedKey(v) && (v === opt.value || v === text)));
        if (i >= 0) p.splice(i, 1); else p.push(k);
        Storage.setPinned(key, p);
        return p;
    }
    function isPinEnabled(selectEl) { if (!selectEl) return false; if (selectEl.id === 'themes') return true; if (selectEl.id === 'settings_preset_openai') return true; if (selectEl.closest('#WIMultiSelector .range-block-range')) return true; return false; }

    // --- 4.5 顶置记录的「改名跟随」 ---
    // 固定项的身份是选项文本，而预设/主题/世界书条目被重命名时改的正是文本，
    // 不跟随的话固定记录会失效（实测 ST 预设改名 = 先追加新选项、约百毫秒后删除旧选项）。
    // 这里监视选项增删：当"恰好一个固定键失效且能对应到刚被删除的选项"、
    // 同时"恰好出现一个真正的新选项"时，把固定记录迁移到新键上。
    // 单纯的新增/删除选项不触发迁移——失效的固定记录原样保留，选项重新出现时自动恢复固定。
    const PIN_RENAME_TTL = 5000;     // 增删记录保留时长，需覆盖改名两步之间的间隔
    const PIN_RENAME_DEBOUNCE = 300; // 合并改名产生的多次 DOM 变动
    const pinRenameTrackers = new WeakMap();
    const pinRenameDisposers = [];

    // 选项的“身份键”：文本在同一 select 内唯一，整体重建时 value 会按位置重新分配，
    // 所以判断“是否只是重建出来的老选项”只能用身份键，不能带纯 value（会撞车）。
    function pinIdentityKeys(opt) {
        const text = String(opt.textContent || '').trim();
        if (!text) return [];
        return [`t\u0000${text}`, `v\u0000${String(opt.value ?? '')}\u0000${text}`];
    }

    // 一个选项可能对应的全部固定键写法（含旧版存下的纯文本 / 纯 value 记录）
    function pinKeyCandidates(opt) {
        const legacy = [String(opt.textContent || '').trim(), String(opt.value ?? '')].filter(k => k !== '');
        return pinIdentityKeys(opt).concat(legacy);
    }

    function collectOptionNodes(nodes) {
        const out = [];
        nodes.forEach(node => {
            if (!node || node.nodeType !== 1) return;
            const tag = String(node.tagName).toUpperCase();
            if (tag === 'OPTION') out.push(node);
            else if (tag === 'OPTGROUP') node.querySelectorAll('option').forEach(o => out.push(o));
        });
        return out;
    }

    function ensurePinRenameTracker(selectEl) {
        if (!selectEl || pinRenameTrackers.has(selectEl)) return;
        const tracker = { added: [], removed: [], timer: 0 };
        const observer = new MutationObserver(mutations => {
            const now = Date.now();
            for (const m of mutations) {
                collectOptionNodes(m.removedNodes).forEach(node => tracker.removed.push({ node, at: now }));
                collectOptionNodes(m.addedNodes).forEach(node => tracker.added.push({ node, at: now }));
            }
            if (tracker.timer) clearTimeout(tracker.timer);
            tracker.timer = setTimeout(() => reconcilePinRename(selectEl, tracker), PIN_RENAME_DEBOUNCE);
        });
        observer.observe(selectEl, { childList: true, subtree: true });
        pinRenameTrackers.set(selectEl, tracker);
        pinRenameDisposers.push(() => {
            observer.disconnect();
            if (tracker.timer) clearTimeout(tracker.timer);
        });
    }

    function reconcilePinRename(selectEl, tracker) {
        tracker.timer = 0;
        const now = Date.now();
        tracker.added = tracker.added.filter(r => now - r.at <= PIN_RENAME_TTL && selectEl.contains(r.node));
        tracker.removed = tracker.removed.filter(r => now - r.at <= PIN_RENAME_TTL);
        if (!tracker.added.length || !tracker.removed.length) return;

        const pinned = getPinnedValues(selectEl);
        if (!pinned.length) return;

        // 现存选项 / 刚被删除选项各自能对应的键
        const currentKeys = new Set();
        Array.from(selectEl.options).forEach(opt => pinKeyCandidates(opt).forEach(k => currentKeys.add(k)));
        const removedKeys = new Set();
        tracker.removed.forEach(r => pinKeyCandidates(r.node).forEach(k => removedKeys.add(k)));

        // 真正的新选项：整体重建时所有选项都会重新添加一遍，要把“重新创建的老选项”排除掉
        // （按身份键比对——纯 value 在重建后会按位置复用，不能用来判断）
        const removedIdentityKeys = new Set();
        tracker.removed.forEach(r => pinIdentityKeys(r.node).forEach(k => removedIdentityKeys.add(k)));
        const freshOptions = tracker.added.filter(r => !pinIdentityKeys(r.node).some(k => removedIdentityKeys.has(k)));
        if (freshOptions.length !== 1) return;

        // 失效、且能对应到"刚被删除的选项"的固定键（更早失效的记录不参与，避免误迁移）
        const staleKeys = pinned.filter(k => !currentKeys.has(k) && removedKeys.has(k));
        if (staleKeys.length !== 1) return;

        const oldKey = staleKeys[0];
        const newKey = optionKey(selectEl, freshOptions[0].node);
        if (!newKey || newKey === oldKey) return;

        const next = pinned.slice();
        const idx = next.indexOf(oldKey);
        if (idx < 0) return;
        if (next.includes(newKey)) next.splice(idx, 1);   // 新键已被固定过：直接去掉失效的旧键
        else next[idx] = newKey;
        Storage.setPinned(pinStorageKey(selectEl), next);
        console.log(`${SCRIPT_NAME} 固定项已跟随改名：${JSON.stringify(oldKey)} → ${JSON.stringify(newKey)}`);
        tracker.added = [];
        tracker.removed = [];
    }

    function scanPinRenameTrackers() {
        targetDoc().querySelectorAll('#themes, #settings_preset_openai, #WIMultiSelector .range-block-range select').forEach(sel => {
            if (isPinEnabled(sel)) ensurePinRenameTracker(sel);
        });
    }

    // --- 2. 注入样式 ---
    const customStyles = `
        /* 【移动端修复】容器不再使用 pointer-events:none：iOS/WebKit 的触摸滚动命中测试不完全
           遵守子元素恢复的 pointer-events:auto，会导致 .gr-options 在手机上无法触摸滚动
          （桌面端滚轮不受 pointer-events 影响，所以只有手机出问题）。
           容器本体可命中后，点击/触摸容器空白区（原 select 所在区域）改由 JS 关闭面板。 */
        .gr-container-enhanced { position: absolute; z-index: 2147483647; border: none !important; outline: none !important; }
        /* 【移动端修复】overscroll-behavior:contain 阻止列表滚到头后滚动链穿透到背后的面板
          （面板一动 → 锚点移位 → 面板被误关）；touch-action:pan-y 显式放行纵向触摸滚动；
           -webkit-overflow-scrolling/-webkit-touch-callout 兼容旧 iOS 的惯性滚动与长按弹菜单 */
        .gr-options { display: none; pointer-events: auto !important; position: absolute; left: 0; width: 100%; background-color: #ffffff !important; border: 1px solid #f0f0f0 !important; border-radius: 12px !important; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; -webkit-touch-callout: none; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06); z-index: 2147483647; scrollbar-width: none !important; -ms-overflow-style: none; }
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
        .gr-filter-toggle { border: 1px dashed #42a5f5 !important; background-color: #f8fbff !important; text-align: center; }
        body.dark-mode .gr-filter-toggle { border: 1px dashed rgba(216, 168, 231, 0.6) !important; background-color: rgba(216, 168, 231, 0.1) !important; }
        /* 【世界书多选框去重】这个位置最多会同时挤三个框：
           1) 本脚本的 .gr-select2-display
           2) ST-BaiBai-Tools（世界书列表优化）插入的 .bai-bai-wi-global-selector-display
           3) ST 原生（桌面端）select2 的 span.select2-container
           只要本脚本已接管（存在 .gr-select2-display）就强制隐藏另外两个。
           用 :has() 做条件、!important 压过内联样式和 BaiBai 的样式表——
           select2 容器可能在脚本运行后才被 ST 创建出来、BaiBai 关闭优化时也会把
           select2 容器的内联 display 恢复为可见，静态内联隐藏挡不住这两种情况。 */
        #WIMultiSelector .range-block-range:has(> .gr-select2-display) > span.select2-container { display: none !important; }
        #WIMultiSelector .range-block-range:has(> .gr-select2-display) > select[multiple] { display: none !important; }
        #WIMultiSelector .range-block-range:has(> .gr-select2-display) > .bai-bai-wi-global-selector { display: none !important; }
        body:has(#WIMultiSelector .range-block-range > .gr-select2-display) .bai-bai-wi-global-selector-dropdown { display: none !important; }
    `;

    // --- 3. 工具函数 ---
    const targetDoc = () => window.parent.document || document;

    // 【修复1】宿主（父）窗口：脚本运行在酒馆助手的 iframe 内，该 iframe 实测为 0×0，
    // 所以 window.innerWidth/innerHeight/scrollX/scrollY 全部不可用，必须取父窗口的值。
    const parentView = () => { try { return targetDoc().defaultView || window; } catch (e) { return window; } };
    // 【修复1】宿主页面的 jQuery（select2 互操作要用父页实例）
    const parentJQuery = () => { try { return parentView().jQuery || window.jQuery || null; } catch (e) { return null; } };

    // 【修复2】是否让"带固定功能"的 select2 框（themes / 预设列表）也交给脚本接管。
    // false = 保持旧行为（这些框继续由 select2 自己弹，看不到"已固定"分组）。
    const ALLOW_SELECT2_FOR_PIN_SELECTS = true;

    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function isMobile() {
        // 【修复1】判断宿主视口宽度，而不是 0×0 的脚本 iframe（原来恒为 true）
        return (parentView().innerWidth || 0) <= 768;
    }

	function smartTriggerChange(selectEl) {
        if (selectEl.id === 'world_editor_select') {
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        } 
        else {
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            selectEl.dispatchEvent(new Event('change', { bubbles: true })); 
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
        Storage.setSetting('darkMode', isDarkMode);
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
            // 【修复4】同时记录索引，避免同 value 的选项互相误标
            const chipIndex = Array.prototype.indexOf.call(hiddenSelect.options, option);
            if (chipIndex >= 0) chip.dataset.index = String(chipIndex);

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
            // 【修复4】优先按索引定位（value 可能重复）
            const idx = Number(div.dataset.index);
            const opt = (Number.isInteger(idx) && idx >= 0 && hiddenSelect.options[idx])
                ? hiddenSelect.options[idx]
                : Array.from(hiddenSelect.options).find(o => o.value === div.dataset.value);
            if (opt) div.classList.toggle('selected', opt.selected);
        });
    }

    // --- 3.6 隐藏与本脚本竞争"世界书全局多选框"的另外两个 UI ---
    // ST 原生（桌面端）的 select2 容器、ST-BaiBai-Tools 的 bai-bai-wi-global-selector 显示框。
    // CSS 规则（customStyles 末尾）是主保险，这里再做一层内联兜底，两者都指向同一位置。
    function hideCompetingMultiSelectorUI(parentDiv) {
        if (!parentDiv) return;
        parentDiv.querySelectorAll(':scope > span.select2-container').forEach(el => { el.style.display = 'none'; });
        parentDiv.querySelectorAll(':scope > .bai-bai-wi-global-selector').forEach(el => { el.style.display = 'none'; });
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
        // BaiBai 扩展可能已经/稍后会在这里插入自己的显示框，一并隐藏
        hideCompetingMultiSelectorUI(parentDiv);

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

        // 顶置记录的改名跟随：确保这个选择器处于监视中（打开过才可能产生固定记录）
        if (isPinEnabled(originalSelect)) ensurePinRenameTracker(originalSelect);

        const isMultiSelectMode = originalSelect.hasAttribute('multiple');
        if (isMultiSelectMode) {
            originalSelect.multiple = true;
        }
        const isWorldInfoSelect = originalSelect.name === '$' && originalSelect.closest('#world_popup_entries_list');
        const isPresetManagerSelect = originalSelect.id === 'completion_prompt_manager_footer_append_prompt';

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

        // 【移动端修复】容器不再 pointer-events:none 后，容器本体（覆盖在 select 上的区域）
        // 会截获点击；这里把这类点击/触摸视为"再次点击选择框"，关闭面板，保持原有交互。
        // 列表内部的事件已被上面的 stopPropagation 拦截，不会走到这里。
        ['mousedown', 'touchend'].forEach(evt => {
            container.addEventListener(evt, (e) => {
                if (e.target.closest && e.target.closest('.gr-options')) return;
                if (evt === 'mousedown' && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                closeDropdown();
            });
        });

        // 【修复6】面板挂在 body 上，并不在抽屉（.openDrawer）的 DOM 子树里，而 ST 在 html 上
        // 监听 touchstart/mousedown，凡"点在打开的抽屉之外"就自动关闭抽屉。手机端触摸容器
        //（盖在原 select 上的那块）时 touchstart 会冒泡到 html，于是点一下下拉框就把整个左侧
        // 抽屉一起关掉；桌面端是因为容器的 mousedown 关闭逻辑先截断了冒泡才没犯。
        // 面板内的一切触摸/按下都属于面板自身，不能让宿主的"点外部即关闭"逻辑看见。
        ['touchstart', 'pointerdown', 'mousedown'].forEach(evt => {
            container.addEventListener(evt, e => e.stopPropagation());
        });

        const searchBox = targetDoc().createElement('div');
        searchBox.className = 'gr-search-box';
        const searchInput = targetDoc().createElement('input');
        searchInput.className = 'gr-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = isPresetManagerSelect ? '搜索 或输入 /过滤' : '搜索选项...';
        searchBox.appendChild(searchInput);
        
        const optionsContainer = targetDoc().createElement('div');
        optionsContainer.className = 'gr-options-container';

        // 1. 主题切换选项（隐藏状态）
        const themeToggleOption = targetDoc().createElement('div');
        themeToggleOption.className = 'gr-option gr-theme-toggle';
        themeToggleOption.style.display = 'none';
        themeToggleOption.textContent = isDarkMode ? '切换到白天主题' : '切换到黑夜主题';
        const handleThemeToggle = (e) => {
            e.preventDefault(); e.stopPropagation();
            toggleTheme();
            themeToggleOption.textContent = isDarkMode ? '切换到白天主题' : '切换到黑夜主题';
            themeToggleOption.style.display = 'none';
            searchInput.value = '';
            performSearch('');
        };
        themeToggleOption.addEventListener('mousedown', (e) => { if (e.button === 0) handleThemeToggle(e); });
        themeToggleOption.addEventListener('touchend', (e) => { if (!isTouchScrolling) handleThemeToggle(e); });
        optionsContainer.appendChild(themeToggleOption);

        // 2. 预设管理器过滤切换选项（隐藏状态）
        let filterToggleOption = null;
        if (isPresetManagerSelect) {
            filterToggleOption = targetDoc().createElement('div');
            filterToggleOption.className = 'gr-option gr-filter-toggle';
            filterToggleOption.style.display = 'none';
            filterToggleOption.textContent = isPresetFilterEnabled ? '🪄 点击取消过滤 (当前: 已隐藏面板里存在的项)' : '🪄 点击开启过滤 (当前: 正在显示全部项)';
            const handleFilterToggle = (e) => {
                e.preventDefault(); e.stopPropagation();
                isPresetFilterEnabled = !isPresetFilterEnabled;
                Storage.setSetting('presetFilterEnabled', isPresetFilterEnabled);
                closeDropdown(); openDropdown(originalSelect);
            };
            filterToggleOption.addEventListener('mousedown', (e) => { if (e.button === 0) handleFilterToggle(e); });
            filterToggleOption.addEventListener('touchend', (e) => { if (!isTouchScrolling) handleFilterToggle(e); });
            optionsContainer.appendChild(filterToggleOption);
        }

        // 3. 是否开启"选中项强制置顶"切换选项
        const sortToggleOption = targetDoc().createElement('div');
        sortToggleOption.className = 'gr-option gr-filter-toggle';
        sortToggleOption.style.display = 'none';
        sortToggleOption.textContent = isSortSelectedToTop ? '📌 点击关闭: 选中项置顶 (恢复选项原始排序)' : '📌 点击开启: 选中项强制排在最顶端';
        const handleSortToggle = (e) => {
            e.preventDefault(); e.stopPropagation();
            isSortSelectedToTop = !isSortSelectedToTop;
            Storage.setSetting('sortSelectedToTop', isSortSelectedToTop);
            closeDropdown(); openDropdown(originalSelect); // 重载列表
        };
        sortToggleOption.addEventListener('mousedown', (e) => { if (e.button === 0) handleSortToggle(e); });
        sortToggleOption.addEventListener('touchend', (e) => { if (!isTouchScrolling) handleSortToggle(e); });
        optionsContainer.appendChild(sortToggleOption);

        const THEME_CMD = '/切换主题';
        const performSearch = debounce((originalSearchTerm) => {
            const searchTerm = originalSearchTerm.toLowerCase();
            let hasVisible = false;

            const groups = optionsContainer.querySelectorAll('.gr-group-label');
            groups.forEach(g => g.dataset.hasVisibleChild = 'false');

            optionsContainer.querySelectorAll('.gr-option:not(.gr-theme-toggle):not(.gr-filter-toggle):not(.gr-create-new-option)').forEach(option => {
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

            // 动态创建新标签逻辑
            let createNewOptionDiv = optionsContainer.querySelector('.gr-create-new-option');
            const isTaggableSelect = originalSelect.classList.contains('keyselect') ||
                                     originalSelect.name === 'characterFilter' ||
                                     originalSelect.name === 'key' ||
                                     originalSelect.name === 'keysecondary';
            const exactMatchExists = Array.from(originalSelect.options).some(opt => opt.value.toLowerCase() === searchTerm || opt.textContent.toLowerCase() === searchTerm);

            if (isTaggableSelect && originalSearchTerm.trim() !== '' && !exactMatchExists) {
                if (!createNewOptionDiv) {
                    createNewOptionDiv = targetDoc().createElement('div');
                    createNewOptionDiv.className = 'gr-option gr-create-new-option';
                    createNewOptionDiv.style.color = '#1565c0';
                    createNewOptionDiv.style.fontWeight = 'bold';
                    createNewOptionDiv.style.borderBottom = '1px dashed #42a5f5';
                    optionsContainer.insertBefore(createNewOptionDiv, optionsContainer.firstChild);

                    const handleCreate = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        const newVal = searchInput.value.trim();
                        if (!newVal) return;
                        const newOpt = new Option(newVal, newVal, true, true);
                        originalSelect.appendChild(newOpt);
                        smartTriggerChange(originalSelect);
                        closeDropdown(); openDropdown(originalSelect);
                    };

                    createNewOptionDiv.addEventListener('mousedown', handleCreate);
                    createNewOptionDiv.addEventListener('touchend', (e) => {
                        if(!isTouchScrolling) { e.preventDefault(); setTimeout(()=>handleCreate(e), 50); }
                    });
                }
                createNewOptionDiv.textContent = `➕ 添加新标签: "${originalSearchTerm.trim()}" (按回车键快捷创建)`;
                createNewOptionDiv.style.display = 'block';
                hasVisible = true;
            } else if (createNewOptionDiv) {
                createNewOptionDiv.style.display = 'none';
            }

            // 命令触发器
            if (searchTerm.length > 0 && THEME_CMD.startsWith(searchTerm)) {
                themeToggleOption.style.display = ''; hasVisible = true;
            } else { themeToggleOption.style.display = 'none'; }

            if (filterToggleOption) {
                if (searchTerm.length > 0 && ('/过滤'.startsWith(searchTerm) || '/取消过滤'.startsWith(searchTerm))) {
                    filterToggleOption.style.display = ''; hasVisible = true;
                } else { filterToggleOption.style.display = 'none'; }
            }

            // 【新增】置顶/排序功能触发器
            if (searchTerm.length > 0 && ('/排序'.startsWith(searchTerm) || '/置顶'.startsWith(searchTerm))) {
                sortToggleOption.style.display = ''; hasVisible = true;
            } else { sortToggleOption.style.display = 'none'; }

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
            const val = e.target.value;
            if (isPresetManagerSelect) {
                if (val === '/过滤') { isPresetFilterEnabled = true; Storage.setSetting('presetFilterEnabled', true); closeDropdown(); openDropdown(originalSelect); return; }
                else if (val === '/取消过滤') { isPresetFilterEnabled = false; Storage.setSetting('presetFilterEnabled', false); closeDropdown(); openDropdown(originalSelect); return; }
            }
            // 兼容快捷敲击直接执行命令
            if (val === '/排序' || val === '/置顶') {
                isSortSelectedToTop = !isSortSelectedToTop;
                Storage.setSetting('sortSelectedToTop', isSortSelectedToTop);
                closeDropdown(); openDropdown(originalSelect); return;
            }
            performSearch(val);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const createBtn = optionsContainer.querySelector('.gr-create-new-option');
                if (createBtn && createBtn.style.display !== 'none') {
                    e.preventDefault();
                    createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                }
            }
        });

        const existingIdentifiers = new Set();
        if (isPresetManagerSelect && isPresetFilterEnabled) {
            const listSelector = '#completion_prompt_manager_list';
            const listItemSelector = 'li[data-pm-identifier]';
            const list = targetDoc().querySelector(listSelector);
            if (list) {
                list.querySelectorAll(listItemSelector).forEach(item => {
                    if (item.dataset.pmIdentifier) existingIdentifiers.add(item.dataset.pmIdentifier);
                });
            }
        }

        let validOptionCount = 0;
        const realOptionByDiv = new WeakMap();   // 【修复4】备选 div → 真实 <option> 元素
        const createOptionDiv = (optionNode) => {
            if (optionNode.style && optionNode.style.display === 'none') return null;
            
            if (isPresetManagerSelect && isPresetFilterEnabled) {
                if (optionNode.value && existingIdentifiers.has(optionNode.value)) {
                    return null;
                }
            }
            
            validOptionCount++;
            const customOption = targetDoc().createElement('div');
            customOption.className = 'gr-option';
            customOption.textContent = optionNode.textContent;
            customOption.dataset.value = optionNode.value;

            // 【修复4】识别"真 option"：跨文档不能用 instanceof，用 nodeType/tagName 判断
            const isRealOption = !!(optionNode && optionNode.nodeType === 1 && String(optionNode.tagName).toUpperCase() === 'OPTION');
            if (isRealOption) {
                const realIndex = Array.prototype.indexOf.call(originalSelect.options, optionNode);
                if (realIndex >= 0) {
                    customOption.dataset.index = String(realIndex);
                    realOptionByDiv.set(customOption, optionNode);
                }
            }
            
            if (optionNode.selected) customOption.classList.add('selected');

            if (isPinEnabled(originalSelect)) {
                customOption.classList.add('has-pin');
                const pinnedKeys = pinnedKeyList(originalSelect);   // 【修复2】固定项身份 = 稳定键
                const isPinned = isPinnedOption(originalSelect, pinnedKeys, optionNode);
                const pinIcon = targetDoc().createElement('span');
                pinIcon.className = 'gr-option-pin' + (isPinned ? ' pinned' : '');
                pinIcon.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z"/></svg>';
                pinIcon.title = isPinned ? '取消固定' : '固定选项';
                const handlePin = (e) => { e.preventDefault(); e.stopPropagation(); togglePinnedValue(originalSelect, optionNode); closeDropdown(); openDropdown(originalSelect); };
                pinIcon.addEventListener('mousedown', handlePin);
                pinIcon.addEventListener('touchend', (e) => { if (!isTouchScrolling) handlePin(e); });
                customOption.appendChild(pinIcon);
            }

            const handleSelect = (event) => {
                if (!event.target.closest('.gr-option')) return;

                // 【修复4】必须按 <option> 元素本身选中：value 可能重复
                //（世界书条目 position 的三个 "@D 深度" 选项 value 都是 "4"，只按 value 永远只能命中第一个=系统⚙）
                let targetOpt = realOptionByDiv.get(customOption) || null;
                if (!targetOpt) {
                    const idx = Number(customOption.dataset.index);
                    if (Number.isInteger(idx) && idx >= 0 && originalSelect.options[idx]) targetOpt = originalSelect.options[idx];
                }
                if (!targetOpt) {
                    // 兜底：世界书缓存等"伪 option"分支（那里 value 唯一）
                    targetOpt = Array.from(originalSelect.options).find(opt => opt.value === customOption.dataset.value) || null;
                }

                if (isMultiSelectMode) {
                    if (targetOpt) {
                        targetOpt.selected = !targetOpt.selected;
                        customOption.classList.toggle('selected');
                        smartTriggerChange(originalSelect);
                    }
                } else {
                    if (targetOpt) {
                        // 单选：把该 option 置为 selected 会自动取消其它项，天然区分同 value 的选项
                        targetOpt.selected = true;
                        smartTriggerChange(originalSelect);
                    } else {
                        originalSelect.value = customOption.dataset.value;
                        smartTriggerChange(originalSelect);
                    }
                    closeDropdown();
                }
            };
            
            customOption.addEventListener('mousedown', (e) => { if (e.button === 0) { e.preventDefault(); handleSelect(e); }});
            customOption.addEventListener('touchend', (e) => { 
				if (!isTouchScrolling) { e.preventDefault(); setTimeout(() => handleSelect(e), 50); }
			});
            return customOption;
        };

        if (isMultiSelectMode) {
            const allOptions = Array.from(originalSelect.options);
            const pinnedValues = isPinEnabled(originalSelect) ? pinnedKeyList(originalSelect) : [];   // 【修复2】稳定键

            // 【适配置顶开关逻辑】
            if (isSortSelectedToTop) {
                const selectedOptions = allOptions.filter(opt => opt.selected);
                selectedOptions.forEach(opt => {
                    const div = createOptionDiv(opt);
                    if(div) optionsContainer.appendChild(div);
                });

                if (pinnedValues.length > 0) {
                    const pinnedUnselected = allOptions.filter(opt => !opt.selected && isPinnedOption(originalSelect, pinnedValues, opt));
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

                const hasPinnedItems = pinnedValues.length > 0 && allOptions.some(opt => !opt.selected && isPinnedOption(originalSelect, pinnedValues, opt));
                let hasOther = false;
                Array.from(originalSelect.children).forEach(child => {
                    if (child.tagName === 'OPTGROUP') {
                        const unselectedChildren = Array.from(child.children).filter(opt => opt.tagName === 'OPTION' && !opt.selected && !isPinnedOption(originalSelect, pinnedValues, opt));
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
                    } else if (child.tagName === 'OPTION' && !child.selected && !isPinnedOption(originalSelect, pinnedValues, child)) {
                        if (!hasOther && hasPinnedItems) { hasOther = true; const otherLabel = targetDoc().createElement('div'); otherLabel.className = 'gr-group-label'; otherLabel.textContent = '其他'; optionsContainer.appendChild(otherLabel); }
                        const div = createOptionDiv(child);
                        if(div) optionsContainer.appendChild(div);
                    }
                });
            } else {
                // 如果关闭了强制置顶，则按原样排序输出（保持 Pinned 优先权体验）
                const pinnedUnselected = allOptions.filter(opt => isPinnedOption(originalSelect, pinnedValues, opt));
                if (pinnedValues.length > 0 && pinnedUnselected.length > 0) {
                    const pinnedLabel = targetDoc().createElement('div');
                    pinnedLabel.className = 'gr-group-label';
                    pinnedLabel.textContent = '已固定';
                    optionsContainer.appendChild(pinnedLabel);
                    pinnedUnselected.forEach(opt => {
                        const div = createOptionDiv(opt);
                        if(div) optionsContainer.appendChild(div);
                    });
                }
                const hasPinnedItems = pinnedValues.length > 0 && allOptions.some(opt => isPinnedOption(originalSelect, pinnedValues, opt));
                let hasOther = false;
                Array.from(originalSelect.children).forEach(child => {
                    if (child.tagName === 'OPTGROUP') {
                        const groupChildren = Array.from(child.children).filter(opt => opt.tagName === 'OPTION' && !isPinnedOption(originalSelect, pinnedValues, opt));
                        if (groupChildren.length > 0) {
                            if (!hasOther && hasPinnedItems) { hasOther = true; const otherLabel = targetDoc().createElement('div'); otherLabel.className = 'gr-group-label'; otherLabel.textContent = '常规选项'; optionsContainer.appendChild(otherLabel); }
                            const groupLabel = targetDoc().createElement('div'); groupLabel.textContent = child.label; optionsContainer.appendChild(groupLabel);
                            groupChildren.forEach(opt => { const div = createOptionDiv(opt); if(div) optionsContainer.appendChild(div); });
                        }
                    } else if (child.tagName === 'OPTION' && !isPinnedOption(originalSelect, pinnedValues, child)) {
                        if (!hasOther && hasPinnedItems) { hasOther = true; const otherLabel = targetDoc().createElement('div'); otherLabel.className = 'gr-group-label'; otherLabel.textContent = '常规选项'; optionsContainer.appendChild(otherLabel); }
                        const div = createOptionDiv(child); if(div) optionsContainer.appendChild(div);
                    }
                });
            }
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

            const resolveApiFn = (name) => {
                try { if (typeof window.parent?.[name] === 'function') return window.parent[name]; } catch (_) {}
                try { if (typeof window[name] === 'function') return window[name]; } catch (_) {}
                return null;
            };
            const _getGlobalWbNames = resolveApiFn('getGlobalWorldbookNames');
            const _getCharWbNames   = resolveApiFn('getCharWorldbookNames');
            const _getChatWbName    = resolveApiFn('getChatWorldbookName');

            function getWorldbookPriority(option) {
                // 【适配世界书选择的置顶开关逻辑】
                if (isSortSelectedToTop && option.selected) return 0;
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
                } catch (e) { console.warn(`${SCRIPT_NAME} 世界书分类失败:`, e); }
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
            const pinnedValues = pinnedKeyList(originalSelect);   // 【修复2】固定项身份 = 稳定键
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

            const sorted = allOpts.sort((a, b) => {
                // 【适配置顶开关逻辑】
                const aRank = (isSortSelectedToTop && a === selectedOpt) ? 0 : (isPinnedOption(originalSelect, pinnedValues, a) ? 1 : 2);
                const bRank = (isSortSelectedToTop && b === selectedOpt) ? 0 : (isPinnedOption(originalSelect, pinnedValues, b) ? 1 : 2);
                return aRank - bRank;
            });

            const hasPinnedOpts = pinnedValues.length > 0 && allOpts.some(opt => isPinnedOption(originalSelect, pinnedValues, opt));
            let lastRank = -1;
            sorted.forEach(opt => {
                const rank = (isSortSelectedToTop && opt === selectedOpt) ? 0 : (isPinnedOption(originalSelect, pinnedValues, opt) ? 1 : 2);
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
        const pv = parentView();   // 【修复1】宿主窗口：视口尺寸与滚动量都必须取自它
        let finalWidth = rect.width;

        if (originalSelect.id === 'qr--set' && isMobile()) {
            const targetEditor = targetDoc().querySelector("#qr--editor");
            if (targetEditor) finalWidth = targetEditor.getBoundingClientRect().right - rect.left;
        } else {
            const targetWidthId = WIDTH_TARGETS[originalSelect.id];
            if (targetWidthId) {
                const targetElement = targetDoc().getElementById(targetWidthId);
                if (targetElement) {
                    // 【修复1】延伸宽度不得越出宿主视口（移动端原来会拉到比屏幕还宽，看着像"斜着飘出来"）
                    const right = Math.min(targetElement.getBoundingClientRect().right, (pv.innerWidth || 0) - 8);
                    if (right - rect.left > finalWidth) finalWidth = right - rect.left;
                }
            }
        }

        container.style.width = `${finalWidth}px`;
        container.style.height = `${rect.height}px`;

        const TOP_BOUNDARY_ID = 'top-settings-holder';
        const BOTTOM_BOUNDARY_ID = 'send_form';
        const BOUNDARY_MARGIN = 10;
        const originalSelectRect = positionSource.getBoundingClientRect();
        const topBoundaryEl = targetDoc().getElementById(TOP_BOUNDARY_ID);
        const bottomBoundaryEl = targetDoc().getElementById(BOTTOM_BOUNDARY_ID);
        let maxAvailableHeight;

        // 【修复1】展开方向/可用高度用宿主视口高度（原来是脚本 iframe 的 innerHeight，恒为 0）
        const spaceBelow = (pv.innerHeight || 0) - originalSelectRect.bottom;
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
                maxAvailableHeight = (pv.innerHeight || 0) - originalSelectRect.bottom - BOUNDARY_MARGIN;
            }
        }
        // 【移动端修复】列表高度在边界计算之外再夹紧到宿主可视区：
        // 手机上是全屏弹窗（如织幕 ESG 面板）时，send_form 等边界元素被压在弹窗后面，
        // 其位置不再可靠，列表可能越出屏幕下缘（移动端 body 不可滚动，越出部分永远够不到）
        const viewportCap = isDropUp
            ? originalSelectRect.top - BOUNDARY_MARGIN
            : (pv.innerHeight || 0) - originalSelectRect.bottom - BOUNDARY_MARGIN;
        maxAvailableHeight = Math.min(maxAvailableHeight, viewportCap);
        optionsList.style.maxHeight = `${Math.max(100, maxAvailableHeight)}px`;
        searchBox.style.display = validOptionCount >= 10 || isPresetManagerSelect ? 'block' : 'none';

        const parentDialog = originalSelect.closest('dialog');
        const appendTarget = parentDialog || targetDoc().body;

        if (parentDialog) {
            const scrollContainer = parentDialog.querySelector('.popup-body') || parentDialog;
            const parentRect = parentDialog.getBoundingClientRect();
            container.style.top = `${rect.top - parentRect.top + scrollContainer.scrollTop}px`;
            container.style.left = `${rect.left - parentRect.left + scrollContainer.scrollLeft}px`;
        } else {
            // 【修复1】换算成宿主文档坐标：原来用的 window.scrollY 是脚本 iframe 的（恒为 0），
            // 宿主页面一滚动面板就整体偏移（实测偏移量正好等于宿主滚动量，移动端尤其明显）。
            const docEl = targetDoc().documentElement || {};
            const scrollX = (typeof pv.scrollX === 'number') ? pv.scrollX : (docEl.scrollLeft || 0);
            const scrollY = (typeof pv.scrollY === 'number') ? pv.scrollY : (docEl.scrollTop || 0);
            container.style.top = `${rect.top + scrollY}px`;
            container.style.left = `${rect.left + scrollX}px`;
        }

        container.appendChild(optionsList);
        appendTarget.appendChild(container);

        const openTime = Date.now(); // 记录面板打开的精确时间
        const anchorRect = positionSource.getBoundingClientRect(); // 【修复1/3】记住锚点位置
        const scrollHandler = (event) => {
            // 【修复3】布局稳定宽限期放宽到 400ms（原 200ms，移动端点击/地址栏/软键盘的滚动常晚于它）
            if (Date.now() - openTime < 400) return;
            if (optionsList.contains(event.target)) return;
            const activeEl = targetDoc().activeElement;
            // 【修复3】只要焦点在面板内（搜索框等）就一律不关（原来的逃生阀因 isMobile() 恒真而从未生效）
            if (activeEl && (activeEl === searchInput || optionsList.contains(activeEl))) return;
            // 【修复1/3】只有锚点真的移位（宿主 UI 确实被滚动）才关闭，避免布局抖动误关
            const nowRect = positionSource.getBoundingClientRect();
            if (Math.abs(nowRect.top - anchorRect.top) < 4 && Math.abs(nowRect.left - anchorRect.left) < 4) return;
            closeDropdown();
        };

        let scrollParent = originalSelect.parentElement;
        while (scrollParent) {
            activeScrollListeners.push({ element: scrollParent, handler: scrollHandler });
            scrollParent.addEventListener('scroll', scrollHandler, true);
            scrollParent = scrollParent.parentElement;
        }
        // 【修复1】宿主页面的滚动只能通过父窗口监听（脚本 iframe 的 window 收不到父页的滚动事件）
        activeScrollListeners.push({ element: pv, handler: scrollHandler });
        pv.addEventListener('scroll', scrollHandler, true);

        setTimeout(() => {
            if (!isMobile() && (validOptionCount >= 10 || isPresetManagerSelect)) {
                searchInput.focus();
            }
            const selectedItem = optionsContainer.querySelector('.selected');
            if (selectedItem) {
                // 如果关了强制置顶，被选中的项就不一定在最上面了，这个时候脚本自动滚动视窗到他所在的位置
                optionsList.scrollTop = selectedItem.offsetTop - (optionsList.clientHeight / 2);
            }
        }, 10);
    }

    // --- 弹窗说明函数 ---
    function showWelcomePopup() {
        // 如果本地存储有记录，说明已经弹过，直接返回
        if (Storage.getMeta('welcomePopupShown', false)) return;

        // 只要进入此函数，立即记录为已查看，防止不点按钮刷新后再次弹出
        Storage.setMeta('welcomePopupShown', true);

        // 根据 isDarkMode 判断当前主题颜色
        const bgStr = isDarkMode ? 'rgba(40, 40, 40, 0.95)' : '#ffffff';
        const textStr = isDarkMode ? '#e0e0e0' : '#333333';
        const borderStr = isDarkMode ? '1px solid rgba(80, 80, 80, 0.5)' : '1px solid #f0f0f0';
        const titleColor = isDarkMode ? 'rgba(216, 168, 231, 0.95)' : '#1565c0';
        const btnBg = isDarkMode ? 'rgba(216, 168, 231, 0.2)' : '#e3f2fd';
        const btnHover = isDarkMode ? 'rgba(216, 168, 231, 0.4)' : '#bbdefb';
        const codeBg = isDarkMode ? 'rgba(0, 0, 0, 0.3)' : '#f5f5f5';

        // 创建遮罩层（使用 absolute 定位以兼容 iframe 环境）
        const overlay = targetDoc().createElement('div');
        overlay.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 2147483647; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(2px);`;

        // 创建弹窗本体
        const modal = targetDoc().createElement('div');
        modal.style.cssText = `background: ${bgStr}; color: ${textStr}; border: ${borderStr}; padding: 24px; border-radius: 12px; max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); font-family: sans-serif; line-height: 1.6; animation: slideDown 0.3s ease-out;`;

        modal.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; color: ${titleColor}; text-align: center; border-bottom: ${borderStr}; padding-bottom: 12px; margin-bottom: 16px;">
                【酒馆助手脚本】下拉选项框美化（2026.4.19）
            </div>
            <div style="font-size: 14px; margin-bottom: 24px;">
                <div style="margin-bottom: 12px;">
                    <strong>切换主题</strong><br>
                    在任意下拉搜索框输入 <code style="padding:2px 6px; border-radius:4px;">/切换主题</code> ，则可以快速切换至白天/黑夜主题。
                </div>
                <div style="margin-bottom: 12px;">
                    <strong>兼容预设过滤脚本</strong><br>
                    在预设管理器的条目下拉搜索框中输入 <code style="padding:2px 6px; border-radius:4px;">/取消过滤</code> 命令即可。
                </div>
                <div style="margin-bottom: 12px;">
                    <strong>提供选中选项顶置功能</strong><br>
                    在任意下拉搜索框中输入 <code style="padding:2px 6px; border-radius:4px;">/顶置</code> 命令即可。
                </div>
            </div>
            <div style="text-align: center;">
                <button id="gr-welcome-btn" style="background: ${btnBg}; color: ${titleColor}; border: none; padding: 10px 32px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s; font-size: 14px;">我知道了</button>
            </div>
        `;

        // 按钮交互与关闭逻辑
        const btn = modal.querySelector('#gr-welcome-btn');
        btn.onmouseover = () => btn.style.background = btnHover;
        btn.onmouseout = () => btn.style.background = btnBg;
        btn.onclick = () => {
            overlay.remove();
        };

        overlay.appendChild(modal);
        targetDoc().body.appendChild(overlay);
    }

	function checkExemptionRules(originalSelect, forceReplace) {
        if (forceReplace) return true;

        const isMultiSelect = originalSelect.hasAttribute('multiple');
        const isSelect2 = originalSelect.classList.contains('select2-hidden-accessible') || originalSelect.hasAttribute('data-select2-id');

        // 允许所有多选框弹出美化的下拉列表
        if (isMultiSelect) return true;

        // 【显式为 world_editor_select 放开白名单拦截限制，修复其在移动/平板端无法弹出的问题】
        if (originalSelect.id === 'world_editor_select') return true;

        // 【修复2】被 select2 接管、但脚本自己带"固定"功能的框（themes / 预设列表）仍然交还脚本接管，
        // 否则这两个框里根本看不到"已固定"分组（实测 preset-transfer 会给预设框加 select2）。
        // 想完全恢复旧行为（一律放行 select2）把 ALLOW_SELECT2_FOR_PIN_SELECTS 改成 false。
        if (isSelect2 && !originalSelect.closest('#WIMultiSelector')) {
            if (ALLOW_SELECT2_FOR_PIN_SELECTS && isPinEnabled(originalSelect)) return true;
            return false;
        }
        return true;
    }

    function handleSelectTrigger(e, forceReplace = false) {
        let targetSelect = e.target.closest('select:not([multiple])') || e.target.closest('select[multiple]');

        // 【增强 Select2 容器向原生 SELECT 标签的溯源寻找能力（适配移动和平板生成的非标准 Select2 ID）】
        if (!targetSelect && e.target.closest('.select2-container')) {
            if (e.target.closest('.select2-selection__choice__remove')) {
                return false;
            }
            const select2Element = e.target.closest('.select2-container');
            
            // 尝试途径 1：通过标准 data-select2-id 寻找
            const select2Id = select2Element.getAttribute('data-select2-id');
            if (select2Id) {
                targetSelect = targetDoc().querySelector(`select[data-select2-id="${select2Id}"]`);
            }

            // 尝试途径 2：通过包裹容器内部的 aria-labelledby 反向推导真实 ID（针对平板的救命稻草）
            if (!targetSelect) {
                const renderedSpan = select2Element.querySelector('.select2-selection__rendered');
                if (renderedSpan && renderedSpan.id) {
                    const match = renderedSpan.id.match(/^select2-(.+)-container$/);
                    if (match && match[1]) {
                        targetSelect = targetDoc().getElementById(match[1]);
                    }
                }
            }

            // 尝试途径 3：老版本的兜底方案
            if (!targetSelect) {
                const fallbackId = select2Element.id?.replace('select2-', '');
                if (fallbackId) targetSelect = targetDoc().getElementById(fallbackId);
            }
        }

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

        const isMultiSelect = targetSelect.hasAttribute('multiple');
        if (isMultiSelect) {
            if (targetSelect.closest('#WIMultiSelector .range-block-range')) {
                if (!replacedSelect2Displays.has(targetSelect)) {
                    replaceSelect2Display(targetSelect);
                }
            }
        }

        if (!checkExemptionRules(targetSelect, forceReplace)) return false;

        e.preventDefault();
        e.stopPropagation();

        // 【修复1】select2 互操作要用宿主页面的 jQuery 实例（脚本 iframe 里未必有 jQuery）
        const $parent = parentJQuery();
        if ($parent && $parent(targetSelect).data && $parent(targetSelect).data('select2')) {
            setTimeout(() => { try { $parent(targetSelect).select2('close'); } catch (e) { } }, 0);
        }

        const isOpen = targetDoc().getElementById(CONTAINER_ID) !== null;
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown(targetSelect);
        }
        return true;
    }

    // 【修复3】实例登记：酒馆助手会重建脚本 iframe（脚本被重跑），而注册在父页面上的监听
    // 不会随 iframe 消失，于是每重跑一次就多一套监听（一次点击被 toggle 两次 → 面板刚开就关）。
    // 这里保证同一时间只有一套监听生效，重跑时先注销旧实例。
    const INSTANCE_FLAG = '__grDropdownBeautifyInstance';
    let disposers = [];
    function onListener(target, type, fn, opts) {
        if (!target || typeof target.addEventListener !== 'function') return;
        target.addEventListener(type, fn, opts);
        disposers.push(() => target.removeEventListener(type, fn, opts));
    }

    function initialize() {
        const parentWin = window.parent || window;
        if (typeof parentWin[INSTANCE_FLAG] === 'function') {
            try { parentWin[INSTANCE_FLAG](); } catch (e) { console.warn(`${SCRIPT_NAME} 旧实例清理失败:`, e); }
        }
        disposers = [];
        let styleSheet = null;

        console.log(`${SCRIPT_NAME} 正在初始化...`);

        // --- 调用首次加载弹窗 ---
        showWelcomePopup();

        // 【修复3】样式只注入一次（原来每次重跑都追加一份）
        targetDoc().querySelectorAll('style[data-gr-dropdown-style]').forEach(el => el.remove());
        styleSheet = targetDoc().createElement("style");
        styleSheet.setAttribute('data-gr-dropdown-style', '1');
        styleSheet.innerText = customStyles;
        targetDoc().head.appendChild(styleSheet);
        if (isDarkMode) targetDoc().body.classList.add('dark-mode');

        // 下一次重跑时会调用它：注销监听、关闭面板、移除样式
        parentWin[INSTANCE_FLAG] = () => {
            disposers.forEach(fn => { try { fn(); } catch (e) { } });
            disposers = [];
            pinRenameDisposers.forEach(fn => { try { fn(); } catch (e) { } });
            pinRenameDisposers.length = 0;
            try { closeDropdown(); } catch (e) { }
            try { if (entriesListObserver) { entriesListObserver.disconnect(); entriesListObserver = null; } } catch (e) { }
            if (styleSheet && styleSheet.parentElement) styleSheet.remove();
            targetDoc().querySelectorAll('style[data-gr-dropdown-style]').forEach(el => el.remove());
            delete parentWin[INSTANCE_FLAG];
            console.log(`${SCRIPT_NAME} 旧实例已清理。`);
        };

        // 【修复3】只把"触摸 → 兼容鼠标事件"这一对去抖掉：移动端一次点击先来 touchend，
        // 浏览器随后又补发 mousedown，两个入口各 toggle 一次 → 面板刚打开就被自己关掉
        //（实测：连投两次 mousedown 即"开+关"）。不吞正常鼠标点击，也不吞"点击别处后再点选择框"。
        let lastTouchGestureAt = 0;
        let lastMouseGestureAt = 0;
        const TOUCH_MOUSE_DEDUPE_MS = 700;

        // 【修复5】桌面端"下拉框一点开就自动关闭"：
        // 面板是在 mousedown 里创建的，光标下的元素因此从 <select> 变成了容器，随后的 mouseup
        // 就落在容器上。mousedown 与 mouseup 目标不同时，浏览器把 click 派发到两者的共同祖先
        // （实测是 body），下面全局的"点击外部即关闭"会把打开面板的这一次点击误判成外部点击。
        // 移动端由 touchend 打开、preventDefault 压掉了合成点击，所以只有桌面端会犯。
        // 这里把"这次按下刚刚打开了面板"记下来，吞掉它自带的那一次 click。
        let swallowOpenGestureClick = false;

        onListener(targetDoc(), 'mousedown', (e) => {
            if (e.button !== 0) return;
            if (Date.now() - lastTouchGestureAt < TOUCH_MOUSE_DEDUPE_MS) return; // 这次点击已由 touchend 处理
            lastMouseGestureAt = Date.now();
            const wasOpen = targetDoc().getElementById(CONTAINER_ID) !== null;
            handleSelectTrigger(e);
            swallowOpenGestureClick = !wasOpen && targetDoc().getElementById(CONTAINER_ID) !== null;
        }, true);

        // --- 修复手机端滑动误触的逻辑 ---
        let globalTouchStartX = 0;
        let globalTouchStartY = 0;
        let isGlobalTouchScrolling = false;

        onListener(targetDoc(), 'touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                globalTouchStartX = e.touches[0].clientX;
                globalTouchStartY = e.touches[0].clientY;
            }
            isGlobalTouchScrolling = false; // 初始假设不是滑动
        }, { passive: true, capture: true });

        onListener(targetDoc(), 'touchmove', (e) => {
            if (e.touches && e.touches.length > 0) {
                const moveX = Math.abs(e.touches[0].clientX - globalTouchStartX);
                const moveY = Math.abs(e.touches[0].clientY - globalTouchStartY);
                if (moveX > 10 || moveY > 10) {
                    isGlobalTouchScrolling = true;
                }
            }
        }, { passive: true, capture: true });

        onListener(targetDoc(), 'touchend', (e) => {
            if (isGlobalTouchScrolling) return;
            if (Date.now() - lastMouseGestureAt < 300) return; // 鼠标路径刚处理过这次点击，不重复
            lastTouchGestureAt = Date.now();
            handleSelectTrigger(e);
        }, { passive: false, capture: true });

        onListener(targetDoc(), 'keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                const select = targetDoc().activeElement;
                if (select && select.tagName === 'SELECT') {
                    if (handleSelectTrigger({ target: select, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() })) {
                        e.preventDefault();
                    }
                }
            }
        });

        onListener(targetDoc(), 'click', (e) => {
            // 【修复5】打开面板的那次 mousedown 自带一个 click（目标是 body），不能当成外部点击
            if (swallowOpenGestureClick) {
                swallowOpenGestureClick = false;
                return;
            }
            if (
                !e.target.closest('.gr-container-enhanced') &&
                !e.target.closest('.gr-select2-display') &&
                !e.target.closest('.select2-container') &&
                e.target.tagName !== 'SELECT' &&
                e.target.tagName !== 'OPTION'
            ) {
                closeDropdown();
            }
        });

        // 【修复1/3】resize 必须监听宿主窗口（父页面）：脚本 iframe 是 0×0，监听它永远不会触发，
        // 而父页尺寸变化（移动端地址栏收起/软键盘）才是真正需要响应的事件。
        onListener(parentView(), 'resize', () => {
            const activeEl = targetDoc().activeElement;
            if (activeEl && activeEl.closest('.gr-container-enhanced')) return;
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
            const targetMultiSelects = targetDoc().querySelectorAll('#WIMultiSelector .range-block-range select[multiple]');
            targetMultiSelects.forEach(sel => {
                const parentDiv = sel.parentElement;
                if (!parentDiv) return;
                if (parentDiv.querySelector(':scope > .gr-select2-display')) {
                    // 已接管也不能直接返回：ST 可能在脚本运行后才初始化 select2（新 span 没有内联
                    // display:none）、BaiBai 扩展也可能在之后才插入/恢复自己的显示框，这里重新隐藏一遍
                    hideCompetingMultiSelectorUI(parentDiv);
                    return;
                }
                if (replacedSelect2Displays.has(sel)) return;
                replaceSelect2Display(sel);
            });
            // 世界书等多选抽屉是后出现的，顺手把它们也纳入改名跟随
            scanPinRenameTrackers();
        }
        scanAndReplaceSelect2Displays();
        scanPinRenameTrackers();

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
