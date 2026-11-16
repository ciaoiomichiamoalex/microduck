// Il ponte fra la pagina e la finestra: la pagina non vede il file system, solo queste funzioni.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('finestraNativa', {
  stato: () => ipcRenderer.invoke('stato'),
  mouse: (dentro) => ipcRenderer.send('mouse', !!dentro),
  trascinaInizio: () => ipcRenderer.send('trascina-inizio'),
  sposta: (dx, dy) => ipcRenderer.send('sposta', Number(dx), Number(dy)),
  trascinaFine: () => ipcRenderer.send('trascina-fine'),
  modo: (m) => ipcRenderer.send('modo', String(m)),
  grandezza: (verso) => ipcRenderer.send('grandezza', Number(verso) || 0),
  menu: () => ipcRenderer.send('menu'),
  conta: (c) => ipcRenderer.send('conta', c || {}),
  suLato: (fn) => ipcRenderer.on('lato', (_e, l) => fn(l)),
  suScala: (fn) => ipcRenderer.on('scala', (_e, s) => fn(Number(s) || 1)),
  suChiacchiere: (fn) => ipcRenderer.on('chiacchiere', (_e, c) => fn(c || {})),
  suCursore: (fn) => ipcRenderer.on('cursore', (_e, c) => fn(c || {})),
  suColonnina: (fn) => ipcRenderer.on('colonnina', (_e, m) => fn(String(m))),
});
