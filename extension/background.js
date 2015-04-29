var ConfigPort = 'http://127.0.0.1:9999';

RegExp.prototype.toJSON = function () {
    return this.source;
};

function copy(content) {
    var textarea = document.createElement('textarea');

    textarea.value = content;
    document.body.appendChild(textarea);

    textarea.select();

    document.execCommand('copy');
    textarea.remove();
}

function getOptions(request) {
    var options = JSON.parse(localStorage.options);

    if (!request) {
        return options;
    }

    return new Promise(function (resolve, reject) {
        getRules().then(function (rules) {
            options.proxyRules = rules;
            resolve(options);
        }, function (err) {
            reject(err);
        });
    });
}

function setOptions(options) {
    return new Promise(function (resolve, reject) {
        localStorage.options = JSON.stringify(options);

        var rules = options.proxyRules;
        var api = ConfigPort + '/rule';
        var xhr = new XMLHttpRequest();

        rules = encodeURIComponent(JSON.stringify(rules));

        xhr.onload = function () {
            var json = JSON.parse(xhr.responseText);

            if (json.success) {
                setProxy(true);
                chrome.tabs.reload({
                    bypassCache: true
                });
            }
        };

        xhr.onerror = function () {
            clearProxy();
            reject('保存规则出了点问题，可能Aproxy没启动');
        };

        xhr.open('POST', api);
        xhr.send('rules=' + rules);
    });
}

function getRules() {
    return new Promise(function (resolve, reject) {
        var api = ConfigPort + '/rule';
        var xhr = new XMLHttpRequest();

        xhr.onload = function () {
            var rules = JSON.parse(xhr.responseText);
            var options = getOptions();

            options.proxyRules = rules;

            localStorage.options = JSON.stringify(options);

            setProxy();
            resolve(rules);
        };

        xhr.onerror = function () {
            clearProxy();
            reject('Aproxy没启动或不是默认端口');
        };

        xhr.open('GET', api);
        xhr.send();
    });
}

function clearProxy() {
    chrome.proxy.settings.clear({
        scope: 'regular'
    });
    chrome.browserAction.setIcon({
        path: {
            "19": "icon/icon_disabled.png",
            "38": "icon/icon_disabled.png"
        }
    });
}

function regExpMatch(url, pattern) {
    try {
        return new RegExp(pattern).test(url);
    } catch (ex) {
        return false;
    }
}

function domainIs(host, domains) {
    var hasOwnProperty = Object.hasOwnProperty;
    var suffix;
    var pos = host.lastIndexOf('.');
    pos = host.lastIndexOf('.', pos - 1);

    while (1) {
        if (pos == -1) {
            return hasOwnProperty.call(domains, host) && host;
        }
        suffix = host.substring(pos + 1);
        if (hasOwnProperty.call(domains, suffix)) {
            return suffix;
        }
        pos = host.lastIndexOf('.', pos - 1);
    }
}

function FindProxyForURL(url, host) {
    var i, matchHost;

    url = url.replace(/\?\?/gi, '');

    for (i = 0; i < proxyRules.length; i++) {
        if (regExpMatch(url, proxyRules[i])) {
            return 'PROXY 127.0.0.1:9998';
        }
    }
    
    if ((matchHost = domainIs(host, domainRules))) {
        return domainRules[matchHost] || 'DIRECT;';
    }

    return 'DIRECT;';
}

function setProxy() {
    var options = getOptions();
    var proxyRules = options.proxyRules || [];
    var domainRules = options.domainRules || [];
    var pacRules = [], domains = {};

    proxyRules = proxyRules.filter(function (rule) {
        return rule.disabled === false;
    });
    domainRules = domainRules.filter(function (rule) {
        return rule.disabled === false;
    });

    proxyRules = proxyRules.map(function (rule) {
        var group = rule.group;
        var project = rule.project;
        var version = '/\\d+\\.\\d+\\.\\d+/';

        if (group == '/') {
            return project;
        }

        return group + '/' + project + version;
    });

    domainRules.forEach(function (rule) {
        var ip = rule.ip;
        var domain = rule.domain;
        var socks = rule.socks;
        var type = socks ? 'SOCKS5 ' : 'PROXY ';

        domains[domain] = type + (ip.indexOf(':') > -1 ? ip : (ip + ':80'));
    });

    pacRules.push('var proxyRules= ' + JSON.stringify(proxyRules) + ';');
    pacRules.push('var domainRules= ' + JSON.stringify(domains) + ';');
    pacRules.push(domainIs.toString());
    pacRules.push(regExpMatch.toString());
    pacRules.push(FindProxyForURL.toString());

    chrome.proxy.settings.set({
        value: {
            mode: 'pac_script',
            pacScript: {
                data: pacRules.join('\n')
                //data: 'function FindProxyForURL(){return "DIRECT"}'
            }
        }, scope: 'regular'
    });

    chrome.browserAction.setIcon({
        path: {
            "19": "icon/icon_48.png",
            "38": "icon/icon_128.png"
        }
    });
}

var cacheWorkers = {};
var options = JSON.parse(localStorage.options || '{}');

if (Object.keys(options) == 0) {
    localStorage.options = JSON.stringify({
        domainRules: [],
        autoRefresh: false,
        refreshList: []
    });
}

if (!options.domainRules) {
    options.domainRules = [{}];
    localStorage.options = JSON.stringify(options);
}

function clearWorker(tabId) {
    var worker = cacheWorkers[tabId];

    if (worker) {
        worker.terminate();
        worker = null;
        delete cacheWorkers[tabId];
    }
}

function clearAllWorkers() {
    for (var tabId in cacheWorkers) {
        clearWorker(tabId);
    }
}

function statusWatcher() {
    var xhr = new XMLHttpRequest();

    xhr.open('HEAD', ConfigPort);

    xhr.onload = function () {
        setProxy();
    };
    xhr.onerror = function () {
        clearProxy();
    };

    xhr.send();
}

//chrome.proxy.onProxyError.addListener(function (details) {
    //console.error(details);
    //clearProxy();
//});

//chrome.webNavigation.onBeforeNavigate.addListener(statusWatcher);

// watch auto refresh
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    self.clearWorker(tabId);

    if (changeInfo.status == 'complete') {
        var options = getOptions();
        var list = options.refreshList;

        if (options.autoRefresh && list != '') {
            var url = new URL(tab.url);

            var isMatched = list.some(function (rUrl) {
                rUrl = new URL(rUrl);

                if (rUrl.origin == url.origin && rUrl.pathname == url.pathname) {
                    return true;
                }
            });

            if (isMatched) {
                chrome.tabs.sendMessage(tabId, {
                    action: 'collect'
                });
            }
        } else {
            clearAllWorkers();
        }
    }
});

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    clearWorker(tabId);
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    var action = request.action;
    var tabId = sender.tab.id;
    var assets = request.assets;

    if (action == 'watch') {
        var worker = new Worker('worker.js');

        cacheWorkers[tabId] = worker;

        worker.onmessage = function (event) {
            var url = event.data;
            var isCSS = /\.css(?:[\?#]|$)/i.test(url);

            clearWorker(tabId);

            chrome.tabs.sendMessage(tabId, {
                url: url,
                isCSS: isCSS,
                action: 'refresh'
            });
        };

        worker.postMessage(assets);
    }
});


//chrome.webRequest.onHeadersReceived.addListener(function (request) {
//    var headers = request.responseHeaders;
//
//    headers.some(function (header, index) {
//        if (header.name.toLowerCase() == 'content-type') {
//            headers.splice(index, 1);
//            return true;
//        }
//    });
//
//    headers.push({
//        name: 'content-security-policy',
//        value: "default-src *; script-src 'unsafe-inline' 'unsafe-eval' g.tbcdn.cn; style-src 'unsafe-inline'"
//    });
//
//    return {
//        responseHeaders: headers
//    };
//}, {
//    urls: ['*://127.0.0.1/*'],
//    types: ['main_frame']
//}, ['blocking', 'responseHeaders']);
