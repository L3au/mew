(function () {
    var options, timer;
    var form = $('form');
    var proxyScroll, domainScroll, refreshScroll;
    var template = tplEngine($('#template').html());
    var background = chrome.extension.getBackgroundPage();

    function getOptions() {
        return form.serializeJSON();
    }

    $.extend($.serializeJSON.defaultOptions, {
        parseAll: true,
        checkboxUncheckedValue: 'false',
        useIntKeysAsArrayIndex: true,
        parseWithFunction: function (val, name) {
            return val;
        }
    });

    background.getOptions(true).then(function (data) {
        options = $.extend(true, {}, data);

        options.customRules = [{}, {}];
        options.httpsRules = [{}, {}];
        options.refreshRules = ['', ''];


        if (!options.proxyRules || !options.proxyRules.length) {
            options.proxyRules = [{}];
        }

        //options.proxyRules = [{}];

        if (!options.refreshRules || !options.refreshRules.length) {
            options.refreshRules = [''];
        }

        if (!options.domainRules || !options.domainRules.length) {
            options.domainRules = [{}];
        }

        updateView();

        $('html').addClass('popup-show').removeAttr('style');
    }, function (err) {
        $('.container').addClass('container-error').html(err);
        $('html').addClass('popup-show');
    });


    var EVENTS = {
        // form submit
        '': {
            'submit': function (e) {
                e.preventDefault();

                options = getOptions();

                if (!filterOptions()) {
                    return;
                }

                background.setOptions(options, function () {

                }, function (err) {
                    $('.container').addClass('container-error').html(err);
                });

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

        // enable/disable socks proxy
        '.fui-socks': {
            click: function (e) {
                var target = $(e.currentTarget);
                var type = target.attr('data-type');
                var socksIpt = target.prev('.socks');
                var isSocks = socksIpt.val() != 'true';
                var index = parseInt(target.attr('data-index'), 10);
                var rules;

                options = getOptions();

                rules = options.domainRules;
                rules[index].socks = isSocks;

                socksIpt.val(isSocks);
                target.toggleClass('fui-socks-disabled');
            }
        },

        // enable/disable rule item
        '.fui-eye': {
            click: function (e) {
                var target = $(e.currentTarget);
                var type = target.attr('data-type');
                var item = target.parent();
                var isDisabled = !item.hasClass('rule-item-disabled');
                var index = parseInt(target.attr('data-index'), 10);
                var rules;

                options = getOptions();

                switch (type) {
                    case 'proxy':
                        rules = options.proxyRules;
                        break;
                    case 'domain':
                        rules = options.domainRules;
                        break;
                }

                rules[index].disabled = isDisabled;

                item.find('.disabled').val(isDisabled);
                item.toggleClass('rule-item-disabled');
            }
        },

        // add rule item
        '.fui-plus': {
            click: function (e) {
                var target = $(e.currentTarget);
                var type = target.attr('data-type');

                options = getOptions();

                var proxyRules = options.proxyRules;
                var domainRules = options.domainRules;
                var refreshRules = options.refreshRules;

                switch (type) {
                    case 'proxy':
                        proxyRules.push({});
                        proxyScroll = $('.proxy-rules').scrollTop() + 40;
                        break;
                    case 'domain':
                        domainRules.push({});
                        domainScroll = $('.domain-rules').scrollTop() + 40;
                        break;
                    case 'refresh':
                        refreshRules.push('');
                        refreshScroll = $('.refresh-list').scrollTop() + 40;
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

                var proxyRules = options.proxyRules;
                var domainRules = options.domainRules;
                var refreshRules = options.refreshRules;

                switch (type) {
                    case 'proxy':
                        proxyRules.splice(index, 1);
                        proxyScroll = $('.proxy-rules').scrollTop();
                        break;
                    case 'domain':
                        domainRules.splice(index, 1);
                        domainScroll = $('.domain-rules').scrollTop();
                        break;
                    case 'refresh':
                        refreshRules.splice(index, 1);
                        refreshScroll = $('.refresh-list').scrollTop();
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

    $('#address').on('click', function () {
        var el = $(this);
        var address = el.attr('data-copy');

        if (address) {
            background.copy(address);

            el.text('复制成功!');

            setTimeout(function () {
                el.text(address);
            }, 1000);
        }
    });

    $.each(EVENTS, function (selector, events) {
        $.each(events, function (type, handler) {
            form.on(type, selector, handler);
        });
    });

    function filterOptions() {
        var refreshRules = options.refreshRules;

        refreshRules = refreshRules.filter(function (item) {
            return !!item.trim();
        });

        options.refreshRules = refreshRules;

        var isRejected;
        var proxyRules = options.proxyRules;
        var domainRules = options.domainRules;
        var _proxyRules = [], _domainRules = [];

        for (var i = 0; i < proxyRules.length; i++) {
            var isValid = true;
            var rule = proxyRules[i];

            rule.group = rule.group.trim();
            rule.project = rule.project.trim();
            rule.path = rule.path.trim();

            var ruleArray = [rule.group, rule.project, rule.path];

            if (ruleArray.join() == ',,') {
                continue;
            }

            var group = $('.rule-item:eq(' + i + ') .group');

            if (rule.group == '') {
                group.addClass('form-control-error');
                isValid = false;
            } else {
                group.removeClass('form-control-error');
            }

            var project = $('.rule-item:eq(' + i + ') .project');

            if (rule.project == '') {
                project.addClass('form-control-error');
                isValid = false;
            } else {
                project.removeClass('form-control-error');
            }

            var path = $('.rule-item:eq(' + i + ') .path');

            if (rule.path == '') {
                path.addClass('form-control-error');
                isValid = false;
            } else {
                path.removeClass('form-control-error');
            }

            _proxyRules.push(rule);

            if (!isValid) {
                isRejected = true;
            }
        }

        for (var j = 0; j < domainRules.length; j++) {
            var rule = domainRules[j];

            if (rule.domain && rule.ip) {
                _domainRules.push(rule);
            }
        }

        options.proxyRules = _proxyRules;
        options.domainRules = _domainRules;

        return !isRejected;
    }

    function updateView() {
        form.html(template.render(options));

        $('[data-toggle="switch"]').bootstrapSwitch();
        $('[data-toggle="radio"]').radiocheck();

        $('.proxy-rules').scrollTop(proxyScroll);
        $('.domain-rules').scrollTop(domainScroll);
        $('.refresh-list').scrollTop(refreshScroll);

        //var container = $('.container');
        //
        //container.height(container.outerHeight());
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
