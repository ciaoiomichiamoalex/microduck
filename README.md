# Microduck

Un papero robot in 3D che sta sempre sopra le finestre di Windows, in un angolo dello schermo. Accanto ha una colonnina con:

- quanti terminali Claude Code sono **in corso** e quanti sono **fermi**;
- **CPU**, **RAM** e **disco** del PC.

Fa le sue mosse a turno (cammina, saltello, parla, gira su se stesso, backflip, pisolino), segue il puntatore con la testa e dice battute scherzose con i numeri veri. Le zone trasparenti attorno a lui lasciano passare i clic alle finestre sotto.

Tutto gira sul PC: niente server, niente VM, niente dati che escono.

## Requisiti

- Windows 10 o 11
- [Node.js](https://nodejs.org/) (con npm)
- PowerShell: va bene quello di Windows (5.1), non serve PowerShell 7

## Installazione

Dalla cartella del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\installa.ps1
```

Da una shell bash (Git Bash) il percorso va scritto con le barre in avanti, per esempio `C:/source/microduck/installa.ps1`.

Lo script:

1. installa Electron e Three.js con `npm install` (scarica a mano l'eseguibile di Electron se npm non l'ha fatto);
2. prova la lettura di terminali, CPU, RAM e disco (`node stato.js`);
3. mette l'icona **Microduck** sul desktop e nel menu Start;
4. crea l'attività di Windows **Microduck**, che lo riaccende all'accesso, al risveglio dall'ibernazione e allo sblocco dello schermo;
5. avvia Microduck.

Rilanciarlo è sicuro: chiude quello acceso e lo riavvia aggiornato. L'app gira dalla cartella del repo, non viene copiata altrove.

## Uso

| Gesto | Cosa fa |
|---|---|
| Clic su di lui | una battuta subito |
| Trascinarlo | lo sposta; vicino a un bordo ci si appoggia |
| Ctrl + rotellina su di lui | più grande o più piccolo |
| Tasto destro su di lui, o sull'icona vicino all'orologio | il menu |
| Clic sull'icona vicino all'orologio | lo nasconde o lo fa tornare |

Dal menu:

- **Grandezza**: Piccolo, Normale, Grande, Molto grande;
- **Statistiche**: sempre visibili, sempre nascoste (resta solo Microduck), o solo col mouse sopra di lui. In quest'ultimo caso compaiono passando su Microduck, restano finché il mouse è su di lui o sulla colonnina, e spariscono un secondo e mezzo dopo;
- **Chiacchiere**: tante (una battuta ogni 2–5 minuti), poche (ogni 10–20), niente;
- **Zitto per un'ora**;
- **Ricarica**: rilegge la pagina;
- **Riaccendi da solo**: accende o spegne l'attività di Windows;
- **Spegni Microduck**.

Le impostazioni e la posizione restano anche dopo un riavvio del PC. Riavviandosi torna sul monitor dove l'hai lasciato, se è ancora collegato.

Microduck guarda sempre verso il centro dello schermo. Sulla metà destra la colonnina e la nuvoletta stanno alla sua sinistra, sulla metà sinistra alla sua destra.

## Cosa mostra

**Terminali.** Claude Code tiene un file per ogni sessione aperta in `%USERPROFILE%\.claude\sessions\<pid>.json`, con un campo `status`. Microduck legge quei file:

- `busy` e `shell` contano come **in corso**: `shell` vuol dire fermo al prompt ma con un comando in background, e la lista sessioni di Claude Code lo mostra come attivo;
- `idle` e `waiting` contano come **fermi**.

Non c'è niente da configurare: nessun hook, nessuna modifica a `settings.json`. Le sessioni di processi chiusi non vengono contate. Passando il mouse sulle pastiglie «in corso» e «fermi» compaiono i nomi dei terminali.

**PC.** CPU (differenza fra due letture, ogni 5 secondi), RAM usata sul totale, disco di sistema usato sul totale.

## Carattere

- **Mosse**: una ogni 20–40 secondi, a rotazione. Alcune partono da quello che succede: un terminale finisce e lui fa un saltello, l'ultimo si ferma e fa un backflip di festa, ne nasce uno nuovo e fa un giro.
- **Puntatore**: la testa segue il mouse su tutto lo schermo; durante una mossa pensa alla mossa. Col mouse fermo da 2,5 secondi torna a guardarsi intorno.
- **Battute**: circa 150, ti chiamano per nome e usano i numeri veri. Nello stesso giorno non ripete una frase finché ne ha di nuove.
- **Sera**: dopo le 20, se nessun terminale è in corso, si addormenta; si sveglia appena uno riparte.

Il nome con cui ti chiama e le battute sono nell'oggetto `BATTUTE` in `index.html`.

## Modificarlo

| File | Cosa contiene | Dopo una modifica |
|---|---|---|
| `index.html` | il papero 3D, la colonnina, la nuvoletta, mosse e battute | **Ricarica** dal menu |
| `main.js` | la finestra trasparente, il menu, posizione e preferenze | spegnerlo e riaccenderlo |
| `preload.js` | il ponte fra pagina e finestra | spegnerlo e riaccenderlo |
| `stato.js` | la lettura di terminali, CPU, RAM e disco | spegnerlo e riaccenderlo |
| `installa.ps1` | l'installazione | rilanciarlo |
| `microduck.ico` | l'icona | rilanciare `installa.ps1` |

`installa.ps1` è salvato in UTF-8 **con BOM**: senza, PowerShell 5.1 legge male le lettere accentate.

### Provare la pagina nel browser

Senza la finestra di Electron la pagina usa dati finti (tre terminali che cambiano stato e una CPU che va su e giù):

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Poi apri `http://127.0.0.1:8765/index.html`. Parametri utili:

| Parametro | Effetto |
|---|---|
| `?ora=18:31` | finge quell'ora (battute della sera, pisolino) |
| `?mossa=backflip` | parte subito con una mossa: `cammina`, `saltello`, `gira`, `backflip`, `dorme` |
| `?s=2` | lo ingrandisce |
| `?nudo` | toglie lo sfondo di prova |
| `?statistiche=mouse` | statistiche solo col mouse sopra di lui (`mai` per nasconderle) |

### Provare la lettura dello stato

```bash
node stato.js
```

oppure `npm run prova`. Stampa `ok` con i terminali e i numeri del PC, o si ferma con l'errore.

## Dove tiene i suoi dati

In `%APPDATA%\microduck`:

- `preferenze.json`: posizione per ogni monitor, grandezza, chiacchiere, statistiche;
- `diario.log`: quando parte, si sospende, si risveglia, perde la pagina o si chiude, e perché. È il primo posto da guardare se Microduck sparisce.

## Disinstallare

1. Spegnilo dal menu.
2. In PowerShell: `Unregister-ScheduledTask Microduck`.
3. Cancella le due icone `Microduck.lnk` (desktop e menu Start), la cartella `%APPDATA%\microduck` e la cartella del repo.

## Il mockup

`mockup/microduck-3d.html` è l'artefatto da cui viene il modello 3D: Microduck su uno sfondo da studio fotografico, da girare col mouse, con i quattro colori del robot vero e i bottoni per ogni mossa. Si apre con un doppio clic in qualunque browser. Serve internet, perché carica Three.js r128 da cdnjs e i caratteri da Google Fonts.

L'app usa lo stesso modello, con i colori bianco e arancio, e una copia locale di Three.js presa da `node_modules`: la finestra non scarica niente da internet.

## Da dove viene

La finestra (trasparenza, trascinamento, aggancio ai bordi, attività di Windows, diario) segue il metodo del Lume da scrivania di Lumesia, adattato per girare tutto in locale. Il modello 3D è stato costruito pezzo per pezzo dalle foto del robot vero, nell'artefatto del mockup.
