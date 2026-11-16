"""Roda o robô do portal e, se os preços mudaram, publica no site (commit + push na branch main).

É o script que o agendador do Windows executa (veja scripts/agendar_windows.ps1). Pode ser rodado à mão:

    python scripts/atualizar_e_publicar.py

Só publica se: a branch for a main, não houver alteração solta em arquivos versionados, o robô achar
preços diferentes e não houver posto novo a classificar. O que aconteceu fica em scripts/atualizacao.log.
Códigos de saída: 0 ok (publicou ou não havia mudança), 2 não pôde rodar com segurança,
3 posto novo a classificar, outro = falha do robô ou do git.
"""
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LOG = RAIZ / "scripts" / "atualizacao.log"
DADOS = "public/data/precos"


def log(msg: str) -> None:
    linha = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(linha)
    with open(LOG, "a", encoding="utf8") as f:
        f.write(linha + "\n")


def git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, encoding="utf8", errors="replace")


def publicar(repo: Path, ramo: str, mensagem: str) -> tuple[bool, str]:
    """Commita o que mudou em public/data/precos e envia. Devolve (publicou, detalhe)."""
    git(repo, "add", DADOS)
    if not git(repo, "status", "--porcelain", DADOS).stdout.strip():
        return False, "nada a publicar"
    r = git(repo, "commit", "-q", "-m", mensagem)
    if r.returncode:
        return False, f"commit falhou: {(r.stderr or r.stdout).strip()}"
    r = git(repo, "push", "origin", ramo)
    if r.returncode:
        return False, f"push falhou: {(r.stderr or r.stdout).strip()}"
    return True, "publicado"


def main(repo: Path = RAIZ, ramo: str = "main") -> int:
    atual = git(repo, "branch", "--show-current").stdout.strip()
    if atual != ramo:
        log(f"Abortado: a pasta está na branch '{atual}', não em '{ramo}'.")
        return 2
    if git(repo, "status", "--porcelain", "--untracked-files=no").stdout.strip():
        log("Abortado: há alterações não commitadas em arquivos versionados.")
        return 2
    r = git(repo, "pull", "--ff-only", "origin", ramo)
    if r.returncode:
        log(f"Abortado: não consegui atualizar da origem: {(r.stderr or r.stdout).strip()}")
        return 2
    if not git(repo, "config", "user.name").stdout.strip() or not git(repo, "config", "user.email").stdout.strip():
        log("Abortado: git sem user.name/user.email configurados nesta pasta.")
        return 2

    robo = subprocess.run(
        [sys.executable, str(repo / "scripts" / "atualizar_precos_portal.py"), "--automatico"],
        cwd=repo, capture_output=True, text=True, encoding="utf8", errors="replace",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    for linha in (robo.stdout + robo.stderr).strip().splitlines():
        log("  robô: " + linha)
    if robo.returncode == 3:
        log("Não publicado: posto novo a classificar.")
        return 3
    if robo.returncode:
        log(f"Falha do robô (código {robo.returncode}).")
        return robo.returncode

    hoje = datetime.now().strftime("%Y-%m-%d")
    publicou, detalhe = publicar(repo, ramo, f"Preços de {hoje} (atualização automática do portal)")
    log(("Publicado no GitHub; o Vercel atualiza o site em instantes." if publicou else f"Nada publicado: {detalhe}"))
    return 0 if publicou or detalhe == "nada a publicar" else 1


if __name__ == "__main__":
    sys.exit(main())
