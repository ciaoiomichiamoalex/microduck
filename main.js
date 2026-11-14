// Microduck: la finestra nativa. Trasparente, senza bordi, sempre sopra le altre, trascinabile fra gli schermi.
// Le parti trasparenti lasciano passare il mouse alle finestre sotto. Lo stato lo legge stato.js, qui sul PC.
// Vicino all'orologio c'è la sua icona: clic per nasconderlo o farlo tornare, tasto destro per il menu.
// Viene dal Lume da scrivania (skill compagno-da-scrivania): stesse misure e stesse lezioni, senza la VM.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stato } = require('./stato');

const MARGINE = 12;
// Le quattro grandezze di Microduck, in pixel di larghezza; è alto una volta e mezza.
const GRANDEZZE = [['Piccolo', 80], ['Normale', 110], ['Grande', 140], ['Molto grande', 180]];
const LIVELLI = [['tante', 'Tante'], ['poche', 'Poche'], ['niente', 'Niente']];
const ICONA = path.join(__dirname, 'microduck.ico');
const ATTIVITA = 'Microduck';
const DA_SOLO = process.argv.includes('--da-solo');

let finestra = null;
let tray = null;
let partenza = null;
let modo = 'mini';
let latoAttuale = 'destra';
let larghezza = 110;
let conta = { lav: 0, fer: 0 };
let motivoUscita = 'non detto';

// Il diario: un compagno sparito senza diario non si spiega (Lume, 28 ott: sparito dopo un'ibernazione).
function diario(evento, dettagli) {
  try {
    const f = path.join(app.getPath('userData'), 'diario.log');
    try { if (fs.statSync(f).size > 512 * 1024) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').slice(-256 * 1024)); } catch { /* non c'è ancora */ }
    fs.appendFileSync(f, new Date().toISOString() + '\t' + evento + (dettagli ? '\t' + dettagli : '') + '\n');
  } catch { /* il diario è un aiuto: non deve fermare Microduck */ }
}

// Posizioni per schermo, grandezza, chiacchiere: un file solo accanto al diario.
function filePref() { return path.join(app.getPath('userData'), 'preferenze.json'); }
function leggiPref() { try { return JSON.parse(fs.readFileSync(filePref(), 'utf8')); } catch { return {}; } }
function scriviPref(cambi) { try { fs.writeFileSync(filePref(), JSON.stringify({ ...leggiPref(), ...cambi })); } catch { /* è una comodità */ } }

// L'attività di Windows che lo riaccende all'accesso, al risveglio e allo sblocco (la crea installa.ps1).
let riaccendi = null; // null: l'attività non c'è, e nel menu resta "Parti con Windows"
function powershell(comando, fatto) {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], { windowsHide: true, timeout: 15000 },
    (err, out) => fatto(err, String(out || '').trim()));
}
function leggiRiaccendi(poi) {
  powershell(`(Get-ScheduledTask -TaskName '${ATTIVITA}' -ErrorAction Stop).State`, (err, s) => {
    riaccendi = err || !s ? null : s !== 'Disabled';
    if (poi) poi();
    aggiornaTray();
  });
}
function cambiaRiaccendi(si) {
  powershell(`${si ? 'Enable' : 'Disable'}-ScheduledTask -TaskName '${ATTIVITA}' -ErrorAction Stop | Out-Null`, (err) => {
    diario(si ? 'riaccensione accesa' : 'riaccensione spenta', err ? 'non riuscito: ' + String(err.message).split('\n')[0] : '');
    leggiRiaccendi();
  });
}
function accessoWindows(si) {
  const opzioni = { path: process.execPath, args: [app.getAppPath()] };
  if (si === undefined) return app.getLoginItemSettings(opzioni).openAtLogin;
  app.setLoginItemSettings({ ...opzioni, openAtLogin: !!si });
  return !!si;
}

const scala = () => larghezza / 110;
const duckW = () => Math.round(larghezza);
const duckH = () => Math.round(larghezza * 1.5);

// La finestra è grande quanto serve e non di più: Windows ridisegna tutta una finestra trasparente a ogni
// fotogramma (Lume, 15 ott: a 720×900 e 60 fps il portatile rallentava). A riposo Microduck e la colonnina;
// per la nuvoletta si allarga dalla parte opposta a lui.
function dimensioni(m) {
  if (m === 'nuvola') return { w: duckW() + 2 * MARGINE + 300, h: Math.max(duckH() + 2 * MARGINE, 230) };
  const statistiche = leggiPref().colonnina !== false ? Math.round(185 * scala()) : 0;
  return { w: duckW() + 2 * MARGINE + statistiche, h: duckH() + 2 * MARGINE };
}

// Statistiche accanto a lui, o solo Microduck (14 nov): senza colonnina la finestra a riposo è grande quanto lui.
function cambiaColonnina(si) {
  scriviPref({ colonnina: !!si });
  if (finestra) finestra.webContents.send('colonnina', !!si);
  if (modo === 'mini') { const d = duck(); const { w, h } = dimensioni('mini'); metti(bordiPer(d.x, d.y, w, h)); }
  sistema();
  aggiornaTray();
}

// Dove sta Microduck sullo schermo: dentro la finestra è in basso a destra, o in basso a sinistra.
function duck(b = finestra.getBounds()) {
  const x = latoAttuale === 'sinistra' ? b.x + MARGINE : b.x + b.width - MARGINE - duckW();
  const y = b.y + b.height - MARGINE - duckH();
  return { x, y, centro: { x: Math.round(x + duckW() / 2), y: Math.round(y + duckH() / 2) } };
}
function bordiPer(dx, dy, w, h) {
  const x = latoAttuale === 'sinistra' ? dx - MARGINE : dx + duckW() + MARGINE - w;
  return { x: Math.round(x), y: Math.round(dy + duckH() + MARGINE - h), width: Math.round(w), height: Math.round(h) };
}
function metti(bordi) { finestra.setResizable(true); finestra.setBounds(bordi); finestra.setResizable(false); }

function salvaPosizione() {
  const d = duck();
  const pos = leggiPref().posizioni || {};
  const qui = { x: d.x, y: d.y, lato: latoAttuale };
  pos[screen.getDisplayNearestPoint(d.centro).id] = qui;
  scriviPref({ posizioni: pos, ultima: qui });
}

function avvisa() {
  if (!finestra) return;
  finestra.webContents.send('lato', latoAttuale);
  finestra.webContents.send('scala', scala());
}

// Sulla metà sinistra di uno schermo colonnina e nuvoletta vanno a destra. Si sposta la finestra, non lui.
function decidiLato() {
  const b = finestra.getBounds();
  const d = duck(b);
  const wa = screen.getDisplayNearestPoint(d.centro).workArea;
  const nuovo = d.centro.x < wa.x + wa.width / 2 ? 'sinistra' : 'destra';
  if (nuovo === latoAttuale) return;
  latoAttuale = nuovo;
  metti(bordiPer(d.x, d.y, b.width, b.height));
}

// Sempre tutto dentro lo schermo, fuori dalla barra delle applicazioni; vicino a un bordo ci si appoggia.
function aggancia() {
  const b = finestra.getBounds();
  const d = duck(b);
  const wa = screen.getDisplayNearestPoint(d.centro).workArea;
  const minX = wa.x + 6, maxX = wa.x + wa.width - 6 - duckW();
  const minY = wa.y + 6, maxY = wa.y + wa.height - 6 - duckH();
  let nx = Math.min(Math.max(d.x, minX), maxX), ny = Math.min(Math.max(d.y, minY), maxY);
  if (nx - minX < 34) nx = minX; else if (maxX - nx < 34) nx = maxX;
  if (ny - minY < 34) ny = minY; else if (maxY - ny < 34) ny = maxY;
  finestra.setPosition(Math.round(b.x + nx - d.x), Math.round(b.y + ny - d.y));
}

function sistema() { decidiLato(); aggancia(); avvisa(); salvaPosizione(); }

// All'avvio: dove l'avevi lasciato, su qualunque schermo, se quello schermo c'è ancora (14 nov: prima cercava
// solo la posizione del principale, e da un monitor secondario tornava sul principale). Se quello schermo non
// c'è più, l'ultima posizione sul principale; se no l'angolo in basso a destra.
function posizioneIniziale() {
  const primario = screen.getPrimaryDisplay();
  const p = leggiPref();
  for (const s of [p.ultima, (p.posizioni || {})[primario.id]]) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    const c = { x: s.x + duckW() / 2, y: s.y + duckH() / 2 };
    if (screen.getAllDisplays().some((d) => c.x >= d.workArea.x && c.x <= d.workArea.x + d.workArea.width && c.y >= d.workArea.y && c.y <= d.workArea.y + d.workArea.height)) {
      latoAttuale = s.lato === 'sinistra' ? 'sinistra' : 'destra';
      return { x: s.x, y: s.y };
    }
  }
  latoAttuale = 'destra';
  const wa = primario.workArea;
  return { x: wa.x + wa.width - 6 - duckW(), y: wa.y + wa.height - 6 - duckH() };
}

function cambiaModo(m) {
  if (!finestra || !['mini', 'nuvola'].includes(m) || partenza || m === modo) return;
  modo = m;
  const d = duck();
  const { w, h } = dimensioni(m);
  metti(bordiPer(d.x, d.y, w, h));
  avvisa();
}

// Cambia grandezza tenendo fermo l'angolo in basso verso il bordo.
function cambiaGrandezza(px) {
  if (!finestra || px === larghezza) return;
  const d = duck();
  const angoloX = latoAttuale === 'sinistra' ? d.x : d.x + duckW();
  const fondoY = d.y + duckH();
  larghezza = px;
  const { w, h } = dimensioni(modo);
  metti(bordiPer(latoAttuale === 'sinistra' ? angoloX : angoloX - duckW(), fondoY - duckH(), w, h));
  scriviPref({ grandezza: larghezza });
  sistema();
  aggiornaTray();
}
function passoGrandezza(verso) {
  const i = GRANDEZZE.findIndex(([, px]) => px === larghezza);
  const j = Math.min(GRANDEZZE.length - 1, Math.max(0, (i < 0 ? 1 : i) + (verso > 0 ? 1 : -1)));
  cambiaGrandezza(GRANDEZZE[j][1]);
}

// Le chiacchiere stanno nel menu dell'icona (non c'è un pannello): la pagina riceve livello e silenzio.
function chiacchiere() { const p = leggiPref(); return { livello: p.chiacchiere || 'tante', zittoFino: p.zittoFino || 0 }; }
function mandaChiacchiere() { if (finestra) finestra.webContents.send('chiacchiere', chiacchiere()); aggiornaTray(); }

function mostra() { if (finestra && !finestra.isVisible()) { finestra.showInactive(); avvisa(); } aggiornaTray(); }
function nascondi() { if (finestra) finestra.hide(); aggiornaTray(); }

function menu() {
  const visibile = finestra.isVisible();
  const c = chiacchiere();
  const zitto = Date.now() < c.zittoFino;
  return Menu.buildFromTemplate([
    { label: 'Microduck ' + require('./package.json').version, enabled: false },
    { type: 'separator' },
    { label: visibile ? 'Nascondi Microduck' : 'Mostra Microduck', click: () => (visibile ? nascondi() : mostra()) },
    { label: 'Grandezza', submenu: GRANDEZZE.map(([nome, px]) => ({ label: nome, type: 'radio', checked: px === larghezza, click: () => cambiaGrandezza(px) })) },
    { label: 'Statistiche accanto a lui', type: 'checkbox', checked: leggiPref().colonnina !== false, click: (v) => cambiaColonnina(v.checked) },
    { label: 'Chiacchiere', submenu: LIVELLI.map(([k, nome]) => ({ label: nome, type: 'radio', checked: k === c.livello, click: () => { scriviPref({ chiacchiere: k }); mandaChiacchiere(); } })) },
    { label: zitto ? 'Fallo parlare di nuovo' : "Zitto per un'ora", click: () => { scriviPref({ zittoFino: zitto ? 0 : Date.now() + 3600 * 1000 }); mandaChiacchiere(); } },
    { type: 'separator' },
    { label: 'Ricarica', click: () => finestra.webContents.reload() },
    riaccendi === null
      ? { label: 'Parti con Windows', type: 'checkbox', checked: accessoWindows(), click: (v) => { accessoWindows(v.checked); aggiornaTray(); } }
      : { label: 'Riaccendi da solo', type: 'checkbox', checked: riaccendi, click: (v) => cambiaRiaccendi(v.checked) },
    { type: 'separator' },
    { label: 'Spegni Microduck', click: () => { motivoUscita = 'dal menu'; app.quit(); } },
  ]);
}

function aggiornaTray() {
  if (!tray || !finestra) return;
  tray.setToolTip(`Microduck · ${conta.lav} in corso, ${conta.fer} ${conta.fer === 1 ? 'fermo' : 'fermi'}`);
  tray.setContextMenu(menu());
}

function crea() {
  const p = leggiPref();
  if (GRANDEZZE.some(([, px]) => px === p.grandezza)) larghezza = p.grandezza;
  const pos = posizioneIniziale();
  finestra = new BrowserWindow({
    x: 0, y: 0, width: 300, height: 200,
    transparent: true, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    title: 'Microduck', icon: ICONA,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  const { w, h } = dimensioni('mini');
  metti(bordiPer(pos.x, pos.y, w, h));
  finestra.setAlwaysOnTop(true, 'floating');
  finestra.setVisibleOnAllWorkspaces(true);
  finestra.setIgnoreMouseEvents(true, { forward: true });
  finestra.loadFile(path.join(__dirname, 'index.html'));
  finestra.once('ready-to-show', () => { finestra.showInactive(); sistema(); });
  finestra.webContents.on('did-finish-load', () => { finestra.webContents.setZoomFactor(1); avvisa(); mandaChiacchiere(); finestra.webContents.send('colonnina', leggiPref().colonnina !== false); });
  finestra.webContents.on('zoom-changed', () => finestra.webContents.setZoomFactor(1));
  finestra.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  finestra.webContents.on('will-navigate', (e) => e.preventDefault());
  finestra.on('show', aggiornaTray);
  finestra.on('hide', aggiornaTray);
  // Se la pagina muore si ricarica, al massimo cinque volte in dieci minuti, per non entrare in un ciclo.
  let ricariche = [];
  finestra.webContents.on('render-process-gone', (_e, d) => {
    diario('pagina persa', `${d.reason} codice ${d.exitCode}`);
    const ora = Date.now();
    ricariche = ricariche.filter((t) => ora - t < 600000);
    if (d.reason === 'clean-exit' || ricariche.length >= 5) return;
    ricariche.push(ora);
    setTimeout(() => { if (finestra && !finestra.isDestroyed()) finestra.webContents.reload(); }, 2000);
  });
  finestra.on('session-end', () => diario('fine della sessione di Windows'));

  tray = new Tray(fs.existsSync(ICONA) ? nativeImage.createFromPath(ICONA) : nativeImage.createEmpty());
  tray.on('click', () => (finestra.isVisible() ? nascondi() : mostra()));
  aggiornaTray();
}

ipcMain.handle('stato', () => stato());
ipcMain.on('mouse', (_e, dentro) => { if (finestra) finestra.setIgnoreMouseEvents(!dentro, { forward: true }); });
// Il trascinamento lo guida la pagina: a ogni movimento manda di quanto spostarsi dal punto di partenza.
// Se il rilascio si perde, la finestra resta dov'è (Lume: la prima versione inseguiva il cursore).
ipcMain.on('trascina-inizio', () => { if (finestra) partenza = finestra.getBounds(); });
ipcMain.on('sposta', (_e, dx, dy) => {
  if (!finestra || !partenza || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  finestra.setPosition(Math.round(partenza.x + dx), Math.round(partenza.y + dy));
});
ipcMain.on('trascina-fine', () => { if (finestra && partenza) { partenza = null; sistema(); } });
ipcMain.on('modo', (_e, m) => cambiaModo(String(m)));
ipcMain.on('grandezza', (_e, verso) => passoGrandezza(Number(verso) || 0));
ipcMain.on('menu', () => { if (tray && finestra) menu().popup({ window: finestra }); });
ipcMain.on('conta', (_e, c) => {
  const nuovo = { lav: Number(c && c.lav) || 0, fer: Number(c && c.fer) || 0 };
  if (nuovo.lav === conta.lav && nuovo.fer === conta.fer) return;
  conta = nuovo;
  aggiornaTray();
});

process.on('uncaughtException', (e) => diario('errore', String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')));
app.on('child-process-gone', (_e, d) => diario('processo perso', `${d.type} ${d.reason} codice ${d.exitCode}${d.name ? ' ' + d.name : ''}`));
app.on('will-quit', () => { if (motivoUscita) diario('chiusura', motivoUscita); });

if (!app.requestSingleInstanceLock({ daSolo: DA_SOLO })) {
  diario('doppione', DA_SOLO ? "l'attività di Windows l'ha trovato acceso" : 'era già acceso');
  motivoUscita = null;
  app.quit();
} else {
  // Rilanciato mentre gira: dall'icona sul desktop torna visibile; dall'attività di Windows non cambia niente.
  app.on('second-instance', (_e, argv, _cwd, dati) => {
    if ((dati && dati.daSolo) || (Array.isArray(argv) && argv.includes('--da-solo'))) return;
    mostra();
  });
  app.whenReady().then(() => {
    diario('avvio', `${require('./package.json').version} pid ${process.pid}${DA_SOLO ? ", dall'attività di Windows" : ''}`);
    crea();
    leggiRiaccendi(() => {
      if (riaccendi !== null && accessoWindows()) { accessoWindows(false); diario('avvio dal registro tolto', "c'è l'attività"); }
    });
    // Staccando o riattaccando uno schermo: se Microduck è finito fuori, torna nell'angolo.
    const rimetti = () => {
      const c = duck().centro;
      const visibile = screen.getAllDisplays().some((d) => c.x >= d.bounds.x && c.x <= d.bounds.x + d.bounds.width && c.y >= d.bounds.y && c.y <= d.bounds.y + d.bounds.height);
      if (!visibile) { const p = posizioneIniziale(); const { w, h } = dimensioni(modo); metti(bordiPer(p.x, p.y, w, h)); }
      sistema();
    };
    // Il muso segue il puntatore anche fuori dalla finestra (14 nov): la finestra è piccola e alla pagina i
    // movimenti del mouse arrivano solo quando ci passa sopra. 12 volte al secondo, solo se il cursore si è mosso.
    let cursorePrima = null;
    setInterval(() => {
      if (!finestra || !finestra.isVisible()) return;
      const p = screen.getCursorScreenPoint();
      if (cursorePrima && p.x === cursorePrima.x && p.y === cursorePrima.y) return;
      cursorePrima = p;
      const d = duck();
      finestra.webContents.send('cursore', { dx: p.x - d.centro.x, dy: p.y - (d.y + duckH() * 0.45) });
    }, 83);
    screen.on('display-removed', rimetti);
    screen.on('display-added', rimetti);
    screen.on('display-metrics-changed', rimetti);
    powerMonitor.on('suspend', () => diario('sospensione'));
    powerMonitor.on('resume', () => diario('risveglio'));
  });
}
app.on('window-all-closed', () => { if (motivoUscita === 'non detto') motivoUscita = 'finestra chiusa'; app.quit(); });
