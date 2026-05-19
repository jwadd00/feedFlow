from __future__ import annotations

import getpass
import hashlib


def main() -> None:
    password = getpass.getpass("App password to hash: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        raise SystemExit("Passwords do not match.")

    print(hashlib.sha256(password.encode("utf-8")).hexdigest())


if __name__ == "__main__":
    main()
