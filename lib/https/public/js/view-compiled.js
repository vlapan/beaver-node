(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        if (typeof root === 'undefined' || root !== Object(root)) {
            throw new Error('templatizer: window does not exist or is not an object');
        }
        root.templatizer = factory();
    }
}(this, function () {
    var jade=function(){function n(n){return null!=n&&""!==n}function t(e){return(Array.isArray(e)?e.map(t):e&&"object"==typeof e?Object.keys(e).filter(function(n){return e[n]}):[e]).filter(n).join(" ")}function e(n){return i[n]||n}function r(n){var t=String(n).replace(o,e);return t===""+n?n:t}var a={};a.merge=function t(e,r){if(1===arguments.length){for(var a=e[0],i=1;i<e.length;i++)a=t(a,e[i]);return a}var o=e.class,s=r.class;(o||s)&&(o=o||[],s=s||[],Array.isArray(o)||(o=[o]),Array.isArray(s)||(s=[s]),e.class=o.concat(s).filter(n));for(var f in r)"class"!=f&&(e[f]=r[f]);return e},a.joinClasses=t,a.cls=function(n,e){for(var r=[],i=0;i<n.length;i++)e&&e[i]?r.push(a.escape(t([n[i]]))):r.push(t(n[i]));var o=t(r);return o.length?' class="'+o+'"':""},a.style=function(n){return n&&"object"==typeof n?Object.keys(n).map(function(t){return t+":"+n[t]}).join(";"):n},a.attr=function(n,t,e,r){return"style"===n&&(t=a.style(t)),"boolean"==typeof t||null==t?t?" "+(r?n:n+'="'+n+'"'):"":0==n.indexOf("data")&&"string"!=typeof t?(JSON.stringify(t).indexOf("&")!==-1&&console.warn("Since Jade 2.0.0, ampersands (`&`) in data attributes will be escaped to `&amp;`"),t&&"function"==typeof t.toISOString&&console.warn("Jade will eliminate the double quotes around dates in ISO form after 2.0.0")," "+n+"='"+JSON.stringify(t).replace(/'/g,"&apos;")+"'"):e?(t&&"function"==typeof t.toISOString&&console.warn("Jade will stringify dates in ISO form after 2.0.0")," "+n+'="'+a.escape(t)+'"'):(t&&"function"==typeof t.toISOString&&console.warn("Jade will stringify dates in ISO form after 2.0.0")," "+n+'="'+t+'"')},a.attrs=function(n,e){var r=[],i=Object.keys(n);if(i.length)for(var o=0;o<i.length;++o){var s=i[o],f=n[s];"class"==s?(f=t(f))&&r.push(" "+s+'="'+f+'"'):r.push(a.attr(s,f,!1,e))}return r.join("")};var i={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"},o=/[&<>"]/g;return a.escape=r,a.rethrow=function n(t,e,r,a){if(!(t instanceof Error))throw t;if(!("undefined"==typeof window&&e||a))throw t.message+=" on line "+r,t;try{a=a||require("fs").readFileSync(e,"utf8")}catch(e){n(t,null,r)}var i=3,o=a.split("\n"),s=Math.max(r-i,0),f=Math.min(o.length,r+i),i=o.slice(s,f).map(function(n,t){var e=t+s+1;return(e==r?"  > ":"    ")+e+"| "+n}).join("\n");throw t.path=e,t.message=(e||"Jade")+":"+r+"\n"+i+"\n\n"+t.message,t},a.DebugItem=function(n,t){this.lineno=n,this.filename=t},a}(); 

    var templatizer = {};


    // form.jade compiled template
    templatizer["form"] = function tmpl_form(locals) {
        var buf = [];
        var jade_mixins = {};
        var jade_interp;
        var locals_for_with = locals || {};
        (function(hostname, title) {
            buf.push('<!DOCTYPE html><html><head><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><title>' + jade.escape(null == (jade_interp = title) ? "" : jade_interp) + '</title><link rel="stylesheet" href="/css/style.css"></head><body><form action="/" method="post" enctype="application/x-www-form-urlencoded"><div class="left-panel"><div class="hostname">' + (null == (jade_interp = hostname) ? "" : jade_interp) + '</div><input type="submit" name="logout" value="Logout"><input type="submit" name="submit" disabled><div class="errors"></div><a href="/monitor-result.txt" target="_blank">' + (null == (jade_interp = "Monitor last result") ? "" : jade_interp) + "</a><fieldset><legend>" + (null == (jade_interp = "Hosts") ? "" : jade_interp) + '</legend><div style="padding:3px;" class="wrap"><div class="buttons"><span>' + (null == (jade_interp = "Selection:&nbsp;") ? "" : jade_interp) + '</span><button class="all">' + (null == (jade_interp = "All") ? "" : jade_interp) + '</button><button class="invert">' + (null == (jade_interp = "Invert") ? "" : jade_interp) + '</button><button class="reset">' + (null == (jade_interp = "Reset") ? "" : jade_interp) + '</button></div></div><hr><div style="padding:3px;" class="wrap"><div class="buttons"><button disabled class="check">' + (null == (jade_interp = "Recheck") ? "" : jade_interp) + '</button></div></div><hr><div style="padding-top:3px;" class="wrap"><div class="hosts"></div></div></fieldset></div><input type="hidden" name="config"><pre id="editor"></pre></form><script src="/js/view-compiled.js"></script><script src="/plugins/ace-1.2.6/ace.js"></script><script src="/plugins/jquery/jquery-3.1.1.min.js"></script><script src="/js/script.js"></script></body></html>');
        }).call(this, "hostname" in locals_for_with ? locals_for_with.hostname : typeof hostname !== "undefined" ? hostname : undefined, "title" in locals_for_with ? locals_for_with.title : typeof title !== "undefined" ? title : undefined);
        return buf.join("");
    };

    // hosts.jade compiled template
    templatizer["hosts"] = function tmpl_hosts(locals) {
        var buf = [];
        var jade_mixins = {};
        var jade_interp;
        var locals_for_with = locals || {};
        (function(hosts, undefined) {
            (function() {
                var $obj = hosts;
                if ("number" == typeof $obj.length) {
                    for (var $index = 0, $l = $obj.length; $index < $l; $index++) {
                        var host = $obj[$index];
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, false) + jade.attr("disabled", host.self, true, false) + ' checked="checked"/><span>' + (null == (jade_interp = host.key) ? "" : jade_interp) + '</span></label><ul style="margin-top:0;list-style-type:none;padding-left:14px;">');
                        if (host.self) {
                            buf.push('<li><small ip="127.0.0.1" class="address"><input type="radio"' + jade.attr("name", host.key, true, false) + ' disabled="disabled" selected="selected" checked="checked" style="width:1em;vertical-align:middle;"/>' + (null == (jade_interp = "127.0.0.1") ? "" : jade_interp) + "</small>" + (null == (jade_interp = "&nbsp;") ? "" : jade_interp) + '<small style="float:right;margin-right:5px;color:grey;">' + (null == (jade_interp = "local") ? "" : jade_interp) + "</small></li>");
                        } else {
                            (function() {
                                var $obj = host.addresses;
                                if ("number" == typeof $obj.length) {
                                    for (var index = 0, $l = $obj.length; index < $l; index++) {
                                        var item = $obj[index];
                                        buf.push("<li><small" + jade.attr("ip", item.ip, true, false) + jade.attr("port", item.port, true, false) + ' class="address"><input type="radio"' + jade.attr("name", host.key, true, false) + jade.attr("selected", index === 0, true, false) + jade.attr("checked", index === 0, true, false) + ' style="width:1em;vertical-align:middle;"' + jade.attr("value", item.ip + (item.port ? ":" + item.port : ""), true, false) + "/>" + (null == (jade_interp = item.ip + (item.port ? ":" + item.port : "")) ? "" : jade_interp) + "</small>");
                                        if (item.source) {
                                            buf.push((null == (jade_interp = "&nbsp;") ? "" : jade_interp) + '<small style="float:right;margin-right:5px;color:grey;">' + (null == (jade_interp = item.source) ? "" : jade_interp) + "</small>");
                                        }
                                        buf.push("</li>");
                                    }
                                } else {
                                    var $l = 0;
                                    for (var index in $obj) {
                                        $l++;
                                        var item = $obj[index];
                                        buf.push("<li><small" + jade.attr("ip", item.ip, true, false) + jade.attr("port", item.port, true, false) + ' class="address"><input type="radio"' + jade.attr("name", host.key, true, false) + jade.attr("selected", index === 0, true, false) + jade.attr("checked", index === 0, true, false) + ' style="width:1em;vertical-align:middle;"' + jade.attr("value", item.ip + (item.port ? ":" + item.port : ""), true, false) + "/>" + (null == (jade_interp = item.ip + (item.port ? ":" + item.port : "")) ? "" : jade_interp) + "</small>");
                                        if (item.source) {
                                            buf.push((null == (jade_interp = "&nbsp;") ? "" : jade_interp) + '<small style="float:right;margin-right:5px;color:grey;">' + (null == (jade_interp = item.source) ? "" : jade_interp) + "</small>");
                                        }
                                        buf.push("</li>");
                                    }
                                }
                            }).call(this);
                        }
                        buf.push("</ul></div>" + (null == (jade_interp = " ") ? "" : jade_interp));
                    }
                } else {
                    var $l = 0;
                    for (var $index in $obj) {
                        $l++;
                        var host = $obj[$index];
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, false) + jade.attr("disabled", host.self, true, false) + ' checked="checked"/><span>' + (null == (jade_interp = host.key) ? "" : jade_interp) + '</span></label><ul style="margin-top:0;list-style-type:none;padding-left:14px;">');
                        if (host.self) {
                            buf.push('<li><small ip="127.0.0.1" class="address"><input type="radio"' + jade.attr("name", host.key, true, false) + ' disabled="disabled" selected="selected" checked="checked" style="width:1em;vertical-align:middle;"/>' + (null == (jade_interp = "127.0.0.1") ? "" : jade_interp) + "</small>" + (null == (jade_interp = "&nbsp;") ? "" : jade_interp) + '<small style="float:right;margin-right:5px;color:grey;">' + (null == (jade_interp = "local") ? "" : jade_interp) + "</small></li>");
                        } else {
                            (function() {
                                var $obj = host.addresses;
                                if ("number" == typeof $obj.length) {
                                    for (var index = 0, $l = $obj.length; index < $l; index++) {
                                        var item = $obj[index];
                                        buf.push("<li><small" + jade.attr("ip", item.ip, true, false) + jade.attr("port", item.port, true, false) + ' class="address"><input type="radio"' + jade.attr("name", host.key, true, false) + jade.attr("selected", index === 0, true, false) + jade.attr("checked", index === 0, true, false) + ' style="width:1em;vertical-align:middle;"' + jade.attr("value", item.ip + (item.port ? ":" + item.port : ""), true, false) + "/>" + (null == (jade_interp = item.ip + (item.port ? ":" + item.port : "")) ? "" : jade_interp) + "</small>");
                                        if (item.source) {
                                            buf.push((null == (jade_interp = "&nbsp;") ? "" : jade_interp) + '<small style="float:right;margin-right:5px;color:grey;">' + (null == (jade_interp = item.source) ? "" : jade_interp) + "</small>");
                                        }
                                        buf.push("</li>");
                                    }
                                } else {
                                    var $l = 0;
                                    for (var index in $obj) {
                                        $l++;
                                        var item = $obj[index];
                                        buf.push("<li><small" + jade.attr("ip", item.ip, true, false) + jade.attr("port", item.port, true, false) + ' class="address"><input type="radio"' + jade.attr("name", host.key, true, false) + jade.attr("selected", index === 0, true, false) + jade.attr("checked", index === 0, true, false) + ' style="width:1em;vertical-align:middle;"' + jade.attr("value", item.ip + (item.port ? ":" + item.port : ""), true, false) + "/>" + (null == (jade_interp = item.ip + (item.port ? ":" + item.port : "")) ? "" : jade_interp) + "</small>");
                                        if (item.source) {
                                            buf.push((null == (jade_interp = "&nbsp;") ? "" : jade_interp) + '<small style="float:right;margin-right:5px;color:grey;">' + (null == (jade_interp = item.source) ? "" : jade_interp) + "</small>");
                                        }
                                        buf.push("</li>");
                                    }
                                }
                            }).call(this);
                        }
                        buf.push("</ul></div>" + (null == (jade_interp = " ") ? "" : jade_interp));
                    }
                }
            }).call(this);
        }).call(this, "hosts" in locals_for_with ? locals_for_with.hosts : typeof hosts !== "undefined" ? hosts : undefined, "undefined" in locals_for_with ? locals_for_with.undefined : typeof undefined !== "undefined" ? undefined : undefined);
        return buf.join("");
    };

    // layout.jade compiled template
    templatizer["layout"] = function tmpl_layout(locals) {
        var buf = [];
        var jade_mixins = {};
        var jade_interp;
        var locals_for_with = locals || {};
        (function(title) {
            buf.push('<!DOCTYPE html><html><head><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><title>' + jade.escape(null == (jade_interp = title) ? "" : jade_interp) + '</title><link rel="stylesheet" href="/css/style.css"></head><body><script src="/js/view-compiled.js"></script><script src="/plugins/ace-1.2.6/ace.js"></script><script src="/plugins/jquery/jquery-3.1.1.min.js"></script><script src="/js/script.js"></script></body></html>');
        }).call(this, "title" in locals_for_with ? locals_for_with.title : typeof title !== "undefined" ? title : undefined);
        return buf.join("");
    };

    return templatizer;
}));
