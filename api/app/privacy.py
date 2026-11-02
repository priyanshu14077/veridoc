"""Masking for personal data (DPDP Act 2023). Contacts are masked unless the caller may see them."""


def mask_name(name: str | None) -> str | None:
    if not name:
        return name
    return " ".join(part[0] + "***" for part in name.split())


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return phone
    digits = [c for c in phone if c.isdigit()]
    if len(digits) <= 3:
        return "•••"
    return "•••••• " + "".join(digits[-3:])


def mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain}"
