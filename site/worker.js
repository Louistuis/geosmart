// gs.lou15.com: the GeoSmart site and its setup script at the same address.
//   Browser                          -> the product page (static assets)
//   curl -fsSL https://gs.lou15.com | bash   -> install.sh
//   irm https://gs.lou15.com | iex           -> install.ps1
//   .../uninstall                    -> the same scripts in uninstall mode
//   .../install.sh, .../install.ps1  -> the scripts as plain text, for reading
import SH from './scripts/install.sh';
import PS from './scripts/install.ps1';

const HOME = 'gs.lou15.com';
const CLI = /^(curl|wget|libcurl|httpie|xh|aria2|fetch)\b/i;

function script(kind, mode) {
    const body = kind === 'ps1'
        ? PS.replace("$Mode = 'install'", `$Mode = '${mode}'`)
        : SH.replace('local MODE=install', `local MODE=${mode}`);
    return new Response(body, {
        headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=300',
            'x-content-type-options': 'nosniff',
        },
    });
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url);
        if (url.hostname !== HOME && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
            url.hostname = HOME; url.port = '';
            return Response.redirect(url.toString(), 301);
        }
        const ua = req.headers.get('user-agent') || '';
        const ps = /PowerShell/i.test(ua);
        const terminal = ps || CLI.test(ua);
        const p = url.pathname.replace(/\/+$/, '') || '/';

        if (p === '/install.sh') return script('sh', 'install');
        if (p === '/install.ps1') return script('ps1', 'install');
        if (p === '/uninstall.sh') return script('sh', 'uninstall');
        if (p === '/uninstall.ps1') return script('ps1', 'uninstall');
        if (p === '/' || p === '/install' || p === '/uninstall') {
            const mode = p === '/uninstall' ? 'uninstall' : 'install';
            if (terminal) return script(ps ? 'ps1' : 'sh', mode);
            if (p !== '/') return Response.redirect(`https://${HOME}/#setup`, 302);
        }
        return env.ASSETS.fetch(req);
    },
};
