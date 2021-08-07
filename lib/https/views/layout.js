const { html } = require('common-tags');

module.exports = {
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
                    <input name="logout" type="submit" value="Logout">
                    <input disabled="" name="submit" type="submit" value="Submit">
                    <input disabled="" name="explain" type="button" value="Explain">
                    <div class="errors"></div>
                    <a href="/monitor-result.txt" target="_blank">Monitor last result</a>
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
    approve: data => module.exports.layoutSimple({
        ...data,
        content: html`
            <form action="/" enctype="application/x-www-form-urlencoded" method="POST">
                <input class="approve-diff-submit" name="submit" type="submit" value="Approve">
                ${Object.entries(data.body).map((x) => `<input name="${x[0]}" type="hidden" value="${(`${x[1]}`).replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/^\s+|\s+$/gm, '').replace(/\n/gm, '')}">`)}
            </form>
            <div class="approve-diff-block">
                <div class="hostname approve-diff-hostname">${data.hostname}</div>
                <pre class="approve-diff-data">${data.changes}</pre>
            </div>
        `,
    }),
};
