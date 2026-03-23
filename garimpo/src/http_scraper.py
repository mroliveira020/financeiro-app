"""Utilitários de coleta HTTP com telemetria mínima para troubleshooting."""

from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass
from typing import Any, Dict

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright


@dataclass
class FetchResult:
    url: str
    final_url: str
    status_code: int | None
    soup: BeautifulSoup | None
    error_type: str | None
    error_message: str | None
    azion_request_id: str | None
    edge_location: str | None
    response_snippet: str | None
    challenge_detected: bool
    attempts_used: int
    source: str


def _clean_snippet(text: str, limit: int = 280) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned[:limit]


def _detect_challenge(body: str) -> bool:
    lowered = body.lower()
    return any(
        marker in lowered
        for marker in (
            "hcaptcha",
            "recaptcha",
            "verificação de segurança",
            "verificacao de seguranca",
            "i am human",
            "não é robô",
            "nao e robo",
            "azion - default error page",
        )
    )


def fetch_html(
    url: str,
    session: requests.Session,
    *,
    headers: Dict[str, str],
    cookies: Dict[str, str],
    timeout: int | float,
) -> FetchResult:
    try:
        response = session.get(url, headers=headers, cookies=cookies, timeout=timeout)
    except requests.RequestException as exc:
        return FetchResult(
            url=url,
            final_url=url,
            status_code=None,
            soup=None,
            error_type="network_error",
            error_message=str(exc),
            azion_request_id=None,
            edge_location=None,
            response_snippet=None,
            challenge_detected=False,
            attempts_used=1,
            source="requests",
        )

    body = response.text or ""
    snippet = _clean_snippet(body) if body else None
    azion_request_id = response.headers.get("x-azion-request-id")
    edge_location = response.headers.get("x-azion-edge-location")
    challenge_detected = _detect_challenge(body)

    error_type = None
    error_message = None
    soup = None

    if response.status_code >= 400:
        if response.status_code == 403 and azion_request_id:
            error_type = "http_403_azion"
        else:
            error_type = f"http_{response.status_code}"
        error_message = f"HTTP {response.status_code}"
    elif challenge_detected:
        error_type = "challenge_page"
        error_message = "Página de challenge/anti-bot detectada"
    else:
        soup = BeautifulSoup(body, "html.parser")

    return FetchResult(
        url=url,
        final_url=response.url,
        status_code=response.status_code,
        soup=soup,
        error_type=error_type,
        error_message=error_message,
        azion_request_id=azion_request_id,
        edge_location=edge_location,
        response_snippet=snippet,
        challenge_detected=challenge_detected,
        attempts_used=1,
        source="requests",
    )


class BrowserContextFetcher:
    def __init__(
        self,
        *,
        headers: Dict[str, str],
        cookies: Dict[str, str],
        headless: bool,
        timeout_seconds: float,
    ) -> None:
        self.headers = headers
        self.cookies = cookies
        self.headless = headless
        self.timeout_ms = int(max(timeout_seconds, 1) * 1000)
        self._playwright = None
        self._browser = None
        self._context = None
        self._bootstrap()

    def _bootstrap(self) -> None:
        self._playwright = sync_playwright().start()
        user_agent = self.headers.get("User-Agent")
        locale = "pt-BR"
        self._browser = self._playwright.chromium.launch(headless=self.headless)
        self._context = self._browser.new_context(
            user_agent=user_agent,
            locale=locale,
            extra_http_headers=self.headers,
        )
        if self.cookies:
            cookie_payload = [
                {"name": name, "value": value, "url": "https://venda-imoveis.caixa.gov.br/"}
                for name, value in self.cookies.items()
            ]
            self._context.add_cookies(cookie_payload)

    def close(self) -> None:
        if self._context:
            self._context.close()
            self._context = None
        if self._browser:
            self._browser.close()
            self._browser = None
        if self._playwright:
            self._playwright.stop()
            self._playwright = None

    def fetch(self, url: str) -> FetchResult:
        page = self._context.new_page()
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)
            body = page.content()
            snippet = _clean_snippet(body) if body else None
            challenge_detected = _detect_challenge(body)
            final_url = page.url
            status_code = response.status if response else 200

            error_type = None
            error_message = None
            soup = None
            if status_code >= 400:
                error_type = f"browser_http_{status_code}"
                error_message = f"HTTP {status_code} via navegador"
            elif challenge_detected:
                error_type = "browser_challenge_page"
                error_message = "Página de challenge/anti-bot detectada via navegador"
            else:
                soup = BeautifulSoup(body, "html.parser")

            return FetchResult(
                url=url,
                final_url=final_url,
                status_code=status_code,
                soup=soup,
                error_type=error_type,
                error_message=error_message,
                azion_request_id=None,
                edge_location=None,
                response_snippet=snippet,
                challenge_detected=challenge_detected,
                attempts_used=1,
                source="playwright",
            )
        except PlaywrightError as exc:
            return FetchResult(
                url=url,
                final_url=page.url if page else url,
                status_code=None,
                soup=None,
                error_type="browser_error",
                error_message=str(exc),
                azion_request_id=None,
                edge_location=None,
                response_snippet=None,
                challenge_detected=False,
                attempts_used=1,
                source="playwright",
            )
        finally:
            page.close()


class SessionFetcher:
    def __init__(
        self,
        *,
        headers: Dict[str, str],
        cookies: Dict[str, str],
        timeout: int | float,
        rate_limit_seconds: float = 0.0,
        session_rotate_every: int = 0,
        retry_attempts: int = 1,
        retry_base_delay_seconds: float = 1.0,
        retry_max_delay_seconds: float = 10.0,
        retry_jitter_seconds: float = 0.0,
        browser_fallback_enabled: bool = False,
        browser_fallback_headless: bool = True,
        browser_fallback_timeout_seconds: float = 30.0,
    ) -> None:
        self.headers = headers
        self.cookies = cookies
        self.timeout = timeout
        self.rate_limit_seconds = max(float(rate_limit_seconds or 0), 0.0)
        self.session_rotate_every = max(int(session_rotate_every or 0), 0)
        self.retry_attempts = max(int(retry_attempts or 1), 1)
        self.retry_base_delay_seconds = max(float(retry_base_delay_seconds or 1.0), 0.0)
        self.retry_max_delay_seconds = max(float(retry_max_delay_seconds or 10.0), 0.0)
        self.retry_jitter_seconds = max(float(retry_jitter_seconds or 0.0), 0.0)
        self.browser_fallback_enabled = bool(browser_fallback_enabled)
        self.browser_fallback_headless = bool(browser_fallback_headless)
        self.browser_fallback_timeout_seconds = max(
            float(browser_fallback_timeout_seconds or 30.0),
            1.0,
        )
        self._last_request_at = 0.0
        self._requests_in_session = 0
        self._session = requests.Session()
        self._browser_fetcher: BrowserContextFetcher | None = None

    def close(self) -> None:
        self._session.close()
        if self._browser_fetcher:
            self._browser_fetcher.close()
            self._browser_fetcher = None

    def rotate_session(self) -> None:
        self._session.close()
        self._session = requests.Session()
        self._requests_in_session = 0

    def _sleep_rate_limit(self) -> None:
        if self.rate_limit_seconds <= 0:
            return
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.rate_limit_seconds:
            time.sleep(self.rate_limit_seconds - elapsed)

    def _should_retry(self, result: FetchResult) -> bool:
        if result.error_type == "network_error":
            return True
        if result.error_type == "challenge_page":
            return True
        if result.status_code in {403, 429, 500, 502, 503, 504}:
            return True
        return False

    def _compute_delay(self, attempt_number: int) -> float:
        base_delay = self.retry_base_delay_seconds * (2 ** max(attempt_number - 1, 0))
        if self.retry_max_delay_seconds > 0:
            base_delay = min(base_delay, self.retry_max_delay_seconds)
        jitter = random.uniform(0, self.retry_jitter_seconds) if self.retry_jitter_seconds else 0.0
        return base_delay + jitter

    def _fetch_via_browser(self, url: str) -> FetchResult:
        if not self._browser_fetcher:
            self._browser_fetcher = BrowserContextFetcher(
                headers=self.headers,
                cookies=self.cookies,
                headless=self.browser_fallback_headless,
                timeout_seconds=self.browser_fallback_timeout_seconds,
            )
        return self._browser_fetcher.fetch(url)

    def fetch(self, url: str) -> FetchResult:
        last_result: FetchResult | None = None
        for attempt in range(1, self.retry_attempts + 1):
            if self.session_rotate_every and self._requests_in_session >= self.session_rotate_every:
                self.rotate_session()

            self._sleep_rate_limit()
            result = fetch_html(
                url,
                self._session,
                headers=self.headers,
                cookies=self.cookies,
                timeout=self.timeout,
            )
            self._last_request_at = time.monotonic()
            self._requests_in_session += 1
            result.attempts_used = attempt
            last_result = result

            if not self._should_retry(result):
                return result

            if attempt >= self.retry_attempts:
                break

            if result.status_code == 403 or result.error_type == "challenge_page":
                self.rotate_session()

            time.sleep(self._compute_delay(attempt))

        if self.browser_fallback_enabled and last_result and self._should_retry(last_result):
            browser_result = self._fetch_via_browser(url)
            browser_result.attempts_used = self.retry_attempts + 1
            return browser_result

        return last_result or FetchResult(
            url=url,
            final_url=url,
            status_code=None,
            soup=None,
            error_type="unknown_error",
            error_message="Falha desconhecida na coleta",
            azion_request_id=None,
            edge_location=None,
            response_snippet=None,
            challenge_detected=False,
            attempts_used=self.retry_attempts,
            source="requests",
        )


def build_error_row(
    codigo_imovel: Any,
    *,
    motivo: str,
    fetch_result: FetchResult | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> Dict[str, Any]:
    result_error_type = error_type or (fetch_result.error_type if fetch_result else None)
    result_error_message = error_message or (fetch_result.error_message if fetch_result else None)
    return {
        "Número do Bem": codigo_imovel,
        "Motivo": motivo,
        "Tipo Erro": result_error_type,
        "Mensagem Erro": result_error_message,
        "Status HTTP": fetch_result.status_code if fetch_result else None,
        "Request ID Azion": fetch_result.azion_request_id if fetch_result else None,
        "Edge Location": fetch_result.edge_location if fetch_result else None,
        "Challenge Detectado": "Sim" if fetch_result and fetch_result.challenge_detected else "Não",
        "Tentativas": fetch_result.attempts_used if fetch_result else None,
        "Origem Coleta": fetch_result.source if fetch_result else None,
        "URL": fetch_result.url if fetch_result else None,
        "URL Final": fetch_result.final_url if fetch_result else None,
        "Trecho Resposta": fetch_result.response_snippet if fetch_result else None,
    }
