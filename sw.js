/*
 * Service Worker: responde a ".../evento.ics?t=...&s=..." gerando o arquivo de
 * calendário na hora, com o tipo "text/calendar". Assim o iPhone recebe um .ics
 * "de verdade" via https e mostra a tela "Adicionar ao Calendário".
 */
importScripts('calendario.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (!url.pathname.endsWith('/evento.ics')) return;

  const ev = self.Calendario.lerLinkCompartilhavel(url.search);
  if (!ev) {
    e.respondWith(new Response('Evento inválido', { status: 400 }));
    return;
  }
  e.respondWith(new Response(self.Calendario.ics(ev), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="' + self.Calendario.nomeArquivo(ev) + '"',
      'Cache-Control': 'no-store'
    }
  }));
});
