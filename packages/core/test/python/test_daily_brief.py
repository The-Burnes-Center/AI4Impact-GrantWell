import datetime
import json

import pytest

from conftest import LIB, load_handler

BRIEF = LIB / "monitoring" / "functions" / "daily-brief" / "handler.py"
LOG_GROUP = "/aws/lambda/grantwell-staging-ChatHandler"
NOW = datetime.datetime(2026, 11, 4, 13, 0, tzinfo=datetime.timezone.utc)


class Paginator:
    def __init__(self, pages):
        self.pages = pages

    def paginate(self, **_):
        return iter(self.pages)


class FakeCloudWatch:
    def get_paginator(self, name):
        return Paginator([{"MetricDataResults": []}] if name == "get_metric_data" else [{"MetricAlarms": []}])


class FakeSsm:
    def get_parameter(self, Name):
        return {"Parameter": {"Value": json.dumps([{"label": "chat", "functionName": "chat-fn", "purpose": "answers chat"}])}}


class FakeLogs:
    """Answers the counts query and the flagged-list query; `fail` makes StartQuery raise."""

    def __init__(self, lines=(), fail=None, status="Complete"):
        self.lines = list(lines)
        self.fail = fail
        self.status = status
        self.started = []

    def start_query(self, **kwargs):
        if self.fail:
            raise self.fail
        self.started.append(kwargs)
        return {"queryId": f"q{len(self.started)}"}

    def get_query_results(self, queryId):
        query = self.started[int(queryId[1:]) - 1]
        if self.status != "Complete":
            return {"status": self.status, "results": []}
        # Compact separators, as JSON.stringify writes them.
        messages = ["2026-11-04T12:00:00.000Z\treq-1\tINFO\tCHAT_CHECK " + json.dumps(line, separators=(",", ":")) + "\n" for line in self.lines]
        if "stats" in query["queryString"]:
            failures = sum(1 for m in messages if 'CHAT_CHECK {"error"' in m)
            flags = sum(1 for m in messages if '"flagged":[{' in m)
            row = [{"field": "lines", "value": str(len(messages))}, {"field": "failures", "value": str(failures)}, {"field": "flags", "value": str(flags)}]
            return {"status": "Complete", "results": [row]}
        flagged = [m for line, m in zip(self.lines, messages) if line.get("flagged")]
        return {"status": "Complete", "results": [[{"field": "@message", "value": m}] for m in flagged[: query["limit"]]]}


@pytest.fixture
def brief(monkeypatch):
    monkeypatch.setenv("ALERT_TOPIC_ARN", "arn:aws:sns:us-east-1:111111111111:alerts")
    monkeypatch.setenv("STAGE", "prod")
    monkeypatch.setenv("BRIEF_COMPONENTS_PARAM", "/grantwell-generic-prod/daily-brief/components")
    monkeypatch.setenv("CHAT_LOG_GROUP", LOG_GROUP)
    module = load_handler(BRIEF, "daily_brief")
    module.cloudwatch = FakeCloudWatch()
    module.ssm = FakeSsm()
    monkeypatch.setattr(module.time, "sleep", lambda _: None)

    def run(fake_logs):
        module.logs = fake_logs
        return module.build_brief(now=NOW)["content"]["description"]

    return module, run


def checked(n, session="s"):
    return {"session": f"{session}{n}", "grant": "Grant A", "question": "What is due?", "sentences": 2, "flagged": [], "ms": 900}


def flagged(n, **overrides):
    return {
        "session": f"sess-{n}",
        "grant": f"Grant {n}",
        "question": f"Question {n}?",
        "sentences": 3,
        "flagged": [{"text": f"Applications are due March {n}, 2027.", "reason": "a date, amount or number in it isn't in the grant", "kind": "fact"}],
        "ms": 1200,
        **overrides,
    }


def test_queries_the_chat_log_group_for_the_last_day(brief):
    module, run = brief
    fake = FakeLogs([checked(1)])
    run(fake)
    assert [q["logGroupName"] for q in fake.started] == [LOG_GROUP, LOG_GROUP]
    assert all(q["endTime"] - q["startTime"] == 24 * 3600 for q in fake.started)
    assert fake.started[1]["limit"] == 10


def test_counts_checked_and_flagged_answers(brief):
    _, run = brief
    text = run(FakeLogs([checked(1), checked(2), flagged(1), {"error": "check timed out after 60000 ms", "session": "s9", "grant": "Grant A", "question": "Q", "ms": 60000}]))
    assert ":warning: 3 answer(s) checked in the last 24h, 1 flagged, 1 check(s) failed to run." in text
    assert ":mag: *Grant 1* · chat `sess-1`" in text
    assert '    Q: "Question 1?"' in text
    assert "    • \"Applications are due March 1, 2027.\" — a date, amount or number in it isn't in the grant" in text


def test_says_when_nothing_was_flagged(brief):
    _, run = brief
    text = run(FakeLogs([checked(1), checked(2)]))
    assert ":white_check_mark: 2 answer(s) checked in the last 24h, none flagged." in text
    assert ":mag:" not in text


def test_says_when_no_answers_were_checked(brief):
    _, run = brief
    assert ":zzz: No answers checked in the last 24h." in run(FakeLogs([]))


def test_caps_the_list_at_ten_and_gives_the_query_for_the_rest(brief):
    module, run = brief
    text = run(FakeLogs([flagged(n) for n in range(1, 14)]))
    assert text.count(":mag:") == 10
    assert "13 flagged" in text
    assert f"…and 3 more. To list them all, run this in CloudWatch Logs Insights on `{LOG_GROUP}` over the last 24 hours:" in text
    assert f"```{module.FLAGGED_QUERY}```" in text
    assert "limit" not in module.FLAGGED_QUERY


def test_clips_long_questions_and_sentences(brief):
    _, run = brief
    long_question = "Q" * 500
    long_sentence = "S" * 500
    text = run(FakeLogs([flagged(1, question=long_question, flagged=[{"text": long_sentence, "reason": "R" * 400, "kind": "meaning"}])]))
    assert f'Q: "{"Q" * 199}…"' in text
    assert f'• "{"S" * 199}…" — {"R" * 149}…' in text
    assert "Q" * 200 not in text


def test_caps_sentences_per_answer(brief):
    _, run = brief
    many = [{"text": f"Sentence {i}.", "reason": "unsupported", "kind": "meaning"} for i in range(8)]
    text = run(FakeLogs([flagged(1, flagged=many)]))
    assert "Sentence 4." in text and "Sentence 5." not in text
    assert "• and 3 more sentence(s)" in text


def test_never_shows_who_asked(brief):
    _, run = brief
    line = flagged(1, user_id="11111111-2222-3333-4444-555555555555", email="person@example.com", name="Pat Person")
    text = run(FakeLogs([line]))
    for identity in ("11111111-2222-3333-4444-555555555555", "person@example.com", "Pat Person", "user_id", "email"):
        assert identity not in text


def test_says_when_the_query_failed(brief):
    _, run = brief
    text = run(FakeLogs(fail=RuntimeError("AccessDenied")))
    assert ":warning: Could not read the chat answer checks (RuntimeError)." in text
    assert "chat — 0 runs, 0 errors" in text


def test_says_when_the_query_did_not_finish(brief):
    _, run = brief
    assert ":warning: Could not read the chat answer checks (RuntimeError)." in run(FakeLogs([flagged(1)], status="Failed"))


def test_says_when_the_query_outlasts_the_wait(brief, monkeypatch):
    module, run = brief
    monkeypatch.setattr(module, "QUERY_WAIT_SECONDS", 0)
    assert ":warning: Could not read the chat answer checks (TimeoutError)." in run(FakeLogs([flagged(1)], status="Running"))


def test_leaves_the_section_out_without_a_log_group(brief, monkeypatch):
    module, run = brief
    monkeypatch.setattr(module, "CHAT_LOG_GROUP", "")
    fake = FakeLogs([flagged(1)])
    assert "Chat answer check" not in run(fake)
    assert fake.started == []
