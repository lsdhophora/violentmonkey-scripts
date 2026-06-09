// ==UserScript==
// @name         Cloze Test
// @namespace    cloze-test
// @version      1.1
// @description  Turn any English webpage into a cloze (fill-in-the-blank) exercise. Automatically blanks every Nth word; type answers and check.
// @match        *://www.bbc.com/*
// @match        *://www.bbc.co.uk/*
// @match        *://edition.cnn.com/*
// @match        *://www.cnn.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        defaultInterval: 5,
        minWordLength: 2,
        minInterval: 2,
        maxInterval: 10,
        batchSize: 100,
        maxWords: 3000,
    };

    const state = {
        active: false,
        interval: CONFIG.defaultInterval,
        wordIndex: 0,
        replacements: [],
        blankCount: 0,
        checked: false,
        revealed: false,
    };

    let panel = null;
    let styleEl = null;
    let observer = null;
    let processingOwnMutations = false;

    const SKIP_TAGS = new Set([
        'SCRIPT', 'STYLE', 'CODE', 'PRE',
        'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION',
        'CANVAS', 'SVG', 'VIDEO', 'AUDIO', 'IMG',
    ]);

    const COMMON_WORDS = new Set([
        'the','a','an','and','or','but','if','because','so','than','that','this','these','those',
        'he','she','it','we','they','you','me','him','her','us','them',
        'my','your','his','its','our','their','mine','yours','hers','ours','theirs',
        'who','whom','whose','which','what','when','where','why','how',
        'all','each','every','both','few','many','much','some','any','no','none',
        'one','two','three','four','five','six','seven','eight','nine','ten',
        'first','second','third','last','next','other','another',
        'here','there','everywhere','somewhere','anywhere','nowhere',
        'up','down','in','out','on','off','over','under','above','below',
        'before','after','during','until','since','at','by','for','with','without',
        'about','like','as','to','from','of','into','through','across','against',
        'between','among','upon','within','beyond','along','around','past',
        'am','is','are','was','were','been','being','be',
        'have','has','had','having','do','does','did','doing','done',
        'will','would','shall','should','can','could','may','might','must','need','dare','ought',
        'get','got','gets','getting','make','made','makes','making','take','took','takes','taking',
        'give','gave','gives','giving','say','said','says','saying','go','went','goes','going','gone',
        'come','came','comes','coming','see','saw','seen','sees','know','knew','knows','known',
        'think','thought','thinks','want','wants','asked','tell','told','tells','find','found','finds',
        'keep','kept','keeps','let','lets','begin','began','begun','begins','start','started','starts',
        'seem','seemed','seems','look','looked','looks','call','called','calls','feel','felt','feels',
        'leave','left','leaves','work','worked','works','need','needs','needed','put','puts',
        'set','sets','run','ran','runs','move','moved','moves','live','lived','lives',
        'believe','believed','believes','hold','held','holds','turn','turned','turns',
        'bring','brought','brings','show','showed','shows','shown','hear','heard','hears',
        'play','played','plays','write','wrote','writes','written','listen','listened','listens',
        'read','reads','speak','spoke','speaks','spoken','learn','learned','learns','understand','understood',
        'however','therefore','furthermore','nevertheless','although','though','while','whereas',
        'unless','except','besides','instead','otherwise','indeed','perhaps','probably','certainly',
        'especially','particularly','usually','often','always','never','sometimes','rarely','seldom',
        'very','quite','rather','pretty','almost','nearly','just','only','even','still','yet',
        'already','also','too','again','once','well','better','best','worse','worst',
        'more','most','less','least','old','new','good','bad','big','small','long','short',
        'high','low','same','different','great','little','large','full','sure','certain',
        'important','necessary','possible','likely','able','unable','ready','right','wrong',
        'true','false','real','whole','simple','hard','easy','glad','sorry','happy','sad',
        'tired','afraid','angry','proud','clear','deep','wide','fast','slow','late','early',
        'far','close','near','ago','now','then','soon','today','tomorrow','yesterday',
        'north','south','east','west','please','thanks','thank','welcome','sorry','excuse',
        'yes','no','not','nor','neither','either','whether',
        'dear','sir','madam','mr','mrs','ms','dr','prof','st','dept','etc','inc','ltd','co','jr','sr',
        'don\'t','doesn\'t','didn\'t','can\'t','couldn\'t','wouldn\'t','shouldn\'t','won\'t','wasn\'t',
        'weren\'t','haven\'t','hasn\'t','hadn\'t','isn\'t','aren\'t','ain\'t',
        'i\'m','it\'s','he\'s','she\'s','that\'s','what\'s','who\'s','there\'s','here\'s','let\'s',
        'i\'ll','you\'ll','he\'ll','she\'ll','it\'ll','they\'ll','we\'ll',
        'i\'d','you\'d','he\'d','she\'d','we\'d','they\'d',
        'i\'ve','you\'ve','we\'ve','they\'ve',
        'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
        'january','february','march','april','may','june','july','august',
        'september','october','november','december',
        'spring','summer','autumn','fall','winter',
        'hi','ok','okay','oh','ah','eh','ha','ma','pa','la','ex','vs','tv','cd','pc','ad','id',
    ]);

    function isSkippable(node) {
        let el = node.parentElement;
        while (el) {
            if (SKIP_TAGS.has(el.tagName)) return true;
            if (el.dataset && el.dataset.clozeContainer !== undefined) return true;
            if (el.dataset && el.dataset.clozePanel !== undefined) return true;
            el = el.parentElement;
        }
        return false;
    }

    function injectStyles() {
        if (document.getElementById('cloze-styles')) return;
        styleEl = document.createElement('style');
        styleEl.id = 'cloze-styles';
        styleEl.textContent = `
.cloze-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: #1e1e1e;
    border: 1px solid #444;
    border-radius: 10px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    padding: 14px 18px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #e0e0e0;
    min-width: 210px;
    user-select: none;
    line-height: 1.5;
}
.cloze-panel-title {
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 10px;
    cursor: move;
    color: #e0e0e0;
    letter-spacing: 0.3px;
}
.cloze-panel label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    color: #aaa;
}
.cloze-panel input[type="range"] {
    flex: 1;
    height: 8px;
    accent-color: #9141ac;
    cursor: pointer;
    background: #444;
    border-radius: 4px;
    -webkit-appearance: none;
    appearance: none;
}
.cloze-panel input[type="range"]::-webkit-slider-runnable-track {
    height: 8px;
    background: #444;
    border-radius: 4px;
}
.cloze-panel input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 18px;
    width: 18px;
    border-radius: 50%;
    background: #9141ac;
    margin-top: -5px;
    cursor: pointer;
}
.cloze-panel input[type="range"]::-moz-range-track {
    height: 8px;
    background: #444;
    border-radius: 4px;
}
.cloze-panel input[type="range"]::-moz-range-thumb {
    height: 18px;
    width: 18px;
    border-radius: 50%;
    background: #9141ac;
    cursor: pointer;
    border: none;
}
.cloze-panel input[type="range"]:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.cloze-panel .cloze-actions {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.cloze-panel button {
    display: block;
    width: 100%;
    padding: 7px 12px;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
}
.cloze-panel button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.cloze-btn-primary {
    background: #7d3894;
    border-color: #6a2f7d;
    color: #fff;
}
.cloze-btn-primary:hover:not(:disabled) {
    background: #9141ac;
}
.cloze-btn-secondary {
    background: #444;
    border-color: #555;
    color: #ccc;
}
.cloze-btn-secondary:hover:not(:disabled) {
    background: #555;
}
.cloze-btn-danger {
    background: #c0392b;
    border-color: #a93226;
    color: #fff;
}
.cloze-btn-danger:hover:not(:disabled) {
    background: #e74c3c;
}
.cloze-stat {
    font-size: 12px;
    color: #888;
    margin-top: 6px;
    min-height: 1.2em;
}
.cloze-blank-container {
    display: inline;
    white-space: nowrap;
}
.cloze-blank-area {
    display: inline;
    white-space: nowrap;
}
.cloze-input-wrap {
    display: inline-block;
    border-bottom: 2px dashed #888;
}
.cloze-input-wrap.cloze-correct {
    border-bottom-color: #81c784;
}
.cloze-input-wrap.cloze-incorrect {
    border-bottom-color: #e57373;
}
.cloze-first-letter {
    display: inline;
    color: inherit;
    margin-right: 0.25em;
}
.cloze-bracket {
    color: #666;
    font-weight: 300;
}
input.cloze-blank {
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    outline: none;
    text-align: center;
    caret-color: #333333;
    width: auto;
    margin-bottom: 16px;
    margin-top: 8px;
}
input.cloze-blank:disabled {
    opacity: 0.7;
    cursor: default;
}
.cloze-hint {
    color: #ef5350;
    font-size: 0.85em;
    margin-left: 2px;
    font-weight: 600;
    vertical-align: baseline;
}
span.cloze-container {
    display: inline;
    white-space: pre-wrap;
}
`;
        document.head.appendChild(styleEl);
    }

    function removeStyles() {
        if (styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
            styleEl = null;
        }
    }

    function createBlankInput(word) {
        const container = document.createElement('span');
        container.className = 'cloze-blank-container';

        const prefix = document.createElement('span');
        prefix.className = 'cloze-first-letter';
        prefix.textContent = word.charAt(0);

        const rest = word.slice(1);
        const restLen = Math.max(Math.min(rest.length, 12), 2);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cloze-blank';
        input.dataset.answer = word;
        input.dataset.cloze = '';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.size = restLen;

        var wrap = document.createElement('span');
        wrap.className = 'cloze-input-wrap';
        wrap.appendChild(input);

        input.addEventListener('input', function onInput() {
            var w = this.parentNode;
            if (!w) return;
            w.classList.remove('cloze-correct', 'cloze-incorrect');
            var hint = w.nextElementSibling;
            if (hint && hint.classList.contains('cloze-hint')) {
                hint.remove();
            }
            state.revealed = false;

            var val = this.value.trim();
            if (val.length === 0) return;

            var full = getFullAnswer(this).trim();
            if (full.toLowerCase() === this.dataset.answer.toLowerCase()) {
                w.classList.add('cloze-correct');
            } else {
                w.classList.add('cloze-incorrect');
            }
        });

        const bracketOpen = document.createElement('span');
        bracketOpen.className = 'cloze-bracket';
        bracketOpen.textContent = '[';

        const bracketClose = document.createElement('span');
        bracketClose.className = 'cloze-bracket';
        bracketClose.textContent = ']';

        const area = document.createElement('span');
        area.className = 'cloze-blank-area';
        area.appendChild(bracketOpen);
        area.appendChild(wrap);
        area.appendChild(bracketClose);

        container.appendChild(prefix);
        container.appendChild(area);
        return container;
    }

    function isProperNoun(token) {
        if (token.length < 2) return false;
        const first = token.charCodeAt(0);
        if (first < 65 || first > 90) return false;
        return !COMMON_WORDS.has(token.toLowerCase());
    }

    function processTextNode(node) {
        const text = node.textContent;
        const tokens = text.match(/[a-zA-Z']+|[^a-zA-Z']+/g);
        if (!tokens) return null;

        let hasBlank = false;
        const container = document.createElement('span');
        container.dataset.clozeContainer = '';
        container.className = 'cloze-container';

        for (const token of tokens) {
            if (/^[a-zA-Z']+$/.test(token)) {
                const clean = token.replace(/'/g, '');
                if (clean.length >= CONFIG.minWordLength && /[a-zA-Z]/.test(clean)) {
                    if (isProperNoun(token)) {
                        container.appendChild(document.createTextNode(token));
                        continue;
                    }
                    state.wordIndex++;
                    if (state.wordIndex % state.interval === 0) {
                        container.appendChild(createBlankInput(token));
                        state.blankCount++;
                        hasBlank = true;
                        continue;
                    }
                }
            }
            container.appendChild(document.createTextNode(token));
        }

        if (hasBlank) {
            return { container, originalText: text };
        }
        return null;
    }

    function scanAndBlank() {
        if (state.replacements.length > 0) {
            restoreOriginal();
        }

        state.wordIndex = 0;
        state.blankCount = 0;
        state.replacements = [];
        state.checked = false;
        state.revealed = false;

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (isSkippable(node)) return NodeFilter.FILTER_REJECT;
                    if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                },
            }
        );

        const textNodes = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
            if (textNodes.length >= CONFIG.maxWords * 2) break;
        }

        let index = 0;

        function processBatch() {
            processingOwnMutations = true;
            const end = Math.min(index + CONFIG.batchSize, textNodes.length);
            for (let i = index; i < end; i++) {
                if (state.wordIndex >= CONFIG.maxWords) break;
                const result = processTextNode(textNodes[i]);
                if (result) {
                    state.replacements.push({
                        container: result.container,
                        originalText: result.originalText,
                    });
                    textNodes[i].parentNode.replaceChild(result.container, textNodes[i]);
                }
            }
            index = end;
            processingOwnMutations = false;

            if (index < textNodes.length && state.wordIndex < CONFIG.maxWords) {
                if (typeof requestIdleCallback === 'function') {
                    requestIdleCallback(processBatch, { timeout: 300 });
                } else {
                    setTimeout(processBatch, 50);
                }
            } else {
                updatePanel('active');
            }
        }

        if (textNodes.length === 0) {
            updatePanel('active');
            return;
        }

        processBatch();
    }

    function restoreOriginal() {
        for (let i = state.replacements.length - 1; i >= 0; i--) {
            const rep = state.replacements[i];
            if (rep.container.parentNode) {
                rep.container.parentNode.replaceChild(
                    document.createTextNode(rep.originalText),
                    rep.container
                );
            }
        }
        state.replacements = [];
        state.blankCount = 0;
    }

    function getFullAnswer(el) {
        var wrap = el.parentNode;
        if (wrap) {
            var area = wrap.parentNode;
            if (area) {
                var container = area.parentNode;
                if (container) {
                    var prefix = container.children[0];
                    if (prefix && prefix.classList.contains('cloze-first-letter')) {
                        return prefix.textContent + el.value;
                    }
                }
            }
        }
        return el.value;
    }

    function revealAnswers() {
        const blanks = document.querySelectorAll('.cloze-blank');
        blanks.forEach((el) => {
            el.disabled = true;
            var wrap = el.parentNode;
            wrap.classList.remove('cloze-correct', 'cloze-incorrect');
            var hint = wrap.nextElementSibling;
            if (hint && hint.classList.contains('cloze-hint')) {
                hint.remove();
            }

            var val = el.value.trim();
            var full = getFullAnswer(el).trim();
            if (val.length > 0 && full.toLowerCase() === el.dataset.answer.toLowerCase()) {
                wrap.classList.add('cloze-correct');
            } else {
                wrap.classList.add('cloze-incorrect');
                var hintEl = document.createElement('span');
                hintEl.className = 'cloze-hint';
                hintEl.textContent = el.dataset.answer;
                wrap.parentNode.insertBefore(hintEl, wrap.nextSibling);
            }
        });
        state.revealed = true;
        updatePanel('revealed');
    }

    function hideAnswers() {
        const blanks = document.querySelectorAll('.cloze-blank');
        blanks.forEach((el) => {
            el.disabled = false;
            var wrap = el.parentNode;
            wrap.classList.remove('cloze-correct', 'cloze-incorrect');
            var hint = wrap.nextElementSibling;
            if (hint && hint.classList.contains('cloze-hint')) {
                hint.remove();
            }
        });
        state.revealed = false;
        updatePanel('active');
    }

    function startPractice() {
        if (state.active) return;
        state.active = true;

        const slider = document.getElementById('cloze-interval');
        if (slider) {
            state.interval = parseInt(slider.value, 10) || CONFIG.defaultInterval;
            slider.disabled = true;
        }

        updatePanel('scanning');
        scanAndBlank();
        setupObserver();
    }

    function exitPractice() {
        state.active = false;
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        restoreOriginal();

        const slider = document.getElementById('cloze-interval');
        if (slider) slider.disabled = false;

        const panelBody = document.getElementById('cloze-panel-body');
        if (panelBody) panelBody.style.display = '';

        updatePanel('initial');
    }

    function setupObserver() {
        if (observer) observer.disconnect();
        observer = new MutationObserver((mutations) => {
            if (!state.active || processingOwnMutations) return;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.querySelectorAll) {
                            const textNodes = [];
                            const walker = document.createTreeWalker(
                                node,
                                NodeFilter.SHOW_TEXT,
                                {
                                    acceptNode(n) {
                                        if (isSkippable(n)) return NodeFilter.FILTER_REJECT;
                                        if (!n.textContent.trim()) return NodeFilter.FILTER_REJECT;
                                        return NodeFilter.FILTER_ACCEPT;
                                    },
                                }
                            );
                            while (walker.nextNode()) {
                                textNodes.push(walker.currentNode);
                            }
                            for (const tn of textNodes) {
                                if (state.wordIndex >= CONFIG.maxWords) break;
                                const result = processTextNode(tn);
                                if (result) {
                                    state.replacements.push({
                                        container: result.container,
                                        originalText: result.originalText,
                                    });
                                    tn.parentNode.replaceChild(result.container, tn);
                                }
                            }
                        }
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function makeDraggable(el, handle) {
        let isDragging = false;
        let startX, startY, origLeft, origTop;

        function onMouseDown(e) {
            if (e.button !== 0) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            origLeft = rect.left;
            origTop = rect.top;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        }

        function onMouseMove(e) {
            if (!isDragging) return;
            el.style.left = origLeft + e.clientX - startX + 'px';
            el.style.top = origTop + e.clientY - startY + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }

        function onMouseUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        handle.addEventListener('mousedown', onMouseDown);
    }

    function updatePanel(mode) {
        const actions = document.getElementById('cloze-actions');
        const info = document.getElementById('cloze-info');
        if (!actions || !info) return;

        switch (mode) {
            case 'initial':
                actions.innerHTML =
                    '<button id="cloze-start" class="cloze-btn-primary">Start Practice</button>';
                info.textContent = '';
                document.getElementById('cloze-start').onclick = startPractice;
                break;

            case 'scanning':
                actions.innerHTML = '<button disabled>Scanning page…</button>';
                info.textContent = 'Processing text, please wait…';
                break;

            case 'active':
                actions.innerHTML =
                    '<button id="cloze-reveal" class="cloze-btn-secondary">Reveal Answers</button>' +
                    '<button id="cloze-exit" class="cloze-btn-danger">Exit Practice</button>';
                info.textContent = state.blankCount + ' blanks created';
                document.getElementById('cloze-reveal').onclick = revealAnswers;
                document.getElementById('cloze-exit').onclick = exitPractice;
                break;

            case 'revealed': {
                const correctR = document.querySelectorAll('.cloze-input-wrap.cloze-correct').length;
                const totalR = document.querySelectorAll('.cloze-input-wrap').length;
                actions.innerHTML =
                    '<button id="cloze-hide" class="cloze-btn-secondary">Hide Answers</button>' +
                    '<button id="cloze-exit" class="cloze-btn-danger">Exit Practice</button>';
                info.textContent = 'Answers revealed. ' + correctR + ' / ' + totalR + ' were correct';
                document.getElementById('cloze-hide').onclick = hideAnswers;
                document.getElementById('cloze-exit').onclick = exitPractice;
                break;
            }
        }
    }

    function handleIntervalChange(e) {
        var slider = e.target;
        state.interval = parseInt(slider.value, 10);
        var label = document.getElementById('cloze-interval-label');
        if (label) label.textContent = 'every ' + state.interval + ' words';

        if (state.active) {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            restoreOriginal();
            state.active = true;
            state.wordIndex = 0;
            state.blankCount = 0;
            state.replacements = [];
            updatePanel('scanning');
            scanAndBlank();
            setupObserver();
        }
    }

    function createPanel() {
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.className = 'cloze-panel';
        panel.dataset.clozePanel = '';

        panel.innerHTML =
            '<div class="cloze-panel-title" id="cloze-drag-handle">Cloze Test</div>' +
            '<div class="cloze-panel-body" id="cloze-panel-body">' +
            '  <label>' +
            '    Gap:' +
            '    <input type="range" id="cloze-interval"' +
            '           min="' + CONFIG.minInterval + '" max="' + CONFIG.maxInterval + '" value="' + state.interval + '">' +
            '    <span id="cloze-interval-label">every ' + state.interval + ' words</span>' +
            '  </label>' +
            '  <div class="cloze-actions" id="cloze-actions"></div>' +
            '  <div class="cloze-stat" id="cloze-info"></div>' +
            '</div>';

        document.body.appendChild(panel);

        var handle = panel.querySelector('#cloze-drag-handle');
        makeDraggable(panel, handle);

        var slider = panel.querySelector('#cloze-interval');
        slider.addEventListener('input', handleIntervalChange);

        updatePanel('initial');
    }

    function setupKeyboard() {
        document.addEventListener('keydown', function (e) {
            if (!state.active) return;
            if (e.key === 'Enter' && e.target.matches && e.target.matches('.cloze-blank')) {
                e.preventDefault();
                var blanks = document.querySelectorAll('.cloze-blank:not([disabled])');
                var idx = Array.from(blanks).indexOf(e.target);
                if (idx >= 0 && idx < blanks.length - 1) {
                    blanks[idx + 1].focus();
                }
            }
        });

        document.addEventListener('keydown', function (e) {
            if (!state.active) return;
            if (e.key === 'Escape') {
                exitPractice();
            }
        });
    }

    function init() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        injectStyles();
        createPanel();
        setupKeyboard();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
