var onmessage = function (event) {
    var urls = event.data;
    var mapContents = {};

    function init() {
        Promise.all(urls.map(function (url) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();

                xhr.onreadystatechange = function () {
                    if (xhr.readyState == 2) {
                        var content = mapContents[url];
                        var lastModified = xhr.getResponseHeader('last-modified');

                        if (lastModified) {
                            xhr.abort();

                            if (content) {
                                if (content !== lastModified) {
                                    postMessage(url);
                                    mapContents[url] = lastModified;
                                }
                            } else {
                                mapContents[url] = lastModified;
                            }

                            resolve();
                        }
                    }
                };

                xhr.onload = function () {
                    var content = mapContents[url];

                    if (content) {
                        if (content !== xhr.responseText) {
                            postMessage(url);
                            mapContents[url] = xhr.responseText;
                        }
                    } else {
                        mapContents[url] = xhr.responseText;
                    }

                    resolve();
                };

                xhr.onerror = function () {
                    resolve();
                };

                xhr.timeout = 3000;
                xhr.open('get', url, true);
                xhr.send();
            });
        })).then(function () {
            timer = setTimeout(init, 1200);
        });
    }

    init();
};
