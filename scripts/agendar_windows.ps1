# Agenda no Windows a atualizacao automatica dos precos (dias uteis, nos horarios informados).
#
# Uso (dentro da pasta do projeto, depois de preencher scripts\.env):
#   powershell -ExecutionPolicy Bypass -File scripts\agendar_windows.ps1 -Nome "Seu Nome" -Email "voce@exemplo.com"
#
# O que faz:
#   1. Cria uma copia dedicada do repositorio em %LOCALAPPDATA%\PainelPrecosRedeHG\repo, para a automacao
#      nunca mexer na pasta onde voce trabalha.
#   2. Copia scripts\.env (login do portal) para essa copia. O Git ignora esse arquivo.
#   3. Registra a tarefa agendada, que roda scripts\atualizar_e_publicar.py nos horarios escolhidos.
# A tarefa roda enquanto voce estiver logado no Windows; se o PC estiver desligado no horario, roda ao ligar.
# Para remover: Unregister-ScheduledTask -TaskName PainelPrecosRedeHG-AtualizarPrecos -Confirm:$false

param(
  [Parameter(Mandatory = $true)][string]$Nome,
  [Parameter(Mandatory = $true)][string]$Email,
  [string]$Repositorio = "https://github.com/H44TAKE/Pre-os.git",
  [string[]]$Horarios = @("14:20", "17:30"),
  [string]$NomeTarefa = "PainelPrecosRedeHG-AtualizarPrecos"
)
$ErrorActionPreference = "Stop"

$envOrigem = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envOrigem)) { throw "Nao achei scripts\.env. Copie scripts\.env.example para scripts\.env e preencha o login do portal." }

$pasta = Join-Path $env:LOCALAPPDATA "PainelPrecosRedeHG\repo"
if (-not (Test-Path (Join-Path $pasta ".git"))) {
  New-Item -ItemType Directory -Force (Split-Path $pasta) | Out-Null
  git clone $Repositorio $pasta
  if ($LASTEXITCODE -ne 0) { throw "Falha ao clonar $Repositorio" }
}
git -C $pasta config user.name $Nome
git -C $pasta config user.email $Email
Copy-Item $envOrigem (Join-Path $pasta "scripts\.env") -Force

$python = (Get-Command python).Source
$acao = New-ScheduledTaskAction -Execute $python -Argument "`"$pasta\scripts\atualizar_e_publicar.py`"" -WorkingDirectory $pasta
$gatilhos = $Horarios | ForEach-Object { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $_ }
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilhos -Settings $config -Description "Le os precos do portal da Rede HG e publica no site se mudaram." -Force | Out-Null

Write-Host "Tarefa '$NomeTarefa' criada: dias uteis as $($Horarios -join ' e ')."
Write-Host "Copia de trabalho: $pasta"
Write-Host "Registro de execucao: $pasta\scripts\atualizacao.log"
