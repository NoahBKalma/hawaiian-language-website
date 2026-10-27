import main

REGISTER = {"username": "tester", "email": "t@example.com", "password": "password1"}


def test_unknown_account_and_wrong_password_look_the_same(client):
    client.post("/register", json=REGISTER)
    wrong_password = client.post("/login", json={"username": "tester", "password": "nope"})
    unknown_account = client.post("/login", json={"username": "nobody", "password": "password1"})
    assert wrong_password.status_code == unknown_account.status_code == 401
    assert wrong_password.json() == unknown_account.json() == {"detail": "Incorrect username or password"}


def test_correct_login_still_works(client):
    client.post("/register", json=REGISTER)
    assert "access_token" in client.post("/login", json={"username": "tester", "password": "password1"}).json()


def test_overlong_password_is_a_clean_failure(client):
    client.post("/register", json=REGISTER)
    assert client.post("/login", json={"username": "tester", "password": "x" * 200}).status_code == 401
    too_long = client.post("/register", json={**REGISTER, "username": "other", "email": "o@example.com", "password": "é" * 40})
    assert too_long.status_code == 422


def test_login_and_register_are_rate_limited(client, monkeypatch):
    monkeypatch.setattr(main, "AUTH_ATTEMPTS_PER_MINUTE", 3)
    for _ in range(3):
        assert client.post("/login", json={"username": "nobody", "password": "password1"}).status_code == 401
    blocked = client.post("/login", json={"username": "nobody", "password": "password1"})
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Too many attempts, wait a minute"}
    # register shares the same per-client budget
    assert client.post("/register", json=REGISTER).status_code == 429


def test_usernames_and_emails_ignore_case(client):
    assert client.post("/register", json=REGISTER).status_code == 200
    for clash in ({"username": "TESTER", "email": "other@example.com"},
                  {"username": "someone", "email": "T@Example.com"}):
        dup = client.post("/register", json={**REGISTER, **clash})
        assert dup.status_code == 400
        assert dup.json() == {"detail": "Account with this username or email already exists"}


def test_login_ignores_case_and_keeps_stored_spelling(client):
    client.post("/register", json={**REGISTER, "username": "Noah", "email": "Noah@Example.com"})
    for who in ({"username": "noah"}, {"email": "NOAH@example.COM"}):
        assert "access_token" in client.post("/login", json={**who, "password": "password1"}).json()
    token = client.post("/login", json={"username": "NOAH", "password": "password1"}).json()["access_token"]
    me = client.get("/signed-in-user", headers={"Authorization": f"Bearer {token}"}).json()
    assert (me["username"], me["email"]) == ("Noah", "Noah@example.com")  # the email validator lowercases only the domain


def test_edit_user_rejects_case_variant_of_another_account(client):
    client.post("/register", json=REGISTER)
    client.post("/register", json={"username": "second", "email": "s@example.com", "password": "password1"})
    token = client.post("/login", json={"username": "second", "password": "password1"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/edit-user", json={"new_username": "Tester", "new_email": "s@example.com"}, headers=headers).status_code == 400
    # changing only the case of your own name is fine
    assert client.post("/edit-user", json={"new_username": "SECOND", "new_email": "s@example.com"}, headers=headers).status_code == 200


def test_saved_set_payloads_are_bounded(client, auth):
    fav = {"set_key": "Colors-nouns", "set_name_haw": "Kala", "set_name_eng": "Colors", "set_size": 13}
    assert client.post("/favorites", json={**fav, "set_size": 0}, headers=auth).status_code == 422
    assert client.post("/favorites", json={**fav, "set_key": "k" * 201}, headers=auth).status_code == 422
    assert client.post("/favorites", json=fav, headers=auth).status_code == 200

    cont = {**fav, "last_studied": 5, "min_frequency": 1}
    assert client.post("/continue-sets", json={**cont, "last_studied": 20}, headers=auth).status_code == 422   # past the end
    assert client.post("/continue-sets", json={**cont, "last_studied": 0}, headers=auth).status_code == 422
    assert client.post("/continue-sets", json={**cont, "set_size": 0}, headers=auth).status_code == 422
    assert client.post("/continue-sets", json=cont, headers=auth).json() == {"action": "saved"}
    assert client.post("/continue-sets", json={**cont, "last_studied": 13}, headers=auth).json() == {"action": "completed"}


def test_new_passwords_need_8_characters_and_usernames_at_most_32(client):
    short = client.post("/register", json={**REGISTER, "password": "short"})
    long_name = client.post("/register", json={**REGISTER, "username": "a" * 33})
    assert short.status_code == 422
    assert long_name.status_code == 422
    assert client.post("/register", json={**REGISTER, "username": "a" * 32}).status_code == 200


def test_database_rejects_names_and_emails_that_differ_only_by_case(client):
    from sqlalchemy.exc import IntegrityError
    import models, pytest
    db = models.SessionLocal() if hasattr(models, "SessionLocal") else None
    if db is None:
        from database import SessionLocal
        db = SessionLocal()
    db.add(models.User(username="Noah", email="n@example.com", password_hash="x"))
    db.commit()
    db.add(models.User(username="noah", email="other@example.com", password_hash="x"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()
