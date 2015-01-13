function substitute(str, o) {
    return str.replace(/\\?\{([^{}]+)\}/g, function(match, name) {
        if (match.charAt(0) === '\\') {
            return match.slice(1);
        }
        return (o[name] === undefined) ? '' : o[name];
    });
}

var onmessage = function(event) {
    var data = event.data;

    postMessage();
}
