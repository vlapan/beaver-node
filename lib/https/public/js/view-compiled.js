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
    var jade=function(){function n(n){return null!=n&&""!==n}function t(e){return(Array.isArray(e)?e.map(t):e&&"object"==typeof e?Object.keys(e).filter(function(n){return e[n]}):[e]).filter(n).join(" ")}function e(n){return i[n]||n}function r(n){var t=String(n).replace(o,e);return t===""+n?n:t}var a={};a.merge=function s(t,e){if(1===arguments.length){for(var r=t[0],a=1;a<t.length;a++)r=s(r,t[a]);return r}var i=t["class"],o=e["class"];(i||o)&&(i=i||[],o=o||[],Array.isArray(i)||(i=[i]),Array.isArray(o)||(o=[o]),t["class"]=i.concat(o).filter(n));for(var f in e)"class"!=f&&(t[f]=e[f]);return t},a.joinClasses=t,a.cls=function(n,e){for(var r=[],i=0;i<n.length;i++)e&&e[i]?r.push(a.escape(t([n[i]]))):r.push(t(n[i]));var o=t(r);return o.length?' class="'+o+'"':""},a.style=function(n){return n&&"object"==typeof n?Object.keys(n).map(function(t){return t+":"+n[t]}).join(";"):n},a.attr=function(n,t,e,r){return"style"===n&&(t=a.style(t)),"boolean"==typeof t||null==t?t?" "+(r?n:n+'="'+n+'"'):"":0==n.indexOf("data")&&"string"!=typeof t?(-1!==JSON.stringify(t).indexOf("&")&&console.warn("Since Jade 2.0.0, ampersands (`&`) in data attributes will be escaped to `&amp;`"),t&&"function"==typeof t.toISOString&&console.warn("Jade will eliminate the double quotes around dates in ISO form after 2.0.0")," "+n+"='"+JSON.stringify(t).replace(/'/g,"&apos;")+"'"):e?(t&&"function"==typeof t.toISOString&&console.warn("Jade will stringify dates in ISO form after 2.0.0")," "+n+'="'+a.escape(t)+'"'):(t&&"function"==typeof t.toISOString&&console.warn("Jade will stringify dates in ISO form after 2.0.0")," "+n+'="'+t+'"')},a.attrs=function(n,e){var r=[],i=Object.keys(n);if(i.length)for(var o=0;o<i.length;++o){var s=i[o],f=n[s];"class"==s?(f=t(f))&&r.push(" "+s+'="'+f+'"'):r.push(a.attr(s,f,!1,e))}return r.join("")};var i={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"},o=/[&<>"]/g;return a.escape=r,a.rethrow=function f(n,t,e,r){if(!(n instanceof Error))throw n;if(!("undefined"==typeof window&&t||r))throw n.message+=" on line "+e,n;try{r=r||require("fs").readFileSync(t,"utf8")}catch(a){f(n,null,e)}var i=3,o=r.split("\n"),s=Math.max(e-i,0),l=Math.min(o.length,e+i),i=o.slice(s,l).map(function(n,t){var r=t+s+1;return(r==e?"  > ":"    ")+r+"| "+n}).join("\n");throw n.path=t,n.message=(t||"Jade")+":"+e+"\n"+i+"\n\n"+n.message,n},a.DebugItem=function(n,t){this.lineno=n,this.filename=t},a}(); 

    var templatizer = {};


    // form.jade compiled template
    templatizer["form"] = function tmpl_form(locals) {
        var buf = [];
        var jade_mixins = {};
        var jade_interp;
        var locals_for_with = locals || {};
        (function(hostname, title) {
            buf.push('<!DOCTYPE html><html><head><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><title>' + jade.escape(null == (jade_interp = title) ? "" : jade_interp) + '</title><link rel="stylesheet" href="/css/style.css"><script src="/js/view-compiled.js"></script><script src="/plugins/jquery/jquery-2.1.4.min.js"></script><script src="/plugins/ace/ace.js"></script><script src="/js/script.js"></script></head><body><form action="/" method="post" enctype="application/x-www-form-urlencoded"><div class="left-panel"><div class="hostname">' + (null == (jade_interp = hostname) ? "" : jade_interp) + '</div><input type="submit" name="logout" value="Logout"><input type="submit" name="submit" disabled><div class="errors"></div><a href="/monitor-result.txt" target="_blank">' + (null == (jade_interp = "Monitor last result") ? "" : jade_interp) + "</a><fieldset><legend>" + (null == (jade_interp = "Hosts") ? "" : jade_interp) + '</legend><div class="buttons"><button class="all">' + (null == (jade_interp = "All") ? "" : jade_interp) + '</button><button class="invert">' + (null == (jade_interp = "Invert") ? "" : jade_interp) + '</button><button class="reset">' + (null == (jade_interp = "Reset") ? "" : jade_interp) + '</button></div><hr><div class="hosts"></div></fieldset></div><input type="hidden" name="config"><pre id="editor"></pre></form></body></html>');
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
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, false) + jade.attr("disabled", host.self, true, false) + ' checked="checked"/><span' + jade.attr("ip", host.wan && host.wan.ip, true, false) + ">" + (null == (jade_interp = host.key) ? "" : jade_interp) + "</span></label></div>" + (null == (jade_interp = " ") ? "" : jade_interp));
                    }
                } else {
                    var $l = 0;
                    for (var $index in $obj) {
                        $l++;
                        var host = $obj[$index];
                        buf.push('<div class="host"><label><input type="checkbox" name="forward"' + jade.attr("value", host.key, true, false) + jade.attr("disabled", host.self, true, false) + ' checked="checked"/><span' + jade.attr("ip", host.wan && host.wan.ip, true, false) + ">" + (null == (jade_interp = host.key) ? "" : jade_interp) + "</span></label></div>" + (null == (jade_interp = " ") ? "" : jade_interp));
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
            buf.push('<!DOCTYPE html><html><head><meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"><title>' + jade.escape(null == (jade_interp = title) ? "" : jade_interp) + '</title><link rel="stylesheet" href="/css/style.css"><script src="/js/view-compiled.js"></script><script src="/plugins/jquery/jquery-2.1.4.min.js"></script><script src="/plugins/ace/ace.js"></script><script src="/js/script.js"></script></head><body></body></html>');
        }).call(this, "title" in locals_for_with ? locals_for_with.title : typeof title !== "undefined" ? title : undefined);
        return buf.join("");
    };

    return templatizer;
}));
