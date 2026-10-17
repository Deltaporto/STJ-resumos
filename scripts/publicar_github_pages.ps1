param(
    [string]$RemoteUrl = "https://github.com/Deltaporto/STJ-resumos.git",
    [string]$Branch = "main",
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $ProjectRoot "web"
$SyncDir = Join-Path $ProjectRoot ".pages_repo"

Write-Host "============================================================"
Write-Host "Sincronizando Portal STJ Sessoes (1a Turma e 1a Secao - GMHB)"
Write-Host "============================================================"

Write-Host "[1/4] Compilando web/data.js e web/transcricoes/..."
Push-Location -LiteralPath $ProjectRoot
try {
    uv run python scripts/gerar_site.py
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao compilar os dados do site."
    }
}
finally {
    Pop-Location
}

Write-Host "[2/4] Preparando repositorio de publicacao..."
if (-not (Test-Path -LiteralPath (Join-Path $SyncDir ".git"))) {
    if (Test-Path -LiteralPath $SyncDir) {
        Remove-Item -LiteralPath $SyncDir -Recurse -Force
    }
    git clone --branch $Branch $RemoteUrl $SyncDir
    if ($LASTEXITCODE -ne 0) {
        New-Item -ItemType Directory -Path $SyncDir -Force | Out-Null
        Push-Location -LiteralPath $SyncDir
        git init
        git checkout -b $Branch
        git remote add origin $RemoteUrl
        Pop-Location
    }
}
else {
    Push-Location -LiteralPath $SyncDir
    git fetch origin $Branch
    git checkout $Branch
    git pull --ff-only origin $Branch
    Pop-Location
}

Write-Host "[3/4] Substituindo arquivos estaticos no repositorio do Pages..."
Get-ChildItem -LiteralPath $SyncDir -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $WebDir "*") -Destination $SyncDir -Recurse -Force

Push-Location -LiteralPath $SyncDir
try {
    $Status = git status --porcelain
    if (-not $Status) {
        Write-Host "Nenhuma alteracao pendente para publicacao."
        exit 0
    }

    git add -A
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "Atualizacao de sessoes da 1a Turma e 1a Secao ($Timestamp)"

    if (-not $SkipPush) {
        Write-Host "[4/4] Enviando para o GitHub Pages ($RemoteUrl)..."
        git push origin $Branch
        Write-Host "Publicacao concluida com sucesso em https://deltaporto.github.io/STJ-resumos/"
    }
    else {
        Write-Host "[4/4] Commit local realizado (-SkipPush ativo)."
    }
}
finally {
    Pop-Location
}
