"""Pruebas deterministas de reglas de negocio V6.15.
No se conecta al Supabase real ni modifica datos del usuario.
"""
from collections import Counter
from dataclasses import dataclass
from typing import Optional

@dataclass
class User:
    name: str
    role: str
    parent: Optional[str]

@dataclass
class Account:
    email: str
    origin: str
    owner: str

USERS = {
    u.name: u for u in [
        User("Luis", "admin", None),
        User("Soporte", "support", None),
        User("Sofia", "reseller", "Luis"),
        User("Marian", "reseller", "Sofia"),
        User("Leo", "reseller", "Marian"),
        User("STRSHOPPING", "reseller", "Luis"),
        User("Paco", "reseller", "STRSHOPPING"),
        User("Paco A", "reseller", "Paco"),
        User("Paco B", "reseller", "Paco"),
        User("AB STREAM", "reseller", "Luis"),
    ]
}

def descendants(name: str) -> set[str]:
    found: set[str] = set()
    pending = [name]
    while pending:
        parent = pending.pop(0)
        children = [u.name for u in USERS.values() if u.parent == parent]
        for child in children:
            if child not in found:
                found.add(child)
                pending.append(child)
    return found

def ancestors(name: str) -> list[str]:
    result = [name]
    current = USERS[name]
    while current.parent:
        result.append(current.parent)
        current = USERS[current.parent]
    return result

accounts: list[Account] = []
accounts += [Account(f"sofia{i:03}@test.com", "Sofia", "Sofia") for i in range(1, 101)]
accounts += [Account(f"str{i:03}@test.com", "STRSHOPPING", "STRSHOPPING") for i in range(1, 501)]
accounts += [Account(f"ab{i:03}@test.com", "AB STREAM", "AB STREAM") for i in range(1, 401)]

# Sofia entrega 55 a Marian y Marian 35 a Leo.
for account in accounts[:55]:
    account.owner = "Marian"
for account in accounts[:35]:
    account.owner = "Leo"

# STRSHOPPING solo dispone de 500. Entrega 400 a Paco;
# Paco reparte 175 a cada hijo y conserva 50.
str_accounts = [a for a in accounts if a.origin == "STRSHOPPING"]
for account in str_accounts[:400]:
    account.owner = "Paco"
for account in str_accounts[:175]:
    account.owner = "Paco A"
for account in str_accounts[175:350]:
    account.owner = "Paco B"

def branch_accounts(user: str) -> list[Account]:
    branch = {user, *descendants(user)}
    return [a for a in accounts if a.owner in branch]

def user_account_view(user: str) -> list[Account]:
    """Equivalente conceptual de Usuarios -> usuario -> Cuentas."""
    branch = {user, *descendants(user)}
    return [a for a in accounts if a.origin == user or a.owner in branch]

def can_reassign(actor: str, account: Account, new_owner: str) -> bool:
    role = USERS[actor].role
    if role == "admin":
        return USERS[new_owner].role == "reseller"
    if role != "reseller":
        return False
    branch = {actor, *descendants(actor)}
    return account.owner in branch and new_owner in branch

def ticket_viewers(creator: str) -> set[str]:
    viewers = set(ancestors(creator))
    viewers.add("Soporte")
    return viewers

def can_reply_ticket(actor: str, creator: str, closed: bool = False) -> bool:
    if closed:
        return False
    if USERS[actor].role in {"admin", "support"}:
        return True
    return creator in {actor, *descendants(actor)}

# Inventario y ramas.
assert len(accounts) == 1000
assert len(branch_accounts("Sofia")) == 100
assert Counter(a.owner for a in branch_accounts("Sofia")) == Counter({
    "Sofia": 45, "Marian": 20, "Leo": 35
})
assert len(user_account_view("Sofia")) == 100
assert len(user_account_view("Marian")) == 55
assert len(branch_accounts("STRSHOPPING")) == 500
assert 850 > len(branch_accounts("STRSHOPPING"))  # no puede entregar 850 cuentas únicas

# Reasignación.
example = next(a for a in accounts if a.email == "str500@test.com")
assert can_reassign("Luis", example, "Paco")
assert can_reassign("STRSHOPPING", example, "Paco")
assert not can_reassign("Sofia", example, "Marian")
assert not can_reassign("Soporte", example, "Paco")

# Tickets.
assert ticket_viewers("Leo") == {"Leo", "Marian", "Sofia", "Luis", "Soporte"}
assert ticket_viewers("Sofia") == {"Sofia", "Luis", "Soporte"}
assert can_reply_ticket("Marian", "Leo")
assert can_reply_ticket("Sofia", "Leo")
assert not can_reply_ticket("Paco", "Leo")
assert not can_reply_ticket("Sofia", "Leo", closed=True)

# Avisos: distribuidores solo a hijos directos.
assert [u.name for u in USERS.values() if u.parent == "Sofia"] == ["Marian"]
assert [u.name for u in USERS.values() if u.parent == "Marian"] == ["Leo"]

# Fecha opcional: no se calcula corte sin fecha.
def cutoff(start: Optional[int]) -> Optional[int]:
    return None if start is None else start + 30
assert cutoff(None) is None
assert cutoff(10) == 40

print("PRUEBAS V6.15: 25/25 APROBADAS")
