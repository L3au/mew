(function () {
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

                updateView();
            }
        },

        // add rule item
        '.fui-plus': {
            click: function (e) {
                var target = $(e.currentTarget);
                var type = target.attr('data-type');

                options = getOptions();

                var localRules = options.localRules;
                var remoteRules = options.remoteRules;
                var refreshList = options.refreshList;

                switch (type) {
                    case 'local':
                        localRules.push({});
                        break;
                    case 'remote':
                        remoteRules.push({});
                        break;
                    case 'refresh':
                        refreshList.push('');
                        break;
                    default:
                        break;
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

                var localRules = options.localRules;
                var remoteRules = options.remoteRules;
                var refreshList = options.refreshList;

                switch (type) {
                    case 'local':
                        localRules.splice(index, 1);
                        break;
                    case 'remote':
                        remoteRules.splice(index, 1);
                        break;
                    case 'refresh':
                        refreshList.splice(index, 1);
                        break;
                    default:
                        break;
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

        return json;
    }

    function filterOptions(options) {
        var refreshList = options.refreshList;

        if (refreshList.length !== 1) {
            refreshList = refreshList.filter(function (item) {
                return !!item;
            });

            if (refreshList.length <= 1) {
                refreshList.push('');
            }
        }

        options.refreshList = refreshList;

        if (!options.enabled) {
            return;
        }

        if (options.target == 'local') {
            return filterRules(options.localRules, 'local');
        }

        if (options.target == 'remote') {
            return filterRules(options.remoteRules, 'remote');
        }
    }

    function filterRules(rules, type) {
        var isRejected;
        var filterRules = [];

        for (var i = 0; i < rules.length; i++) {
            var isValid = true;
            var rule = rules[i];

            var ruleArray = [rule.group, rule.project];
            
            if (type == 'local') {
                ruleArray.push(rule.path);
            } else {
                ruleArray.push(rule.project);
            }

            if (ruleArray == ',,') {
                continue;
            }

            var el = type == 'local' ? '.proxy-local-rules' : '.proxy-remote-rules';

            var group = $('.rule-item:eq(' + i + ') .group', el);

            if (rule.group == '') {
                group.addClass('form-control-error');
                isValid = false;
            } else {
                group.removeClass('form-control-error');
            }

            var project = $('.rule-item:eq(' + i + ') .project', el);

            if (rule.project == '') {
                project.addClass('form-control-error');
                isValid = false;
            } else {
                project.removeClass('form-control-error');
            }

            if (type == 'local') {
                var path = $('.rule-item:eq(' + i + ') .path', el);

                if (!background.isValidPath(rule.path)) {
                    path.addClass('form-control-error');
                    isValid = false;
                } else {
                    path.removeClass('form-control-error');
                }
            } else {
                var directory = $('.rule-item:eq(' + i + ') .directory', el);

                if (rule.directory == '') {
                    directory.addClass('form-control-error');
                    isValid = false;
                } else {
                    directory.removeClass('form-control-error');
                }
            }

            filterRules.push(rule);

            if (!isValid) {
                isRejected = true;
            }
        }

        filterRules.push({});

        options[type + 'Rules'] = filterRules;

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
}).call();