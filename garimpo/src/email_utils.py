"""Utilitários para abrir o cliente de e-mail padrão com mensagem pré-preenchida."""

from __future__ import annotations

import platform
import subprocess
import urllib.parse
import webbrowser
from pathlib import Path


def open_default_email_client(
    recipient: str,
    subject: str,
    body: str,
    attachment_path: Path | None = None,
) -> bool:
    """Abre o cliente de e-mail padrão. Em macOS tenta anexar o arquivo via Mail.app."""
    system = platform.system().lower()

    if system == "darwin" and attachment_path is not None:
        return _open_mail_app_mac(recipient, subject, body, attachment_path)

    mailto_url = _build_mailto(recipient, subject, body)
    return webbrowser.open(mailto_url)


def _build_mailto(recipient: str, subject: str, body: str) -> str:
    query = urllib.parse.urlencode({
        "subject": subject,
        "body": body,
    })
    return f"mailto:{urllib.parse.quote(recipient)}?{query}"


def _open_mail_app_mac(
    recipient: str,
    subject: str,
    body: str,
    attachment_path: Path,
) -> bool:
    script = f'''
        tell application "Mail"
            activate
            set theMessage to make new outgoing message with properties {{subject:"{_escape_applescript(subject)}", content:"{_escape_applescript(body)}\n\n", visible:true}}
            tell theMessage
                make new to recipient at end of to recipients with properties {{address:"{_escape_applescript(recipient)}"}}
                try
                    make new attachment with properties {{file name:(POSIX file "{attachment_path}")}} at after the last paragraph
                end try
            end tell
        end tell
    '''
    try:
        subprocess.run(["osascript", "-e", script], check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def _escape_applescript(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
