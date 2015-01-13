(function () {
    var rootEl = document.documentElement;

    function $(v, c) {
        return (c || document).querySelector(v);
    }

    function addClass(className, el) {
        var classList = className.match(/\b[^\s]+\b/g) || [];

        classList.forEach(function (cls) {
            (el || rootEl).classList.add(cls);
        });
    }

    function removeClass(className, el) {
        var classList = className.match(/\b[^\s]+\b/g) || [];

        classList.forEach(function (cls) {
            (el || rootEl).classList.remove(cls);
        });
    }

    function loading() {
        addClass('prism-pretty prism-pretty-spinner')
    }

    function unloading() {
        removeClass('prism-pretty prism-pretty-spinner')
    }

    function execScript(content) {
        var s = document.createElement('script');

        s.textContent = 'try{' + content + '}catch(e){}';

        document.head.appendChild(s);
        s.remove(), s = null;
    }

    var app = {
        init: function () {
            var self = this;

            var promises = [
                (function () {
                    return new Promise(function (resolve, reject) {
                        chrome.runtime.sendMessage({
                            action: 'requestHeader'
                        }, function (result) {
                            if (result.error) {
                                reject();
                            } else {
                                resolve(result);
                            }
                        });
                    });
                }),

                (function () {
                    return new Promise(function (resolve, reject) {
                        if (/te/.test(document.readyState)) {
                            resolve();
                        } else {
                            document.addEventListener('DOMContentLoaded', resolve);
                        }
                    });
                })
            ];

            chrome.storage.sync.get(function (options) {
                if (options.enabled) {
                    Promise.all(promises.map(function (p) {
                        return p();
                    })).then(function () {
                        self.prettifyContent.apply(self, arguments[0]);
                    }, function () {
                        unloading();
                    });
                }
            });

            chrome.storage.onChanged.addListener(function () {
                if (rootEl.classList.contains('prism-pretty')) {
                    location.reload();
                }
            });
        },

        prettifyContent: function (result, loadedEvent) {
            var content;
            var body = document.body;
            var children = body.children;
            var pre = children[0];

            if (children.length == 0) {
                content = body.textContent.trim();
            }

            if (children.length == 1 && pre.nodeName == 'PRE') {
                content = pre.textContent.trim();
            }

            if (!content) {
                unloading();
                return;
            }

            var type = result.type;
            var headers = result.headers;

            if (!type) {
                try {
                    JSON.parse(content);
                    type = 'json';
                } catch (e) {
                    try {
                        esprima.parse(content);
                        type = 'js';

                        if (/^\w+\(\{/.test(content)) {
                            type = 'jsonp';
                        }
                    } catch (e) {
                    }
                }

                if (!type) {
                    var style = document.createElement('style');

                    style.textContent = content;

                    document.head.appendChild(style);

                    if (style.sheet.rules.length) {
                        type = 'css';
                    }

                    style.remove();
                }
            }

            if (!type) {
                unloading();
                return;
            }

            if (type == 'json' || type == 'jsonp') {
                var script = 'var json = ';

                if (type == 'json') {
                    script += content;
                }

                if (type == 'jsonp') {
                    script += '(' + content.replace(/\w+\(/, '');
                }

                script += ';console.log("%cvar json = ", "color:teal", json);';

                execScript(script);
            }

            loading();

            chrome.runtime.sendMessage({
                action: 'prettify',
                type: type,
                content: content,
                headers: headers
            }, function (responseHtml) {
                removeClass('prism-pretty-spinner');

                if (!responseHtml) {
                    unloading();
                    return;
                }

                document.body.innerHTML = responseHtml;

                var script = $('script');

                if (script) {
                    execScript(script.textContent);
                    script.remove();
                }

                var headerEl = $('.request-headers');

                if (headerEl) {
                    setTimeout(function () {
                        headerEl.style.webkitTransitionDelay = 0;
                        headerEl.style.opacity = 0;
                    }, 3000);
                }
            });
        }
    };

    app.init();
}).call();