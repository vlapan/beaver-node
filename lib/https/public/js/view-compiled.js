(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof root === 'undefined' || root !== Object(root)) {
        throw new Error('templatizer: window does not exist or is not an object');
    } else {
        root.templatizer = factory();
    }
}(this, function () {
    var jade=function(){function r(r){return null!=r&&""!==r}function n(e){return Array.isArray(e)?e.map(n).filter(r).join(" "):e}var e={};return e.merge=function t(n,e){if(1===arguments.length){for(var a=n[0],s=1;s<n.length;s++)a=t(a,n[s]);return a}var i=n["class"],l=e["class"];(i||l)&&(i=i||[],l=l||[],Array.isArray(i)||(i=[i]),Array.isArray(l)||(l=[l]),n["class"]=i.concat(l).filter(r));for(var o in e)"class"!=o&&(n[o]=e[o]);return n},e.joinClasses=n,e.cls=function(r,t){for(var a=[],s=0;s<r.length;s++)a.push(t&&t[s]?e.escape(n([r[s]])):n(r[s]));var i=n(a);return i.length?' class="'+i+'"':""},e.attr=function(r,n,t,a){return"boolean"==typeof n||null==n?n?" "+(a?r:r+'="'+r+'"'):"":0==r.indexOf("data")&&"string"!=typeof n?" "+r+"='"+JSON.stringify(n).replace(/'/g,"&apos;")+"'":t?" "+r+'="'+e.escape(n)+'"':" "+r+'="'+n+'"'},e.attrs=function(r,t){var a=[],s=Object.keys(r);if(s.length)for(var i=0;i<s.length;++i){var l=s[i],o=r[l];"class"==l?(o=n(o))&&a.push(" "+l+'="'+o+'"'):a.push(e.attr(l,o,!1,t))}return a.join("")},e.escape=function(r){var n=String(r).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");return n===""+r?r:n},e.rethrow=function a(r,n,e,t){if(!(r instanceof Error))throw r;if(!("undefined"==typeof window&&n||t))throw r.message+=" on line "+e,r;try{t=t||require("fs").readFileSync(n,"utf8")}catch(s){a(r,null,e)}var i=3,l=t.split("\n"),o=Math.max(e-i,0),c=Math.min(l.length,e+i),i=l.slice(o,c).map(function(r,n){var t=n+o+1;return(t==e?"  > ":"    ")+t+"| "+r}).join("\n");throw r.path=n,r.message=(n||"Jade")+":"+e+"\n"+i+"\n\n"+r.message,r},e}();

    var templatizer = {};


    // form.jade compiled template
    templatizer["form"] = function tmpl_form(locals) {
        var buf = [];
        var jade_mixins = {};
        var jade_interp;
        var locals_for_with = locals || {};
        (function(title, hostname, hosts) {
            buf.push('<!DOCTYPE html><html><head><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><title>' + jade.escape(null == (jade_interp = title) ? "" : jade_interp) + '</title><link rel="stylesheet" href="/css/style.css"><script src="/plugins/jquery/jquery-2.1.1.min.js"></script><script src="/plugins/ace/ace.js"></script><script src="/js/script.js"></script></head><body><form action="/" method="post" enctype="application/x-www-form-urlencoded"><div class="left-panel"><div class="hostname">' + (null == (jade_interp = hostname) ? "" : jade_interp) + '</div><input type="submit" name="logout" value="Logout"><input type="submit" name="submit" disabled><div class="errors"></div><fieldset><legend>Hosts</legend><div class="buttons"><button class="all">All</button><button class="invert">Invert</button><button class="reset">Reset</button></div><hr><div class="hosts">');
            (function() {
                var $obj = hosts;
                if ("number" == typeof $obj.length) {
                    for (var $index = 0, $l = $obj.length; $index < $l; $index++) {
                        var host = $obj[$index];
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, true) + jade.attr("disabled", host.self, true, true) + " checked><span" + jade.attr("style", host.self && "color:#0c0;", true, true) + ">" + (null == (jade_interp = host.key) ? "" : jade_interp) + "</span></label></div> ");
                    }
                } else {
                    var $l = 0;
                    for (var $index in $obj) {
                        $l++;
                        var host = $obj[$index];
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, true) + jade.attr("disabled", host.self, true, true) + " checked><span" + jade.attr("style", host.self && "color:#0c0;", true, true) + ">" + (null == (jade_interp = host.key) ? "" : jade_interp) + "</span></label></div> ");
                    }
                }
            }).call(this);
            buf.push('</div></fieldset></div><input type="hidden" name="config"><pre id="editor"></pre></form></body></html>');
        }).call(this, "title" in locals_for_with ? locals_for_with.title : typeof title !== "undefined" ? title : undefined, "hostname" in locals_for_with ? locals_for_with.hostname : typeof hostname !== "undefined" ? hostname : undefined, "hosts" in locals_for_with ? locals_for_with.hosts : typeof hosts !== "undefined" ? hosts : undefined);
        return buf.join("");
    };

    // hosts.jade compiled template
    templatizer["hosts"] = function tmpl_hosts(locals) {
        var buf = [];
        var jade_mixins = {};
        var jade_interp;
        var locals_for_with = locals || {};
        (function(hosts) {
            (function() {
                var $obj = hosts;
                if ("number" == typeof $obj.length) {
                    for (var $index = 0, $l = $obj.length; $index < $l; $index++) {
                        var host = $obj[$index];
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, false) + jade.attr("disabled", host.self, true, false) + ' checked="checked"/><span' + jade.attr("style", host.self && "color:#0c0;", true, false) + ">" + (null == (jade_interp = host.key) ? "" : jade_interp) + "</span></label></div> ");
                    }
                } else {
                    var $l = 0;
                    for (var $index in $obj) {
                        $l++;
                        var host = $obj[$index];
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, false) + jade.attr("disabled", host.self, true, false) + ' checked="checked"/><span' + jade.attr("style", host.self && "color:#0c0;", true, false) + ">" + (null == (jade_interp = host.key) ? "" : jade_interp) + "</span></label></div> ");
                    }
                }
            }).call(this);
        }).call(this, "hosts" in locals_for_with ? locals_for_with.hosts : typeof hosts !== "undefined" ? hosts : undefined);
        return buf.join("");
    };

    // layout.jade compiled template
    templatizer["layout"] = function tmpl_layout(locals) {
        var buf = [];
        var jade_mixins = {};
        var jade_interp;
        var locals_for_with = locals || {};
        (function(title) {
            buf.push('<!DOCTYPE html><html><head><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><title>' + jade.escape(null == (jade_interp = title) ? "" : jade_interp) + '</title><link rel="stylesheet" href="/css/style.css"><script src="/plugins/jquery/jquery-2.1.1.min.js"></script><script src="/plugins/ace/ace.js"></script><script src="/js/script.js"></script></head><body></body></html>');
        }).call(this, "title" in locals_for_with ? locals_for_with.title : typeof title !== "undefined" ? title : undefined);
        return buf.join("");
    };

    return templatizer;
}));