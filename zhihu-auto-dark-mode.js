// ==UserScript==
// @name         Zhihu Auto Dark Mode
// @namespace    http://tampermonkey.net/
// @version      2026-06-07
// @description  try to take over the world!
// @author       You
// @include      *.zhihu.com/*
// @exclude      *link.zhihu.com/*
// @exclude      *www.zhihu.com/question/*/log
// @exclude      *www.zhihu.com/people/*/logs
// @icon         https://www.google.com/s2/favicons?sz=64&domain=zhihu.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    const setDarkMode = on => {
        let alreadyOn = document.querySelector('html').getAttribute('data-theme') == 'dark';
        if ((alreadyOn && (!on)) || ((!alreadyOn) && on)) {
            let keyword, keyword_replacement;
            if (on) {
                keyword = 'theme=light';
                keyword_replacement = 'theme=dark';
            } else {
                keyword = 'theme=dark';
                keyword_replacement = 'theme=light';
            }
            if (window.location.href.match(/theme=(dark|light)/))
                window.location.href = window.location.href.replace(keyword, keyword_replacement);
            else {
                if (window.location.href.match(/\?[^=]+=/))
                    window.location.href = window.location.href + `&${keyword_replacement}`;
                else
                    window.location.href = window.location.href + `?${keyword_replacement}`;
            }
        }
    }
    const in_iframe = () => {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }
    if (!in_iframe()) {
        if (window.matchMedia) {// if the browser/os supports system-level color scheme
            setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => setDarkMode(e.matches));
        } else {// otherwise use local time to decide
            let hour = (new Date()).getHours();
            setDarkMode(hour > 18 || hour < 8);
        }
    }
})();
