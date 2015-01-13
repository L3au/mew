var options, timer;
var form = $('form');
var template = tplEngine($('#template').html());
var background = chrome.extension.getBackgroundPage();

$.extend($.serializeJSON.defaultOptions, {
    parseAll: true,
    checkboxUncheckedValue: 'false',
    useIntKeysAsArrayIndex: true,
    parseWithFunction: function (val, name) {
        return val;
    }
});

chrome.storage.sync.get(function (data) {
    options = $.extend(true, {}, data);

    updateView();

    $('html').addClass('popup-show');
});

var EVENTS = {
    // form submit
    '': {
        'submit': function (e) {
            e.preventDefault();

            options = getOptions();

            if (filterOptions(options)) {
                return;
            }

            background.setOptions(options);

            window.close();
        }
    },

    // enable or disable proxy
    '.proxy-enabled': {
        'switchChange.bootstrapSwitch': function (event, state) {
            clearTimeout(timer);

            options = getOptions();

            timer = setTimeout(function () {
                options.enabled = state;
                updateView();
            }, 250);
        }
    },

    // change proxy target
    '.proxy-target': {
        'change.radiocheck': function (e) {
            options = getOptions();

            options.local = this.value == 'local';
            options.gitlab = this.value == 'gitlab';

            updateView();
        }
    },

    // add rule item
    '.fui-plus': {
        click: function (e) {
            var target = $(e.currentTarget);
            var type = target.attr('data-type');

            options = getOptions();

            var rules = options.rules;
            var list = options.refreshList;

            if (type == 'rules') {
                rules.push({});
            }

            if (type == 'refresh') {
                list.push('');
            }

            updateView();
        }
    },

    // delete rule item
    '.fui-cross': {
        click: function (e) {
            var target = $(e.currentTarget);
            var type = target.attr('data-type');
            var index = parseInt(target.attr('data-index'), 10);

            options = getOptions();

            var rules = options.rules;
            var list = options.refreshList;

            if (type == 'rules') {
                rules.splice(index, 1);
            }

            if (type == 'refresh') {
                list.splice(index, 1);
            }

            updateView();
        }
    },

    // change autoRefresh option
    '.refresh-check': {
        'switchChange.bootstrapSwitch': function (event, state) {
            clearTimeout(timer);

            options = getOptions();

            timer = setTimeout(function () {
                options.autoRefresh = state;
                updateView();
            }, 250);
        }
    }
};

$.each(EVENTS, function (selector, events) {
    $.each(events, function (type, handler) {
        form.on(type, selector, handler);
    });
});

function getOptions() {
    var json = form.serializeJSON();

    json.target = $('.proxy-target:checked').val();
    json.directory = $('.proxy-directory:checked').val();

    return json;
}

function filterOptions(options) {
    var isRejected;
    var refreshList = options.refreshList;

    if (refreshList.length !== 1) {
        refreshList = refreshList.filter(function (item) {
            return !!item;
        });

        if (refreshList.length == 0) {
            refreshList.push('');
        }
    }

    options.refreshList = refreshList;

    if (!options.enabled || options.target !== 'local') {
        return;
    }

    var filterRules = [];

    for (var i = 0; i < options.rules.length; i++) {
        var isValid = true;
        var rule = options.rules[i];

        if ([rule.group, rule.project, rule.path] == ',,') {
            continue;
        }

        filterRules.push(rule);

        var group = $('.rule-item:eq(' + i + ') .group');

        if (rule.group == '') {
            group.addClass('form-control-error');
            isValid = false;
        } else {
            group.removeClass('form-control-error');
        }

        var path = $('.rule-item:eq(' + i + ') .path');

        if (!background.Util.isValidPath(rule.path)) {
            path.addClass('form-control-error');
            isValid = false;
        } else {
            path.removeClass('form-control-error');
        }

        if (!isValid) {
            isRejected = true;
        }
    }

    if (!isRejected) {
        if (filterRules.length == 0) {
            filterRules.push({});
        }

        options.rules = filterRules;
    }

    return isRejected;
}

function updateView() {
    form.html(template.render(options));

    $('[data-toggle="switch"]').bootstrapSwitch();
    $('[data-toggle="radio"]').radiocheck();
}

function tplEngine(str) {
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
}