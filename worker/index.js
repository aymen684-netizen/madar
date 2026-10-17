import { orbitResponse } from './orbits.js';
import { secure } from '../security/headers.js';
function reply(text, status, headers = {}) {
  return secure(
    new Response(text, { status, headers: { 'Cache-Control': 'no-store', ...headers } }),
  );
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (['/api/word', '/api/word.docx'].includes(url.pathname))
      return reply('Reports are generated and downloaded locally. Upload service removed.', 410);
    if (url.pathname === '/api/orbits') return secure(await orbitResponse(request, env));
    if (url.pathname.startsWith('/api/')) return reply('Not found', 404);
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return reply('Method not allowed', 405, { Allow: 'GET, HEAD' });
    return secure(await env.ASSETS.fetch(request));
  },
};
