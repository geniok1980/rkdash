
import requests
import xml.etree.ElementTree as ET
import urllib3
import os
import ssl
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager
from dotenv import load_dotenv

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class LegacySSLAdapter(HTTPAdapter):
    def init_poolmanager(self, connections, maxsize, block=False):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # Allow legacy renegotiation and weaker ciphers if needed
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        self.poolmanager = PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=ctx
        )

# Load .env explicitly if needed, though usually handled by entry point or auto-discovery
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)

class RKClient:
    def __init__(self, config=None):
        self.config = self._read_config(config)
        # Use HTTPS as discovered
        self.base_url = f"https://{self.config['server']}:{self.config['port']}/rk7api/v0/xmlinterface.xml"
        self.auth_header = self._get_auth_header()
        self.last_error = None
        
        print(f"Инициализация RKClient:")
        print(f"  Server: {self.config['server']}")
        print(f"  Port: {self.config['port']}")
        print(f"  User: {self.config['user']}")
        print(f"  URL: {self.base_url}")
        
        self.session = requests.Session()
        self.session.mount('https://', LegacySSLAdapter())
        self.session.trust_env = False # Disable system proxy usage

    def _read_config(self, config=None):
        if config is not None:
            return config
        return {
            'server': os.getenv('RK_SERVER_IP'),
            'port': os.getenv('RK_HTTP_PORT'),
            'user': os.getenv('RK_USERNAME'),
            'password': os.getenv('RK_PASSWORD')
        }

    def _get_auth_header(self):
        import base64
        auth_string = f"{self.config['user']}:{self.config['password']}"
        return f'Basic {base64.b64encode(auth_string.encode()).decode()}'

    def _send_request(self, xml_data):
        self.last_error = None
        headers = {
            'Authorization': self.auth_header,
            'Content-Type': 'application/xml; charset=utf-8',
        }
        try:
            print(f"Отправка запроса на {self.base_url}")
            # print(f"Headers: {headers}") # Скрываем заголовки с авторизацией
            print(f"Payload: {xml_data}")
            
            response = self.session.post(
                self.base_url,
                data=xml_data.encode('utf-8'),
                headers=headers,
                timeout=60, # Increased timeout for large dictionaries
                verify=False
            )
            print(f"Статус ответа: {response.status_code}")
            print(f"Тело ответа (первые 2000 символов): {response.text[:2000]}")
            
            response.raise_for_status()
            return response.text
        except requests.HTTPError as e:
            status_code = getattr(getattr(e, "response", None), "status_code", None)
            if status_code == 401:
                self.last_error = "RK7 unauthorized (401): проверьте логин/пароль или права XML API"
            else:
                self.last_error = f"RK7 HTTP error{f' {status_code}' if status_code else ''}"
            print(f"Ошибка при отправке запроса: {e}")
            return None
        except Exception as e:
            self.last_error = str(e)
            print(f"Ошибка при отправке запроса: {e}")
            return None

    def get_ref_list(self):
        xml_request = """<?xml version="1.0" encoding="utf-8"?>
<RK7Query>
    <RK7Command2 CMD="GetRefList"/>
</RK7Query>"""
        response_text = self._send_request(xml_request)
        if not response_text:
            return None
        
        try:
            root = ET.fromstring(response_text)
            # Namespace handling might be needed depending on the response, 
            # but usually r_keeper XMLs are straightforward.
            # Based on schema: RK7QueryResult -> RK7RefList -> RK7Reference
            refs = []
            for ref in root.findall('.//RK7Reference'):
                ref_name = ref.get('RefName')
                if ref_name:
                    refs.append(ref_name)
            return refs
        except ET.ParseError:
            self.last_error = "Не удалось разобрать XML ответа RK7 для GetRefList"
            print("Ошибка разбора ответа GetRefList")
            if "SH5WAPI" in response_text or "Incorrect start of JSON" in response_text:
                print("КРИТИЧЕСКАЯ ОШИБКА: Сервер ответил ошибкой StoreHouse 5 API. Вероятно, вы подключаетесь к порту StoreHouse вместо XML-интерфейса R-Keeper 7.")
            return None

    def get_ref_data(self, ref_name):
        xml_request = f"""<?xml version="1.0" encoding="utf-8"?>
<RK7Query>
    <RK7Command2 CMD="GetRefData" RefName="{ref_name}"/>
</RK7Query>"""
        return self._send_request(xml_request)
