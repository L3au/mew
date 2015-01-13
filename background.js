function isEmpty(o) {
    return Object.keys(o).length == 0;
}

function getOptions() {
    return JSON.parse(localStorage.options || '{}');
}

function setOptions(options) {
    chrome.storage.sync.set(options);
    localStorage.options = JSON.stringify(options);

    if (options.enabled || options.disabledCache || options.autoRefresh) {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_48.png",
                "38": "icon/icon_128.png"
            }
        });
    } else {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_disabled.png",
                "38": "icon/icon_disabled.png"
            }
        });
    }

    chrome.tabs.reload({
        bypassCache: true
    });
}

function isValidPath(path) {
    if (!filemanager.exists) {
        filemanager.outerHTML = filemanager.outerHTML + '';
    }
    return filemanager.exists(path);
}

function isInAliIntranetSync() {
    var url = 'http://www.taobao.com/go/rgn/cainiao/tools/is_intranet.php';
    var xhr = new XMLHttpRequest();

    xhr.open('GET', url, false);
    xhr.send();

    return xhr.responseText === '1';
}

var app = (function () {
    function Background() {
        this.initialize();
    }

    Background.prototype = {
        constructor: Background,

        cacheWorkers: {},

        initialize: function () {
            this.bindEvents();
            this.initOptions();
            this.initAutoRefresh();
        },

        bindEvents: function () {
            var self = this;

            var isClearing;
            // clear browsing cache
            chrome.webRequest.onBeforeRequest.addListener(function () {
                var options = getOptions();

                if (options.disabledCache && !isClearing) {
                    var oneWeekTime = 1000 * 60 * 60 * 24 * 7;
                    var since = Date.now() - oneWeekTime;

                    isClearing = true;

                    chrome.browsingData.removeCache({
                        since: since
                    }, function () {
                        isClearing = false;
                    });
                }
            }, {
                urls: ['<all_urls>'],
                types: ['main_frame']
            });

            // proxy taobao assets
            chrome.webRequest.onBeforeRequest.addListener(function (request) {
                var url = request.url;
                var type = request.type;
                var mineTypes = {
                    'script': 'text/javascript',
                    'stylesheet': 'text/css'
                };
                var match, mineType;

                if (type == 'main_frame') {
                    match = /\.(js|css)(?:\?|$)/i.exec(url);

                    if (!match) {
                        return;
                    }

                    type = match[1] == 'js' ? 'script' : 'stylesheet';
                }

                mineType = mineTypes[type];

                var urls = self.processRequestUrl(url);

                if (!urls) {
                    return;
                }

                var content = self.getProxyContent(urls);

                if (!content) {
                    return;
                }

                var uri = 'data:' + mineType;
                var filename = self.getFileName(urls);

                uri += ';file=[' + filename + '];charset=utf-8,';
                uri += encodeURIComponent(content);

                return {
                    redirectUrl: uri
                };
            }, {
                urls: ['*://g.tbcdn.cn/*', '*://g.assets.daily.taobao.net/*'],
                types: ['main_frame', 'script', 'stylesheet']
            }, ['blocking']);

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
                            chrome.tabs.executeScript(tabId, {
                                file: 'content.js'
                            });
                        }
                    } else {
                        self.clearAllWorker();
                    }
                }
            });

            chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
                self.clearWorker(tabId);
            });

            chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                var action = request.action;
                var tabId = sender.tab.id;
                var workers = self.cacheWorkers;
                var assets;

                if (action == 'collectAssets') {
                    assets = request.assets;

                    assets = assets.map(function (url) {
                        return self.processRequestUrl(url) || url;
                    });

                    assets = assets.reduce(function (a, b) {
                        return a.push ? a.concat(b) : [a].concat(b);
                    });

                    assets = assets.map(function (url) {
                        return /^https?/.test(url) ? url : 'file://' + url;
                    });

                    var worker = new Worker('worker.js');

                    workers[tabId] = worker;

                    worker.onmessage = function (event) {
                        var url = event.data;
                        var isCSS = /\.css(?:\?|$)/i.exec(url);

                        if (!isCSS) {
                            self.clearWorker(tabId);
                        }

                        chrome.tabs.sendMessage(tabId, {
                            action: 'refresh',
                            url: url
                        });
                    };

                    worker.postMessage(assets);
                }
            });
        },

        initOptions: function () {
            chrome.storage.sync.get(function (options) {
                if (isEmpty(options)) {
                    options = {
                        enabled: false,
                        target: 'local',
                        localRules: [{}],
                        remoteRules: [{}],
                        autoRefresh: false,
                        refreshList: [''],
                        disabledCache: false
                    };

                    chrome.storage.sync.set(options);
                    localStorage.options = JSON.stringify(options);
                }

                if (!options.enabled) {
                    chrome.browserAction.setIcon({
                        path: {
                            "19": "icon/icon_disabled.png",
                            "38": "icon/icon_disabled.png"
                        }
                    });
                }
            });
        },

        initAutoRefresh: function () {
            var options = getOptions();
            var list = options.refreshList;

            if (options.autoRefresh && list != '') {

            }
        },

        clearWorker: function (tabId) {
            var workers = this.cacheWorkers;
            var worker = workers[tabId];

            if (worker) {
                worker.terminate();
                worker = null;
                delete workers[tabId];
            }
        },

        clearAllWorker: function () {
            var workers = this.cacheWorkers;

            for (var tabId in workers) {
                this.clearWorker(tabId);
            }
        },

        getFileName: function (urls) {
            return urls.map(function (url) {
                return url.split('/').slice(-2).join('/');
            }).join('|');
        },

        processRequestUrl: function (requestUrl) {
            var url = new URL(requestUrl);
            var host = url.host;
            var origin = url.origin;
            var search = url.search;
            var pathname = url.pathname;

            var proxyHosts = ['g.tbcdn.cn', 'g.assets.daily.taobao.net'];

            if (proxyHosts.indexOf(host) < 0) {
                return;
            }

            var options = getOptions();
            var target = options.target;
            var localRules = options.localRules;
            var remoteRules = options.remoteRules;

            if (!options.enabled) {
                return;
            }

            var files = [];
            var paths = [pathname];
            var isCombo = search.slice(0, 2) == '??';

            if (isCombo) {
                paths = search.slice(2).split(',').map(function (filename) {
                    return pathname + filename;
                });
            }

            if (target == 'local') {
                files = {};

                paths = paths.map(function (path) {
                    var temp = path.slice(1);

                    if (temp.match(/\/\d+\.\d+\.\d+\//)) {
                        temp = temp.replace(/\/\d+\.\d+\.\d+\//, '/');
                    }

                    var parts = temp.split('/');

                    return {
                        group: parts[0],
                        project: parts[1],
                        path: parts.slice(2).join('/'),
                        origPath: path
                    }
                });

                paths.forEach(function (path) {
                    localRules.some(function (rule) {
                        if (path.group !== rule.group || path.project !== rule.project) {
                            return false;
                        }

                        var fullPath = rule.path.replace(/\/$/, '') + '/' + path.path;

                        if (isValidPath(fullPath)) {
                            files[path.origPath] = fullPath;

                            return true;
                        }
                    });
                });

                if (Object.keys(files).length > 0) {
                    return paths.map(function (path) {
                        if (files.hasOwnProperty(path.origPath)) {
                            return files[path.origPath];
                        } else {
                            return origin + path.origPath;
                        }
                    });
                }
            }

            if (target == 'remote') {
                var gitOrigin = 'http://gitlab.alibaba-inc.com';

                paths = paths.map(function (path) {
                    var temp = path.slice(1);
                    var parts = temp.split('/');

                    var pathObj = {
                        group: parts[0],
                        project: parts[1],
                        path: parts.slice(2).join('/'),
                        origPath: path
                    };

                    var filePath;
                    var isMatched = remoteRules.some(function (rule) {
                        if (pathObj.group == rule.group && pathObj.project == rule.project) {
                            filePath = path.replace(/(\/\d+\.\d+\.\d+\/)/, '/raw/daily$1' + rule.directory + '/');
                            return true;
                        }
                    });

                    if (isMatched) {
                        return gitOrigin + filePath;
                    } else {
                        return origin + path;
                    }
                });

                var isValid = true;

                paths.forEach(function (url) {
                    if (url.indexOf(gitOrigin) == 0) {
                        var xhr = new XMLHttpRequest();

                        xhr.open('HEAD', url, false);
                        xhr.send();

                        if (xhr.status > 400) {
                            url = url.replace('/raw/daily', '/raw/publish');
                            xhr.open('HEAD', url, false);
                            xhr.send();

                            if (xhr.status > 400) {
                                isValid = false;
                            }
                        }
                    }

                    files.push(url);
                });

                if (!isValid) {
                    return;
                }

                if (files.length > 0) {
                    return files;
                }
            }
        },

        getProxyContent: function (urls) {
            var isAllPass = true;

            var content = urls.reduce(function (preContent, url) {
                var curContent = '';

                try {
                    if (/^https?/.test(url)) {
                        var xhr = new XMLHttpRequest();

                        xhr.open('GET', url, false);
                        xhr.send();

                        curContent += xhr.responseText + '\n';
                    } else {
                        curContent += filemanager.read(url) + '\n';
                    }
                } catch (e) {
                    isAllPass = false;
                }

                return preContent + curContent;
            }, '');

            return isAllPass ? content : '';
        }
    };

    return new Background;
}).call();