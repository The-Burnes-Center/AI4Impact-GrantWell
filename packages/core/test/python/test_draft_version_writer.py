import importlib.util
import io
import os
import sys
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path

# Bytecode next to the handler would land in its Lambda asset and change the hash.
sys.dont_write_bytecode = True

FUNCTIONS = Path(__file__).resolve().parents[2] / "lib" / "chatbot-api" / "functions"


def _module(name, **attrs):
    module = types.ModuleType(name)
    module.__dict__.update(attrs)
    sys.modules[name] = module
    return module


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


def load_writer():
    boto3 = _module("boto3", resource=lambda *a, **k: types.SimpleNamespace(Table=lambda name: object()))
    _module("boto3.dynamodb")
    _module("boto3.dynamodb.conditions", Key=lambda name: None)
    _module("boto3.dynamodb.types", TypeDeserializer=object)
    boto3.dynamodb = sys.modules["boto3.dynamodb"]
    _module("botocore")
    _module("botocore.exceptions", ClientError=ClientError)
    # The real shared package imports pydantic; the writer only needs draft_versions.
    draft_versions = _load(
        "shared.draft_versions",
        FUNCTIONS / "layers" / "python-shared-layer" / "python" / "shared" / "draft_versions.py",
    )
    _module("shared", draft_versions=draft_versions)
    os.environ.setdefault("DRAFT_VERSION_TABLE_NAME", "draft-versions")
    return _load("draft_version_writer", FUNCTIONS / "draft-version-writer" / "lambda_function.py")


def record(event_id, sequence_number):
    return {
        "eventID": event_id,
        "eventName": "MODIFY",
        "dynamodb": {"SequenceNumber": sequence_number},
    }


class BatchItemFailuresTest(unittest.TestCase):
    def setUp(self):
        self.writer = load_writer()

    def run_batch(self, records, failing):
        def process(rec):
            if rec["eventID"] in failing:
                raise RuntimeError("DynamoDB unavailable")

        self.writer.process = process
        out = io.StringIO()
        with redirect_stdout(out):
            result = self.writer.lambda_handler({"Records": records}, None)
        return result, out.getvalue()

    def test_reports_the_failed_records_sequence_number(self):
        records = [record("e-1", "100"), record("e-2", "200"), record("e-3", "300")]

        result, _ = self.run_batch(records, failing={"e-2"})

        self.assertEqual(result, {"batchItemFailures": [{"itemIdentifier": "200"}]})

    def test_reports_every_failed_record(self):
        records = [record("e-1", "100"), record("e-2", "200"), record("e-3", "300")]

        result, _ = self.run_batch(records, failing={"e-1", "e-3"})

        self.assertEqual(
            result,
            {"batchItemFailures": [{"itemIdentifier": "100"}, {"itemIdentifier": "300"}]},
        )

    def test_no_failures_is_an_empty_list(self):
        result, _ = self.run_batch([record("e-1", "100")], failing=set())

        self.assertEqual(result, {"batchItemFailures": []})

    def test_failure_log_keeps_the_alarm_marker(self):
        _, logs = self.run_batch([record("e-1", "100")], failing={"e-1"})

        self.assertTrue(logs.startswith("draft-version-writer failed on "), logs)


if __name__ == "__main__":
    unittest.main()
