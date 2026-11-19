// Mede Web Vitals no servidor LOCAL com perfil de celular (390x844, CPU 4x mais lenta, rede 4G ~ 9 Mbps / 60 ms).
// Rodado pelo Playwright (MCP browser_run_code_unsafe com filename). Cada página: 3 cargas frias, mediana.
async (page) => {
  const BASE = 'http://localhost:3100';
  const PAGINAS = ['/', '/cardapio', '/contato', '/entregador', '/admin/login', '/politica-de-privacidade'];
  const ctx = page.context();
  await page.setViewportSize({ width: 390, height: 844 });
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const out = {};
  for (const p of PAGINAS) {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const pg = await ctx.newPage();
      await pg.setViewportSize({ width: 390, height: 844 });
      const cdp = await ctx.newCDPSession(pg);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await pg.addInitScript(() => {
        window.__v = { lcp: 0, cls: 0, inp: 0 };
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__v.inp = Math.max(window.__v.inp, e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      });
      await pg.goto(BASE + p, { waitUntil: 'load' });
      await pg.waitForTimeout(2500);
      // interação para INP: toque no primeiro botão/link visível que não navega
      await pg.mouse.click(195, 400).catch(() => {});
      await pg.waitForTimeout(800);
      const r = await pg.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource');
        const kb = f => Math.round(res.filter(f).reduce((s, x) => s + (x.transferSize || 0), 0) / 1024);
        return {
          ttfb: Math.round(n.responseStart), fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
          lcp: Math.round(window.__v.lcp), cls: +window.__v.cls.toFixed(3), inp: Math.round(window.__v.inp),
          jsKB: kb(x => x.name.endsWith('.js')), totalKB: Math.round((n.transferSize || 0) / 1024) + kb(() => true),
          reqs: res.length, realtime: res.some(x => /realtime|30ke_l6thlbt9/.test(x.name)),
        };
      });
      runs.push(r);
      await pg.close();
    }
    out[p] = Object.fromEntries(Object.keys(runs[0]).map(k => [k, typeof runs[0][k] === 'boolean' ? runs[0][k] : med(runs.map(r => r[k]))]));
  }
  return out;
}
