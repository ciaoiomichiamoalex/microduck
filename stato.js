// Microduck: cosa succede sul PC. Niente VM e niente ssh: legge tutto qui.
// I terminali vengono da ~/.claude/sessions/<pid>.json, che Claude Code aggiorna da sé (campo status:
// busy, shell, idle, waiting). Così non serve nessun hook in settings.json.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Stessa regola della lista sessioni di Claude Code: "shell" è fermo al prompt ma con un comando in
// background, e Claude Code lo mostra come "working". idle e waiting sono fermi.
const IN_CORSO = new Set(['busy', 'shell']);
const TIPI = new Set(['interactive', 'bg']); // daemon e daemon-worker non sono terminali

// ponytail: un pid vivo basta. Se Windows riusa il pid di una sessione morta male, quel file conta finché
// il processo nuovo vive; se dà fastidio, confrontare anche procStart del file con l'avvio del processo.
function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function terminali(cartella = path.join(os.homedir(), '.claude', 'sessions')) {
  let file;
  try { file = fs.readdirSync(cartella).filter((f) => /^\d+\.json$/.test(f)); } catch { return []; }
  const lista = [];
  for (const f of file) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(cartella, f), 'utf8'));
      if (!Number.isInteger(s.pid) || !vivo(s.pid)) continue;
      if (s.kind && !TIPI.has(s.kind)) continue;
      lista.push({ nome: String(s.name || path.basename(s.cwd || '') || s.pid), stato: IN_CORSO.has(s.status) ? 'in corso' : 'fermo' });
    } catch { /* file a metà scrittura: lo rilegge al giro dopo */ }
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome));
}

// La CPU è la differenza fra due letture: la prima chiamata dà 0.
let cpuPrima = null;
function cpu() {
  const t = os.cpus().reduce((a, c) => {
    const x = c.times;
    a.libera += x.idle;
    a.tot += x.user + x.nice + x.sys + x.idle + x.irq;
    return a;
  }, { libera: 0, tot: 0 });
  const p = cpuPrima;
  cpuPrima = t;
  if (!p || t.tot <= p.tot) return 0;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - (t.libera - p.libera) / (t.tot - p.tot)))));
}

function disco(radice = (process.env.SystemDrive || 'C:') + '\\') {
  try {
    const s = fs.statfsSync(radice);
    return { disco_totale: s.blocks * s.bsize, disco_usato: (s.blocks - s.bfree) * s.bsize };
  } catch { return {}; }
}

function stato() {
  const tot = os.totalmem();
  return { ok: true, terminali: terminali(), macchina: { cpu: cpu(), ram_totale: tot, ram_usata: tot - os.freemem(), ...disco() } };
}

module.exports = { stato, terminali };

// Prova:  node stato.js
if (require.main === module) {
  const assert = require('assert');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'microduck-'));
  const scrivi = (n, o) => fs.writeFileSync(path.join(dir, n + '.json'), typeof o === 'string' ? o : JSON.stringify(o));
  scrivi(process.pid, { pid: process.pid, name: 'b-lavora', status: 'busy', kind: 'interactive' });
  scrivi(process.ppid, { pid: process.ppid, cwd: 'C:\\x\\a-fermo', status: 'idle' });
  scrivi(1, { pid: 999998, name: 'morto', status: 'busy' }); // 999998 non è un pid valido su Windows
  scrivi(2, '{ mezzo file');
  scrivi(3, { pid: process.pid, name: 'demone', status: 'busy', kind: 'daemon' });
  const t = terminali(dir);
  assert.deepStrictEqual(t, [{ nome: 'a-fermo', stato: 'fermo' }, { nome: 'b-lavora', stato: 'in corso' }]);
  fs.rmSync(dir, { recursive: true });
  cpu();
  const s = stato();
  assert.ok(s.macchina.cpu >= 0 && s.macchina.cpu <= 100);
  assert.ok(s.macchina.ram_usata > 0 && s.macchina.ram_usata < s.macchina.ram_totale);
  assert.ok(s.macchina.disco_usato > 0 && s.macchina.disco_usato <= s.macchina.disco_totale);
  console.log('ok', JSON.stringify({ terminali: s.terminali, macchina: s.macchina }));
}
