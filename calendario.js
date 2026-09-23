/*
 * Geração de links e arquivos de calendário. Usado pela extensão e pela página
 * pública (pagina/index.html). Exposto como window.Calendario.
 *
 * Evento: { titulo, inicio: Date, fim: Date, link, local, descricao, lembrete (minutos ou null) }
 */
(function (global) {
  const pad = n => String(n).padStart(2, '0');

  // 20260925T220000Z
  function utcCompacto(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function deUtcCompacto(s) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z$/.exec(s || '');
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  }

  function descricaoCompleta(ev) {
    const partes = [];
    if (ev.link) partes.push('Link: ' + ev.link);
    if (ev.descricao) partes.push(ev.descricao);
    return partes.join('\n\n');
  }

  function googleUrl(ev) {
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.titulo || 'Evento',
      dates: utcCompacto(ev.inicio) + '/' + utcCompacto(ev.fim),
      details: descricaoCompleta(ev).slice(0, 1500)
    });
    const local = ev.local || ev.link;
    if (local) p.set('location', local);
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }

  function outlookUrl(ev) {
    const p = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: ev.titulo || 'Evento',
      startdt: ev.inicio.toISOString(),
      enddt: ev.fim.toISOString(),
      body: descricaoCompleta(ev).slice(0, 1500)
    });
    const local = ev.local || ev.link;
    if (local) p.set('location', local);
    return 'https://outlook.live.com/calendar/0/deeplink/compose?' + p.toString();
  }

  function escaparIcs(t) {
    return String(t || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // Linhas de .ics devem ter no máximo 75 bytes; continuações começam com espaço.
  function dobrar(linha) {
    const bytes = new TextEncoder();
    if (bytes.encode(linha).length <= 75) return linha;
    const saida = [];
    let atual = '';
    for (const ch of linha) {
      const limite = saida.length ? 74 : 75;
      if (bytes.encode(atual + ch).length > limite) {
        saida.push(atual);
        atual = ch;
      } else {
        atual += ch;
      }
    }
    saida.push(atual);
    return saida.join('\r\n ');
  }

  function ics(ev) {
    const uid = utcCompacto(ev.inicio) + '-' + Math.random().toString(36).slice(2, 10) + '@evento-no-zap';
    const linhas = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Evento no Zap//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + utcCompacto(new Date()),
      'DTSTART:' + utcCompacto(ev.inicio),
      'DTEND:' + utcCompacto(ev.fim),
      'SUMMARY:' + escaparIcs(ev.titulo || 'Evento')
    ];
    const desc = descricaoCompleta(ev);
    if (desc) linhas.push('DESCRIPTION:' + escaparIcs(desc));
    const local = ev.local || ev.link;
    if (local) linhas.push('LOCATION:' + escaparIcs(local));
    if (ev.link) linhas.push('URL:' + ev.link);
    if (ev.lembrete != null && ev.lembrete !== '' && !isNaN(ev.lembrete)) {
      linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escaparIcs(ev.titulo || 'Evento'),
        'TRIGGER:-PT' + Number(ev.lembrete) + 'M', 'END:VALARM');
    }
    linhas.push('END:VEVENT', 'END:VCALENDAR');
    return linhas.map(dobrar).join('\r\n') + '\r\n';
  }

  // Conteúdo do QR Code (mesmo formato do QR Code Monkey): a câmera do celular
  // reconhece e oferece "Adicionar ao Calendário" sem precisar de internet.
  function qrTexto(ev) {
    const linhas = [
      'BEGIN:VEVENT',
      'SUMMARY:' + escaparIcs(ev.titulo || 'Evento'),
      'DTSTART:' + utcCompacto(ev.inicio),
      'DTEND:' + utcCompacto(ev.fim)
    ];
    const local = ev.local || ev.link;
    if (local) linhas.push('LOCATION:' + escaparIcs(local));
    if (ev.link) linhas.push('DESCRIPTION:' + escaparIcs('Link: ' + ev.link));
    linhas.push('END:VEVENT');
    return linhas.join('\n');
  }

  // Gera o QR como <svg> (usa a biblioteca qrcode.js carregada antes deste arquivo).
  function qrSvg(texto, tamanho = 220) {
    global.qrcode.stringToBytes = global.qrcode.stringToBytesFuncs['UTF-8']; // acentos
    const qr = global.qrcode(0, 'M');
    qr.addData(texto, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const margem = 2;
    const total = n + margem * 2;
    let caminho = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.isDark(y, x)) caminho += `M${x + margem},${y + margem}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${tamanho}" height="${tamanho}" shape-rendering="crispEdges" role="img" aria-label="QR Code do evento"><rect width="100%" height="100%" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
  }

  // Converte o SVG do QR em PNG (para copiar/colar a imagem no WhatsApp).
  function qrPng(texto, tamanho = 600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = tamanho;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, tamanho, tamanho);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
      };
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(texto, tamanho));
    });
  }

  function nomeArquivo(ev) {
    const base = (ev.titulo || 'evento')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50);
    return (base || 'evento') + '.ics';
  }

  // Link da página pública: os dados vão no "#", então não passam por nenhum servidor.
  function linkCompartilhavel(baseUrl, ev) {
    const p = new URLSearchParams();
    p.set('t', ev.titulo || 'Evento');
    p.set('s', utcCompacto(ev.inicio));
    p.set('e', utcCompacto(ev.fim));
    if (ev.link) p.set('u', ev.link);
    if (ev.local && ev.local !== ev.link) p.set('l', ev.local);
    if (ev.descricao) p.set('d', ev.descricao.slice(0, 400));
    if (ev.lembrete != null && ev.lembrete !== '') p.set('a', String(ev.lembrete));
    return baseUrl.replace(/#.*$/, '') + '#' + p.toString();
  }

  function lerLinkCompartilhavel(hashOuQuery) {
    const p = new URLSearchParams(String(hashOuQuery || '').replace(/^[#?]/, ''));
    const inicio = deUtcCompacto(p.get('s'));
    if (!inicio) return null;
    const fim = deUtcCompacto(p.get('e')) || new Date(inicio.getTime() + 3600e3);
    const a = p.get('a');
    return {
      titulo: p.get('t') || 'Evento',
      inicio, fim,
      link: p.get('u') || '',
      local: p.get('l') || '',
      descricao: p.get('d') || '',
      lembrete: a === null || a === '' ? null : Number(a)
    };
  }

  function formatarQuando(ev, locale = 'pt-BR') {
    const diaSemana = ev.inicio.toLocaleDateString(locale, { weekday: 'long' });
    const data = ev.inicio.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = d => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const mesmoDia = ev.inicio.toDateString() === ev.fim.toDateString();
    const cap = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
    return mesmoDia
      ? `${cap}, ${data} · ${hora(ev.inicio)}–${hora(ev.fim)}`
      : `${cap}, ${data} ${hora(ev.inicio)} até ${ev.fim.toLocaleDateString(locale)} ${hora(ev.fim)}`;
  }

  function mensagemWhatsApp(ev, linkAgenda, { incluirDescricao = false } = {}) {
    const linhas = [`📅 *${ev.titulo || 'Evento'}*`, `🗓️ ${formatarQuando(ev)}`];
    if (ev.local && ev.local !== ev.link) linhas.push(`📍 ${ev.local}`);
    if (ev.link) linhas.push(`🔗 ${ev.link}`);
    if (incluirDescricao && ev.descricao) linhas.push('', ev.descricao.slice(0, 600));
    linhas.push('', `➕ *Salvar na agenda:* ${linkAgenda}`);
    return linhas.join('\n');
  }

  global.Calendario = {
    googleUrl, outlookUrl, ics, nomeArquivo, linkCompartilhavel, lerLinkCompartilhavel,
    formatarQuando, mensagemWhatsApp, utcCompacto, qrTexto, qrSvg, qrPng
  };
})(typeof window !== 'undefined' ? window : globalThis);
