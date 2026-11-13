import hashlib

import boto3
import pytest

from conftest import FUNCTIONS, create_table, http_event, load_handler

KEY = "user-1/documents/budget.pdf"


@pytest.fixture
def delete(aws, monkeypatch):
    monkeypatch.setenv("USER_DOCUMENTS_BUCKET", "user-docs")
    monkeypatch.setenv("SYNC_KB_FUNCTION_NAME", "stack-syncKBFunction")
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="user-docs")
    module = load_handler(FUNCTIONS / "knowledge-management" / "delete-document" / "lambda_function.py", "delete_document")
    invoked = []
    monkeypatch.setattr(module.lambda_client, "invoke", lambda **kwargs: invoked.append(kwargs))
    module.invoked = invoked
    module.s3_client = s3
    return module


def caller(body):
    return http_event(body, **{"cognito:username": "user-1"})


def test_deletes_the_file_and_its_metadata_by_its_real_key(delete):
    for key in ("user-1/Old Grant//letter.pdf", "user-1/Old Grant//letter.pdf.metadata.json"):
        delete.s3_client.put_object(Bucket="user-docs", Key=key, Body=b"x")

    res = delete.lambda_handler(caller({"KEY": "user-1/Old Grant//letter.pdf"}), None)

    assert res["statusCode"] == 200
    assert delete.s3_client.list_objects_v2(Bucket="user-docs").get("KeyCount") == 0


@pytest.mark.parametrize("key", ["user-2/documents/budget.pdf", "user-1/../user-2/budget.pdf", "user-1/./x.pdf"])
def test_refuses_keys_outside_the_callers_folder(delete, key):
    res = delete.lambda_handler(caller({"KEY": key}), None)

    assert res["statusCode"] == 403
    assert delete.invoked == []


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()[:32]


def test_deletes_the_documents_type_and_relevance_rows_and_nothing_else(delete, monkeypatch):
    table = create_table("user-document-table", "user_id", "sk")
    monkeypatch.setattr(delete, "DOCUMENT_TABLE", "user-document-table")
    other = "user-1/documents/other.pdf"
    kept = [f"DOC#{_hash(other)}", f"REL#{_hash(other)}#{_hash('Bridge Grant')}"]
    for sk in [f"DOC#{_hash(KEY)}", f"REL#{_hash(KEY)}#{_hash('Bridge Grant')}", f"REL#{_hash(KEY)}#{_hash('Road Grant')}", *kept]:
        table.put_item(Item={"user_id": "user-1", "sk": sk})
    delete.s3_client.put_object(Bucket="user-docs", Key=KEY, Body=b"x")

    res = delete.lambda_handler(caller({"KEY": KEY}), None)

    assert res["statusCode"] == 200
    assert sorted(item["sk"] for item in table.scan()["Items"]) == sorted(kept)
