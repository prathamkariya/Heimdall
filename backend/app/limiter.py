from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

_storage_uri = settings.REDIS_URL if settings.APP_ENV != "development" else "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage_uri
)
