# installa.ps1: mette (o aggiorna) Microduck su questo PC. Va bene sia Windows PowerShell 5.1 sia pwsh 7:
#   powershell -ExecutionPolicy Bypass -File C:/source/microduck/installa.ps1
# Il file ha il BOM UTF-8: senza, PowerShell 5.1 legge male le lettere accentate.
# Installa Electron e Three.js, prova la lettura dello stato, mette l'icona sul desktop e nel menu Start,
# crea l'attività di Windows che lo riaccende all'accesso, al risveglio e allo sblocco, e lo avvia.
# Rilanciarlo è sicuro: chiude il Microduck acceso e lo riavvia aggiornato. Gira dalla cartella dov'è:
# niente VM, niente chiavi, niente copie.
$ErrorActionPreference = 'Stop'
$qui = $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "Manca Node.js: lancia  winget install OpenJS.NodeJS.LTS , riapri il terminale e rilancia questo script." -ForegroundColor Yellow
  exit 1
}
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$qui*" } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "1/5 Installo Electron e Three.js (qualche minuto la prima volta)"
Push-Location $qui
try {
  & npm install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { throw "npm install non è riuscito" }
  $exe = Join-Path $qui 'node_modules\electron\dist\electron.exe'
  # Il 14 nov npm ha installato il pacchetto senza scaricare l'eseguibile: lo scarica a mano se manca.
  if (-not (Test-Path $exe)) { & node node_modules\electron\install.js }
  if (-not (Test-Path $exe)) { throw "Electron non si è scaricato: controlla la rete e rilancia" }

  Write-Host "2/5 Provo la lettura di terminali, CPU, memoria e disco"
  & node stato.js
  if ($LASTEXITCODE -ne 0) { throw "la prova di stato.js non passa" }
} finally { Pop-Location }

Write-Host "3/5 L'icona sul desktop e nel menu Start"
$shell = New-Object -ComObject WScript.Shell
foreach ($cartella in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $l = $shell.CreateShortcut((Join-Path $cartella 'Microduck.lnk'))
  $l.TargetPath = $exe
  $l.Arguments = "`"$qui`""
  $l.WorkingDirectory = $qui
  $l.IconLocation = (Join-Path $qui 'microduck.ico')
  $l.Description = 'Microduck: il compagno da scrivania'
  $l.Save()
}

# Lume da scrivania, 28 ott: dopo un'ibernazione non c'era più. All'accesso di Windows non se ne accorge
# nessuno, perché dopo un'ibernazione non c'è un accesso nuovo: l'attività lo riaccende anche al risveglio
# e allo sblocco. Se è già acceso, quello nuovo si chiude subito.
Write-Host "4/5 L'attività che lo riaccende all'accesso, al risveglio e allo sblocco"
try {
  $io = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $azione = New-ScheduledTaskAction -Execute $exe -Argument "`"$qui`" --da-solo" -WorkingDirectory $qui
  $accesso = New-ScheduledTaskTrigger -AtLogOn -User $io
  $risveglio = New-CimInstance -CimClass (Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskEventTrigger) -ClientOnly
  $risveglio.Enabled = $true
  $risveglio.Delay = 'PT10S'
  $risveglio.Subscription = '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name=''Microsoft-Windows-Power-Troubleshooter''] and EventID=1]]</Select></Query></QueryList>'
  $sblocco = New-CimInstance -CimClass (Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger) -ClientOnly
  $sblocco.Enabled = $true
  $sblocco.StateChange = 8
  $sblocco.UserId = $io
  $impostazioni = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $chi = New-ScheduledTaskPrincipal -UserId $io -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName 'Microduck' -Action $azione -Trigger @($accesso, $risveglio, $sblocco) -Settings $impostazioni -Principal $chi -Description 'Riaccende Microduck se non è acceso.' -Force | Out-Null
  Write-Host "    fatta: dal menu vicino all'orologio si spegne e si riaccende con 'Riaccendi da solo'" -ForegroundColor Green
} catch {
  Write-Host "    non sono riuscito a crearla ($($_.Exception.Message)): resta 'Parti con Windows' nel menu, e dopo un'ibernazione va riacceso a mano" -ForegroundColor Yellow
}

Write-Host "5/5 Avvio Microduck"
Start-Process -FilePath $exe -ArgumentList "`"$qui`"" -WorkingDirectory $qui
Write-Host "Fatto. Icona sul desktop per accenderlo; icona vicino all'orologio (o tasto destro su di lui) per grandezza, chiacchiere, nasconderlo e spegnerlo." -ForegroundColor Green
Write-Host "Per toglierlo: spegnilo, Unregister-ScheduledTask Microduck, cancella le due icone Microduck.lnk e questa cartella." -ForegroundColor DarkGray
