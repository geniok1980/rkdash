from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha1
import logging
import ssl
import time

import requests
import urllib3
from requests import Response
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class IikoClientConfig:
    server_url: str
    login: str
    password: str
    verify_ssl: bool
    timeout_seconds: int
    retry_count: int = 12


class LegacySSLAdapter(HTTPAdapter):
    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        context.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        if hasattr(ssl, "OP_NO_TLSv1_3"):
            context.options |= ssl.OP_NO_TLSv1_3
        try:
            context.set_ciphers("DEFAULT@SECLEVEL=1")
        except Exception:
            pass
        self.poolmanager = PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=context,
        )


class IikoClient:
    def __init__(self, config: IikoClientConfig):
        self.config = config
        self.base_url = f"{config.server_url.rstrip('/')}/resto"
        self.session = self._create_session()
        self._token: str | None = None

    @staticmethod
    def _create_session() -> requests.Session:
        session = requests.Session()
        session.mount("https://", LegacySSLAdapter())
        session.trust_env = False
        session.headers.update({"Connection": "close"})
        return session

    def _reset_session(self) -> None:
        try:
            self.session.close()
        except Exception:
            pass
        self.session = self._create_session()

    @staticmethod
    def _password_hash(password: str) -> str:
        stripped = password.strip()
        if len(stripped) == 40 and all(ch in "0123456789abcdefABCDEF" for ch in stripped):
            return stripped.lower()
        return sha1(stripped.encode("utf-8")).hexdigest()

    @staticmethod
    def to_iiko_date(value: str) -> str:
        year, month, day = value.split("-")
        return f"{day}.{month}.{year}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json_body: dict | None = None,
        allow_reauth: bool = True,
    ) -> Response:
        last_error: Exception | None = None
        url = f"{self.base_url}/{path.lstrip('/')}"

        for attempt in range(1, self.config.retry_count + 1):
            try:
                response = self.session.request(
                    method=method.upper(),
                    url=url,
                    params=params,
                    json=json_body,
                    timeout=self.config.timeout_seconds,
                    verify=self.config.verify_ssl,
                )
                if response.status_code == 401 and allow_reauth:
                    self.authenticate(force=True)
                    updated_params = dict(params or {})
                    if "key" in updated_params:
                        updated_params["key"] = self._token
                    return self._request(
                        method,
                        path,
                        params=updated_params,
                        json_body=json_body,
                        allow_reauth=False,
                    )
                response.raise_for_status()
                return response
            except requests.RequestException as error:
                last_error = error
                self._reset_session()
                logger.warning(
                    "IIKO request failed on attempt %s/%s for %s: %s",
                    attempt,
                    self.config.retry_count,
                    path,
                    error,
                )
                if attempt < self.config.retry_count:
                    time.sleep(min(3, attempt))

        if last_error is None:
            raise RuntimeError(f"IIKO request failed without error for {path}")
        raise RuntimeError(f"IIKO request failed for {path}: {last_error}") from last_error

    def authenticate(self, force: bool = False) -> str:
        if self._token and not force:
            return self._token

        if force and self._token:
            self.quit_token()

        response = self._request(
            "GET",
            "api/auth",
            params={
                "login": self.config.login,
                "pass": self._password_hash(self.config.password),
            },
            allow_reauth=False,
        )
        token = response.text.strip()
        if not token:
            raise RuntimeError("IIKO auth returned an empty token")
        self._token = token
        return token

    def _key(self, **extra) -> dict:
        return {"key": self.authenticate(), **{k: v for k, v in extra.items() if v is not None}}

    def quit_token(self) -> None:
        if not self._token:
            return
        try:
            self._request("GET", "api/logout", params={"key": self._token}, allow_reauth=False)
        except Exception as error:
            logger.warning("IIKO logout failed: %s", error)
        finally:
            self._token = None

    def get_version(self) -> str:
        response = self._request(
            "GET",
            "get_server_info.jsp",
            params={"encoding": "UTF-8"},
            allow_reauth=False,
        )
        return response.text

    def get_departments(self) -> bytes:
        return self._request("GET", "api/corporation/departments", params=self._key()).content

    def get_groups(self) -> bytes:
        return self._request("GET", "api/corporation/groups", params=self._key()).content

    def get_terminals(self) -> bytes:
        return self._request("GET", "api/corporation/terminals", params=self._key()).content

    def get_stores(self) -> str:
        return self._request("GET", "api/corporation/stores", params=self._key()).text

    def get_products(self, include_deleted: bool = False) -> bytes:
        return self._request(
            "GET",
            "api/products",
            params=self._key(includeDeleted=str(include_deleted).lower()),
        ).content

    def get_sales_report(
        self,
        department_id: str,
        business_date: str,
        dish_details: bool = True,
        all_revenue: bool = True,
    ) -> bytes:
        iiko_date = self.to_iiko_date(business_date)
        return self._request(
            "GET",
            "api/reports/sales",
            params=self._key(
                department=department_id,
                dateFrom=iiko_date,
                dateTo=iiko_date,
                dishDetails=str(dish_details).lower(),
                allRevenue=str(all_revenue).lower(),
            ),
        ).content
