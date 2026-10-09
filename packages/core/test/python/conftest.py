"""Shared fixtures for the Python Lambda handler tests.

Handlers build their boto3 clients and read env vars at import, so each test loads its handler
after moto is active and the env is set. Every handler file is named lambda_function.py, so each
is loaded by path under its own module name.
"""
import importlib.util
import os
import sys
from pathlib import Path

# Bytecode next to a handler would land in its Lambda asset and change the hash.
sys.dont_write_bytecode = True

import boto3  # noqa: E402
import pytest  # noqa: E402
from moto import mock_aws  # noqa: E402

LIB = Path(__file__).resolve().parents[2] / "lib"
FUNCTIONS = LIB / "chatbot-api" / "functions"
SHARED_LAYER = FUNCTIONS / "layers" / "python-shared-layer" / "python"


@pytest.fixture(autouse=True)
def fake_aws_env(monkeypatch):
    """Fake credentials so nothing can fall through to a real account."""
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SECURITY_TOKEN", "AWS_SESSION_TOKEN"):
        monkeypatch.setenv(name, "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.delenv("AWS_PROFILE", raising=False)


@pytest.fixture
def aws():
    with mock_aws():
        yield


def load_handler(path, name, extra_paths=()):
    """Import a handler file by path; extra_paths (e.g. a layer) are importable while it loads."""
    added = [str(p) for p in (path.parent, *extra_paths)]
    sys.path[:0] = added
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        for p in added:
            sys.path.remove(p)


def create_table(name, hash_key, range_key=None, range_type="S", indexes=()):
    """A DynamoDB table shaped like the one in tables.ts."""
    attrs = {hash_key: "S"}
    schema = [{"AttributeName": hash_key, "KeyType": "HASH"}]
    if range_key:
        attrs[range_key] = range_type
        schema.append({"AttributeName": range_key, "KeyType": "RANGE"})
    gsis = []
    for index_name, index_hash, index_range in indexes:
        attrs.setdefault(index_hash, "S")
        attrs.setdefault(index_range, "S")
        gsis.append({
            "IndexName": index_name,
            "KeySchema": [
                {"AttributeName": index_hash, "KeyType": "HASH"},
                {"AttributeName": index_range, "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
        })
    kwargs = {
        "TableName": name,
        "KeySchema": schema,
        "AttributeDefinitions": [{"AttributeName": k, "AttributeType": t} for k, t in attrs.items()],
        "BillingMode": "PAY_PER_REQUEST",
    }
    if gsis:
        kwargs["GlobalSecondaryIndexes"] = gsis
    boto3.client("dynamodb", region_name="us-east-1").create_table(**kwargs)
    return boto3.resource("dynamodb", region_name="us-east-1").Table(name)


def http_event(body, sub="user-1", **claims):
    """An HTTP API event carrying JWT claims, as the API's authorizer passes it."""
    import json

    return {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": sub, **claims}}}},
        "body": json.dumps(body),
    }
