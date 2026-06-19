// ==UserScript==
// @name         B站评论区头像边框
// @match        https://www.bilibili.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const CSS = `
        a#user-avatar {
            display: inline-block !important;
            border: 2px solid #00a1d6 !important;
            border-radius: 50% !important;
            overflow: hidden !important;
            line-height: 0 !important;
        }
        a#user-avatar bili-avatar {
            display: block !important;
        }
        a#user-avatar img,
        bili-avatar img {
            border: 2px solid #00a1d6 !important;
            border-radius: 50% !important;
            box-sizing: border-box !important;
        }
    `;

    const injected = new WeakSet();

    function injectToShadow(root) {
        if (!root || injected.has(root)) return;
        injected.add(root);

        const style = document.createElement('style');
        style.setAttribute('data-avatar-border', '1');
        style.textContent = CSS;
        root.appendChild(style);

        // 递归注入嵌套 shadowRoot
        root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
                injectToShadow(el.shadowRoot);
            }
        });
    }

    function walkAllShadows(node = document.body) {
        if (node.shadowRoot) {
            injectToShadow(node.shadowRoot);
        }
        node.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
                injectToShadow(el.shadowRoot);
            }
        });
    }

    // 拦截 attachShadow
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
        const root = orig.call(this, init);
        // 延迟一点等内部结构渲染
        setTimeout(() => {
            injectToShadow(root);
            // 再递归一次，捕获新创建的嵌套 shadow
            walkAllShadows(this);
        }, 300);
        return root;
    };

    // 监听 DOM 变化
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                walkAllShadows(node);
            });
        });
    });

    function init() {
        observer.observe(document.body, { childList: true, subtree: true });
        walkAllShadows(document.body);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 兜底：定时检查新创建的 shadow
    setInterval(() => walkAllShadows(document.body), 2000);
})();
