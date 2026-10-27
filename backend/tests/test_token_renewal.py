from datetime import datetime, timedelta

from jose import jwt

import auth as auth_mod


def _token(user_id, minutes_left):
    exp = datetime.utcnow() + timedelta(minutes=minutes_left)
    return jwt.encode({"user_id": user_id, "exp": exp}, auth_mod.SECRET_KEY, algorithm=auth_mod.ALGORITHM)


def _user_id(client, headers):
    token = headers["Authorization"].split()[1]
    return jwt.decode(token, auth_mod.SECRET_KEY, algorithms=[auth_mod.ALGORITHM])["user_id"]


def test_login_lasts_two_days():
    assert auth_mod.ACCESS_TOKEN_EXPIRE_MINUTES == 2 * 24 * 60


def test_fresh_token_is_not_renewed(client):
    client.post("/register", json={"username": "tester", "email": "t@example.com", "password": "password1"})
    token = client.post("/login", json={"username": "tester", "password": "password1"}).json()["access_token"]
    body = client.get("/signed-in-user", headers={"Authorization": f"Bearer {token}"}).json()
    assert "new_token" not in body


def test_token_past_halfway_is_swapped_for_a_fresh_one(client, auth):
    user_id = _user_id(client, auth)
    old = _token(user_id, minutes_left=60)   # almost expired
    body = client.get("/signed-in-user", headers={"Authorization": f"Bearer {old}"}).json()
    new = body["new_token"]
    remaining = datetime.utcfromtimestamp(jwt.decode(new, auth_mod.SECRET_KEY, algorithms=[auth_mod.ALGORITHM])["exp"]) - datetime.utcnow()
    assert remaining > timedelta(minutes=auth_mod.ACCESS_TOKEN_EXPIRE_MINUTES - 5)
    assert client.get("/signed-in-user", headers={"Authorization": f"Bearer {new}"}).status_code == 200


def test_expired_token_is_not_renewed(client, auth):
    user_id = _user_id(client, auth)
    expired = _token(user_id, minutes_left=-5)
    assert client.get("/signed-in-user", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_password_change_signs_out_other_devices_but_not_this_one(client, auth):
    old_headers = auth
    changed = client.post("/edit-password", json={"curr_password": "password1", "new_password": "new-password1"}, headers=old_headers)
    assert changed.status_code == 200
    # the token used for the change (and any other old one) no longer works
    assert client.get("/signed-in-user", headers=old_headers).status_code == 401
    # this device gets a fresh token that does
    fresh = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/signed-in-user", headers=fresh).status_code == 200
    # logging in again with the new password also works
    assert client.post("/login", json={"username": "tester", "password": "new-password1"}).status_code == 200


def test_token_without_a_version_still_works_until_the_first_password_change(client, auth):
    user_id = _user_id(client, auth)
    legacy = jwt.encode({"user_id": user_id, "exp": datetime.utcnow() + timedelta(hours=1)}, auth_mod.SECRET_KEY, algorithm=auth_mod.ALGORITHM)
    assert client.get("/signed-in-user", headers={"Authorization": f"Bearer {legacy}"}).status_code == 200
    client.post("/edit-password", json={"curr_password": "password1", "new_password": "other-pass1"}, headers=auth)
    assert client.get("/signed-in-user", headers={"Authorization": f"Bearer {legacy}"}).status_code == 401


def _login_token(user_id, login_age_days, minutes_left):
    now = datetime.utcnow()
    login_at = now - timedelta(days=login_age_days)
    return jwt.encode({"user_id": user_id, "tv": 0, "login_at": int((login_at - datetime(1970, 1, 1)).total_seconds()),
                       "exp": now + timedelta(minutes=minutes_left)}, auth_mod.SECRET_KEY, algorithm=auth_mod.ALGORITHM)


def test_renewal_keeps_the_original_login_time(client, auth):
    user_id = _user_id(client, auth)
    old = _login_token(user_id, 10, 60)
    new = client.get("/signed-in-user", headers={"Authorization": f"Bearer {old}"}).json()["new_token"]
    claims = jwt.decode(new, auth_mod.SECRET_KEY, algorithms=[auth_mod.ALGORITHM])
    assert claims["login_at"] == jwt.decode(old, auth_mod.SECRET_KEY, algorithms=[auth_mod.ALGORITHM])["login_at"]


def test_renewed_token_never_outlives_the_session_cap(client, auth):
    user_id = _user_id(client, auth)
    old = _login_token(user_id, 29, 60)
    body = client.get("/signed-in-user", headers={"Authorization": f"Bearer {old}"}).json()
    claims = jwt.decode(body["new_token"], auth_mod.SECRET_KEY, algorithms=[auth_mod.ALGORITHM])
    assert datetime.utcfromtimestamp(claims["exp"]) <= datetime.utcnow() + timedelta(days=1, minutes=1)


def test_login_older_than_the_cap_is_rejected_even_with_time_left(client, auth):
    user_id = _user_id(client, auth)
    stale = _login_token(user_id, 31, 60)
    assert client.get("/signed-in-user", headers={"Authorization": f"Bearer {stale}"}).status_code == 401


def test_logout_revokes_existing_tokens(client, auth):
    assert client.post("/logout", headers=auth).json() == {"logged_out": True}
    assert client.get("/signed-in-user", headers=auth).status_code == 401
