import base64
import json
import time

import pytest

from conftest import LIB, load_handler

AUTHORIZER = LIB / "authorization" / "websocket-api-authorizer" / "lambda_function.py"
METHOD_ARN = "arn:aws:execute-api:us-east-1:111111111111:abc123/prod/$connect"


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@pytest.fixture(scope="module")
def keypair():
    # The handler's own vendored rsa package, so the test needs no crypto dependency of its own.
    import sys
    sys.path.insert(0, str(AUTHORIZER.parent))
    try:
        import rsa
    finally:
        sys.path.remove(str(AUTHORIZER.parent))
    public, private = rsa.newkeys(2048)
    jwk = {
        "kid": "key-1", "kty": "RSA", "alg": "RS256", "use": "sig",
        "n": _b64url(public.n.to_bytes((public.n.bit_length() + 7) // 8, "big")),
        "e": _b64url(public.e.to_bytes((public.e.bit_length() + 7) // 8, "big")),
    }
    return rsa, private, jwk


def sign(keypair, claims, kid="key-1"):
    rsa, private, _ = keypair
    header = _b64url(json.dumps({"alg": "RS256", "kid": kid, "typ": "JWT"}).encode())
    payload = _b64url(json.dumps(claims).encode())
    signature = rsa.sign(f"{header}.{payload}".encode(), private, "SHA-256")
    return f"{header}.{payload}.{_b64url(signature)}"


@pytest.fixture
def authorizer(monkeypatch, keypair):
    monkeypatch.setenv("USER_POOL_ID", "us-east-1_pool")
    monkeypatch.setenv("APP_CLIENT_ID", "client-123")
    module = load_handler(AUTHORIZER, "websocket_authorizer")
    fetched = []

    class Jwks:
        def json(self):
            return {"keys": [keypair[2]]}

    def get(url, timeout=None):
        fetched.append((url, timeout))
        return Jwks()

    monkeypatch.setattr(module.requests, "get", get)
    module.fetched = fetched
    return module


def claims(**overrides):
    base = {"sub": "user-1", "aud": "client-123", "exp": int(time.time()) + 3600, "custom:role": '["Admin"]', "token_use": "id"}
    return {**base, **overrides}


def connect(authorizer, token):
    return authorizer.lambda_handler({"queryStringParameters": {"Authorization": token}, "methodArn": METHOD_ARN}, None)


def test_a_valid_id_token_is_allowed_with_the_user_and_role_in_context(authorizer, keypair):
    policy = connect(authorizer, sign(keypair, claims()))

    assert policy["principalId"] == "user-1"
    assert policy["context"] == {"role": '["Admin"]', "userId": "user-1"}
    assert policy["policyDocument"]["Statement"] == [{"Action": "execute-api:Invoke", "Effect": "Allow", "Resource": METHOD_ARN}]
    assert authorizer.fetched == [("https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool/.well-known/jwks.json", (3, 5))]


def test_an_expired_token_is_refused(authorizer, keypair, capsys):
    assert connect(authorizer, sign(keypair, claims(exp=int(time.time()) - 1))) is None
    assert "Token is expired" in capsys.readouterr().out


def test_a_token_for_another_app_client_is_refused(authorizer, keypair, capsys):
    assert connect(authorizer, sign(keypair, claims(aud="someone-elses-client"))) is None
    assert "Token was not issued for this audience" in capsys.readouterr().out


def test_an_access_token_which_has_no_audience_is_refused(authorizer, keypair):
    access = claims(token_use="access", client_id="client-123")
    del access["aud"]
    assert connect(authorizer, sign(keypair, access)) is None


def test_a_tampered_payload_fails_signature_verification(authorizer, keypair, capsys):
    header, _, signature = sign(keypair, claims()).split(".")
    forged_payload = _b64url(json.dumps(claims(sub="someone-else")).encode())

    assert connect(authorizer, f"{header}.{forged_payload}.{signature}") is None
    assert "Signature verification failed" in capsys.readouterr().out


def test_a_token_signed_by_an_unknown_key_never_gets_a_policy(authorizer, keypair):
    with pytest.raises(KeyError):
        connect(authorizer, sign(keypair, claims(), kid="attacker-key"))
