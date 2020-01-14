const { html } = require('common-tags');

module.exports = {
    layout: data => html`
        <!DOCTYPE html>
        <html>
            <head>
                <title>${data.title}</title>
                <link href="/css/style.css" rel="stylesheet"/>
            </head>
            <body>
                <div class="content">${data.content}</div>
                <script src="/js/view-compiled.js"></script>
                <script src="/plugins/ace-1.4.5/ace.js"></script>
                <script>
                    var module = { exports : {} };
                </script>
                <script src="/clean-yaumnrc/index.js"></script>
                <script>
                    window.yaumnrc = module.exports;
                </script>
                <script src="/clean-yaumnrc/explainer-dhtml.js"></script>
                <script>
                    window.explainer = module.exports;
                </script>
                <script src="/js/script.js"></script>
            </body>
        </html>
    `,
    render: data => module.exports.layout({
        ...data,
        content: html`
            <form action="/" enctype="application/x-www-form-urlencoded" method="POST">
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
        `
    }),
};