const { html } = require('common-tags');

module.exports = {
    layoutLogout: data => html`
        <!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="content-type" content="text/html; charset=UTF-8"/>
                <meta http-equiv="refresh" content="0; url=/logout.force"/>
                <title>${data.title || data.hostname}</title>
                <style>
                    .bottom {
                        position: absolute;
                        left: 2vw;
                        right: 2vw;
                        bottom: 6vh;
                        display: flex;
                        align-items: end;
                        justify-content: center;
                    }
                </style>
            </head>
            <body>
                <div class="content bottom" style="font-size:8vw;">Forced logged out!<br>Close browser tab!<br>Page always sends 401!</div>
                <script>
                    window.stop();

                    const contentElement = document.body.querySelector('.content');
                    const messageForced = contentElement.innerHTML;
                    const messageTring = 'Trying to logout...';
                    const messageDone = 'Logged out!';

                    contentElement.innerHTML = messageTring;

                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', '/logout.force', false, '', Date.now().toString());
                    const forceLogout = () => {
                        contentElement.innerHTML = messageForced;
                        window.location.href = '/logout.force';
                    };
                    xhr.onerror = forceLogout;
                    xhr.onload = () => {
                        if (xhr.readyState === 4 && xhr.status === 401) {
                            contentElement.innerHTML = messageDone;
                            window.setTimeout(() => {
                                window.location.href = '/';
                            }, 1000);
                        } else {
                            forceLogout();
                        }
                    };
                    window.setTimeout(() => {
                        xhr.send();
                    }, 0);
                </script>
            </body>
        </html>
    `,
    layoutSimple: data => html`
        <!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="content-type" content="text/html; charset=UTF-8"/>
                <title>${data.title || data.hostname}</title>
                <link href="/css/style.css" rel="stylesheet"/>
            </head>
            <body>
                <div class="content">${data.content}</div>
            </body>
        </html>
    `,
    layout: data => html`
        <!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="content-type" content="text/html; charset=UTF-8"/>
                <title>${data.title || data.hostname}</title>
                <link href="/css/style.css" rel="stylesheet"/>
            </head>
            <body>
                <div class="content">${data.content}</div>
                <script src="/plugins/ace-builds/src-min/ace.js"></script>
                <script>
                    var module = { exports : {} };
                </script>
                <script src="/plugins/clean-yaumnrc/index.js"></script>
                <script>
                    window.yaumnrc = module.exports;
                </script>
                <script src="/plugins/clean-yaumnrc/explainer-dhtml.js"></script>
                <script>
                    window.explainer = module.exports;
                </script>
                <script type="module" src="/js/main.mjs"></script>
            </body>
        </html>
    `,
    render: data => module.exports.layout({
        ...data,
        content: html`
            <form class="form-main" action="/approve" enctype="application/x-www-form-urlencoded" method="POST">
                <div class="left-panel">
                    <div class="hostname">${data.hostname}</div>
                    <input name="logout" type="submit" value="Logout" onclick="window.logout(event)">
                    <input disabled="" name="submit" type="submit" value="Submit">
                    <input disabled="" name="explain" type="button" value="Explain">
                    <input name="monitoring" type="button" value="Monitoring">
                    <div class="errors"></div>
                    <fieldset>
                        <legend>Hosts</legend>
                        <div class="wrap" style="padding:3px;">
                            <div class="buttons">
                                <span>Selection:</span>
                                <button class="all">All</button><button class="invert">Invert</button><button class="reset">Reset</button>
                            </div>
                        </div>
                        <hr>
                        <div class="wrap" style="padding:3px;">
                            <div class="buttons">
                                <button class="btn-recheck">Recheck</button>
                            </div>
                        </div>
                        <hr>
                        <div class="wrap" style="padding-top:3px;">
                            <div class="hosts"></div>
                        </div>
                    </fieldset>
                </div>
                <input name="config" type="hidden">
                <pre id="editor"></pre>
            </form>
        `,
    }),
    approve: data => {
        function process(a, k) {
            return a.map((x) => {
                const name = Array.isArray(x) ? x[0] : k;
                const value = Array.isArray(x) ? x[1] : x;
                if (Array.isArray(value)) {
                    return process(value, name);
                }
                return `<input name="${name}" type="hidden" value="${(`${value}`).replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/^\s+|\s+$/gm, '').replace(/\n/gm, '')}">`
            });
        }
        const vars = process(Object.entries(data.body));
        return module.exports.layoutSimple({
            ...data,
            content: html`
                <form class="approve-diff-form" action="/" enctype="application/x-www-form-urlencoded" method="POST">
                    <input class="approve-diff-submit" name="submit" type="submit" value="Approve">
                    ${vars.flat().join('')}
                </form>
                <div class="approve-diff-block">
                    <div class="hostname approve-diff-hostname">${data.hostname}</div>
                    <pre class="approve-diff-data">${data.changes}</pre>
                </div>
            `,
        });
    },
};
