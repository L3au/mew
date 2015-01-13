chrome.webRequest.onBeforeRequest.addListener(function (request) {
    var content = '';
    var mineTypes = {
        'script': 'application/javascript',
        'stylesheet': 'text/css'
    };
    var urls = app.processRequestUrl(request.url);

    if (urls) {
        content = app.getUrlsContent(urls);

        urls = urls.map(function (url) {
            return url.split('/').slice(-2).join('/');
        });

        if (content) {
            var mineType = mineTypes[request.type];

            var uri = 'data:' + mineType;

            uri += ';charset=utf-8;file=[' + urls.join('|') + ']';
            uri += ',' + encodeURIComponent(content);

            return {
                redirectUrl: uri
            };
        }
    }
}, {
    urls: ['*://g.tbcdn.cn/*', '*://g.assets.daily.taobao.net/*'],
    types: ['script', 'stylesheet']
}, ['blocking']);

var Util = {
    isEmpty: function (o) {
        return Object.keys(o).length == 0;
    },

    template: function (str) {
        var strFunc = "var out = ''; out+=" + "'" +
            str.replace(/[\r\t\n]/g, " ")
                .replace(/'(?=[^}]*}})/g, "\t")
                .split("'").join("\\'")
                .split("\t").join("'")
                .replace(/{{=(.+?)}}/g, "'; out += $1; out += '")
                .split("{{").join("';")
                .split("}}").join("out+='") + "'; return out;";

        var fn = new Function("it", strFunc);

        return {
            render: function (data) {
                return fn(data || {});
            }
        }
    },

    isInAliIntranet: function (fn) {
        var url = 'http://www.taobao.com/go/rgn/cainiao/tools/is_intranet.php';
        var xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);
        xhr.onload = function () {
            fn.call(this, xhr.responseText);
        };
        xhr.send();
    },

    isInAliIntranetSync: function () {
        var url = 'http://www.taobao.com/go/rgn/cainiao/tools/is_intranet.php';
        var xhr = new XMLHttpRequest();

        xhr.open('GET', url, false);
        xhr.send();

        return xhr.responseText === '1';
    },

    setOptions: function (options) {
        chrome.storage.sync.set(options);
        localStorage.options = JSON.stringify(options);
        chrome.tabs.reload({
            bypassCache: true
        });
    },

    isValidPath: function (path) {
        return filemanager.exists(path);
    }
};

var app = (function () {
    var Background = function () {
        this.initialize();
    };

    Background.prototype = {
        constructor: Background,

        initialize: function () {
            this.initExtensionOptions();
        },

        initExtensionOptions: function () {
            chrome.storage.local.get(function (options) {
                if (Util.isEmpty(options)) {
                    options = {
                        enabled: false,
                        target: 'local',
                        rules: [{}],
                        directory: 'src',
                        autoRefresh: false,
                        refreshList: ['']
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

        processRequestUrl: function (requestUrl) {
            var url = new URL(requestUrl);
            var host = url.host;
            var search = url.search;
            var pathname = url.pathname;

            var isAssets = /\.(js|css)(?:\?|$)/i.test(requestUrl);
            var proxyHosts = ['g.tbcdn.cn', 'g.assets.daily.taobao.net'];

            if (!isAssets || proxyHosts.indexOf(url.host) < 0) {
                return;
            }

            var proxy = JSON.parse(localStorage.proxy);
            var target = proxy.target;
            var rules = proxy.rules;
            var directory = proxy.directory;

            if (!proxy.enabled) {
                return;
            }

            var files;
            var paths = [pathname];
            var isCombo = search.slice(0, 2) == '??';

            if (isCombo) {
                paths = search.slice(2).split(',').map(function (file) {
                    return pathname + file;
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
                    var isTarget = rules.some(function (rule) {
                        if (path.group !== rule.group) {
                            return false;
                        }

                        // all group
                        if (!rule.project || (rule.project && path.project == rule.project)) {
                            var pathArray = [rule.path, directory, path.path];

                            if (!rule.project) {
                                pathArray.splice(1, 0, path.project);
                            }

                            var fullPath = pathArray.join('/');

                            if (Util.isValidPath(fullPath)) {
                                files[path.origPath] = fullPath;

                                return true;
                            }
                        }
                    });
                });

                if (Object.keys(files).length > 0) {
                    files = paths.map(function (path) {
                        var localPath = files[path.origPath];

                        if (localPath) {
                            return localPath;
                        } else {
                            return url.origin + path.origPath;
                        }
                    });
                }
            }

            if (target == 'gitlab') {
                var origin = 'http://gitlab.alibaba-inc.com';

                files = [];
                paths = paths.map(function (path) {
                    return origin + path.replace(/(\/\d+\.\d+\.\d+\/)/, '/raw/daily$1' + directory + '/');
                });

                paths.forEach(function (url) {
                    var xhr = new XMLHttpRequest();

                    xhr.open('HEAD', url, false);
                    xhr.send();

                    if (xhr.status > 400) {
                        url = url.replace('/raw/daily', '/raw/publish');
                        xhr.open('HEAD', url, false);
                        xhr.send();

                        if (xhr.status > 400) {
                            return;
                        }
                    }

                    files.push(url);
                });
            }

            if (files.length > 0) {
                return files;
            }
        },

        getUrlsContent: function (urls) {
            var isAllPass = true;

            var content = urls.reduce(function (preContent, url) {
                var curContent = '';

                try {
                    if (url.match(/^\//)) {
                        curContent += filemanager.read(url) + '\n';
                    } else {
                        var xhr = new XMLHttpRequest();

                        xhr.open('GET', url, false);
                        xhr.send();

                        curContent += xhr.responseText + '\n';
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