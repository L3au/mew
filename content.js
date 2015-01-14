(function () {
    var rootEl = document.documentElement;

    function $(v, c) {
        return (c || document).querySelector(v);
    }

    function $$(v, c) {
        return (c || document).querySelectorAll(v);
    }

    function getScripts() {
        var scripts = $$('script[src]');

        scripts = [].slice.call(scripts);

        return scripts.map(function (script) {
            return script.src
        });
    }

    function getStyleLinks() {
        var links = $$('link[href][rel="stylesheet"]');

        links = [].slice.call(links);

        return links.map(function (link) {
            return link.href;
        });
    }

    function onLoaded(){
        var assets = [];

        var url = new URL(location.href);
        
        if (url.pathname.slice(-5) === '.html') {
            assets.push(location.href);
        }

        assets = assets.concat(getScripts()).concat(getStyleLinks());

        chrome.runtime.sendMessage({
            action: 'collectAssets',
            assets: assets
        });
    }

    if (document.readyState == 'complete') {
        onLoaded();
    } else {
        window.onload = onLoaded;
    }

    chrome.runtime.onMessage.addListener(function (request) {
        var action = request.action;
        var url = request.url;
        var isCSS = /\.css(?:\?|$)/i.exec(url);

        if (action == 'refresh') {
            if (isCSS) {
                var links = $$('link[href][rel="stylesheet"]');

                links = [].slice.call(links);

                links.forEach(function (link) {
                    link.href = link.href;
                });

                rootEl.classList.add('mew-proxy-refresh');

                setTimeout(function () {
                    rootEl.classList.remove('mew-proxy-refresh');
                });
            } else {
                location.reload()
            }
        }
    });
}).call();