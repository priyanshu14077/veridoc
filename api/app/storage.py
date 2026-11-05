"""File storage behind one small interface. Local disk today; an S3 driver fits behind it (TDD §2)."""

import secrets
from pathlib import Path
from typing import Protocol

from app.config import get_settings


class Storage(Protocol):
    def put(self, data: bytes, suffix: str) -> str: ...
    def get(self, key: str) -> bytes: ...


class LocalStorage:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:  # keys are ours, but never allow escaping the root
            raise ValueError("invalid storage key")
        return p

    def put(self, data: bytes, suffix: str) -> str:
        # Random keys: names never leak document contents or shipment refs.
        key = f"{secrets.token_hex(2)}/{secrets.token_urlsafe(18)}{suffix}"
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return key

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()


def get_storage() -> Storage:
    return LocalStorage(get_settings().storage_dir)
