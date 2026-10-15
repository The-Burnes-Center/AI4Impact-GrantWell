import json

import pytest

from conftest import FUNCTIONS, SHARED_LAYER, create_table, http_event, load_handler


@pytest.fixture
def sessions(aws, monkeypatch):
    monkeypatch.setenv("DDB_TABLE_NAME", "chat-history")
    table = create_table("chat-history", "user_id", "session_id", indexes=[("TimeIndex", "user_id", "time_stamp")])
    module = load_handler(FUNCTIONS / "session-handler" / "lambda_function.py", "session_handler", [SHARED_LAYER])
    module.test_table = table
    return module


def put(table, user_id, session_id, title="Chat", stamp="2026-10-01 10:00:00", doc="Grant A", history=None):
    table.put_item(Item={
        "user_id": user_id, "session_id": session_id, "title": title,
        "time_stamp": stamp, "document_identifier": doc, "chat_history": history or [],
    })


def append_body(session_id, question, answer="a", title=None):
    body = {"operation": "update_session", "user_id": "user-1", "session_id": session_id,
            "new_chat_entry": [{"user": question, "chatbot": answer, "metadata": "[]"}], "document_identifier": "Grant A"}
    if title:
        body["title"] = title
    return body


def header(sessions, session_id):
    return sessions.test_table.get_item(Key={"user_id": "user-1", "session_id": session_id})["Item"]


def history(sessions, session_id):
    res = sessions.lambda_handler(http_event({"operation": "get_session", "session_id": session_id}), None)
    return json.loads(res["body"])["chat_history"]


def test_a_spoofed_user_id_in_the_body_is_ignored(sessions):
    put(sessions.test_table, "victim", "s1", history=[{"user": "secret question"}])

    res = sessions.lambda_handler(http_event({"operation": "get_session", "session_id": "s1", "user_id": "victim"}, sub="attacker"), None)

    assert res["statusCode"] == 200
    assert json.loads(res["body"]) == {}


def test_the_owner_reads_their_session(sessions):
    put(sessions.test_table, "user-1", "s1", history=[{"user": "q", "chatbot": "a"}])

    res = sessions.lambda_handler(http_event({"operation": "get_session", "session_id": "s1"}), None)

    assert json.loads(res["body"])["chat_history"] == [{"user": "q", "chatbot": "a"}]


def test_an_api_call_without_jwt_claims_is_401(sessions):
    res = sessions.lambda_handler({"requestContext": {"http": {}}, "body": json.dumps({"operation": "list_sessions_by_user_id"})}, None)

    assert res["statusCode"] == 401


def test_the_chat_lambda_saves_by_the_user_id_it_already_authenticated(sessions):
    entry = [{"user": "Am I eligible?", "chatbot": "Yes.", "metadata": "[]"}]
    body = {"operation": "add_session", "user_id": "user-1", "session_id": "s9", "new_chat_entry": entry,
            "title": " Chat about Grant A ", "document_identifier": "Grant A"}

    assert sessions.lambda_handler({"body": json.dumps(body)}, None)["statusCode"] == 200

    assert header(sessions, "s9")["title"] == "Chat about Grant A"
    assert history(sessions, "s9") == entry


def test_update_appends_to_the_history(sessions):
    put(sessions.test_table, "user-1", "s1", history=[{"user": "q1", "chatbot": "a1"}])

    sessions.lambda_handler({"body": json.dumps(append_body("s1", "q2"))}, None)

    assert [e["user"] for e in history(sessions, "s1")] == ["q1", "q2"]


def test_each_turn_is_its_own_row_so_a_chat_can_outgrow_one_item(sessions):
    answer = "x" * 60_000
    for i in range(20):
        body = append_body("s1", f"q{i}", answer=answer, title="Chat about Grant A")
        assert sessions.lambda_handler({"body": json.dumps(body)}, None)["statusCode"] == 200

    turns = history(sessions, "s1")
    assert [e["user"] for e in turns] == [f"q{i}" for i in range(20)]
    assert all(e["chatbot"] == answer for e in turns)
    assert "chat_history" not in header(sessions, "s1")


def test_the_first_message_creates_a_listed_chat_and_turns_stay_out_of_the_list(sessions):
    sessions.lambda_handler({"body": json.dumps(append_body("s1", "q1", title=" Chat about Grant A "))}, None)
    sessions.lambda_handler({"body": json.dumps(append_body("s1", "q2", title="Chat about Grant A"))}, None)

    listed = json.loads(sessions.lambda_handler(http_event({"operation": "list_all_sessions_by_user_id"}), None)["body"])

    assert [(s["session_id"], s["title"], s["document_identifier"]) for s in listed] == [("s1", "Chat about Grant A", "Grant A")]


def test_appending_keeps_an_existing_title(sessions):
    put(sessions.test_table, "user-1", "s1", title="Chat about Grant B", history=[])

    sessions.lambda_handler({"body": json.dumps(append_body("s1", "q1", title="Chat about Grant A"))}, None)

    assert header(sessions, "s1")["title"] == "Chat about Grant B"


def test_an_old_single_row_chat_converts_when_opened(sessions):
    put(sessions.test_table, "user-1", "s1", history=[[{"user": "q1", "chatbot": "a1"}], {"user": "q2", "chatbot": "a2"}])

    res = sessions.lambda_handler(http_event({"operation": "get_session", "session_id": "s1"}), None)

    assert [e["user"] for e in json.loads(res["body"])["chat_history"]] == ["q1", "q2"]
    row = header(sessions, "s1")
    assert "chat_history" not in row and row["turn_count"] == 2
    assert [e["user"] for e in history(sessions, "s1")] == ["q1", "q2"]
    assert "turn_count" not in json.loads(res["body"])


def test_an_old_single_row_chat_converts_when_written(sessions):
    put(sessions.test_table, "user-1", "s1", history=[{"user": "q1", "chatbot": "a1"}])

    sessions.lambda_handler({"body": json.dumps(append_body("s1", "q2", title="Chat about Grant A"))}, None)

    assert "chat_history" not in header(sessions, "s1")
    assert [e["user"] for e in history(sessions, "s1")] == ["q1", "q2"]


def test_creating_a_session_again_replaces_its_turns(sessions):
    for i in range(3):
        sessions.lambda_handler({"body": json.dumps(append_body("s1", f"old{i}", title="Chat"))}, None)
    body = {"operation": "add_session", "user_id": "user-1", "session_id": "s1", "title": "Chat",
            "chat_history": [{"user": "", "chatbot": "Hello!", "metadata": ""}]}

    sessions.lambda_handler({"body": json.dumps(body)}, None)

    assert history(sessions, "s1") == [{"user": "", "chatbot": "Hello!", "metadata": ""}]


def test_deleting_a_chat_removes_its_turns(sessions):
    for i in range(3):
        sessions.lambda_handler({"body": json.dumps(append_body("s1", f"q{i}", title="Chat"))}, None)
    sessions.lambda_handler({"body": json.dumps(append_body("s2", "keep", title="Chat"))}, None)

    res = sessions.lambda_handler(http_event({"operation": "delete_session", "session_id": "s1"}), None)

    assert res["deleted"] is True
    assert sorted(i["session_id"] for i in sessions.test_table.scan()["Items"]) == ["s2", "s2#turn#000001"]


def test_a_session_id_with_the_turn_separator_is_rejected(sessions):
    sessions.lambda_handler({"body": json.dumps(append_body("s1", "q1", title="Chat"))}, None)

    res = sessions.lambda_handler(http_event({"operation": "get_session", "session_id": "s1#turn#000001"}), None)

    assert res["statusCode"] == 400


def test_listing_returns_only_the_callers_15_newest_sessions(sessions):
    for i in range(20):
        put(sessions.test_table, "user-1", f"s{i:02d}", title=f"Chat {i}", stamp=f"2026-10-01 10:{i:02d}:00")
    put(sessions.test_table, "user-2", "other", title="Not yours", stamp="2026-10-02 00:00:00")

    listed = json.loads(sessions.lambda_handler(http_event({"operation": "list_sessions_by_user_id"}), None)["body"])

    assert len(listed) == 15
    assert listed[0]["title"] == "Chat 19"
    assert "Not yours" not in [s["title"] for s in listed]

    everything = json.loads(sessions.lambda_handler(http_event({"operation": "list_all_sessions_by_user_id"}), None)["body"])
    assert len(everything) == 20


def test_delete_only_reaches_the_callers_own_session(sessions):
    put(sessions.test_table, "victim", "s1")
    put(sessions.test_table, "user-1", "s1")

    res = sessions.lambda_handler(http_event({"operation": "delete_session", "session_id": "s1", "user_id": "victim"}), None)

    assert res["deleted"] is True
    assert [i["user_id"] for i in sessions.test_table.scan()["Items"]] == ["victim"]


def test_a_missing_session_id_is_a_400_not_a_500(sessions):
    res = sessions.lambda_handler(http_event({"operation": "get_session"}), None)

    assert res["statusCode"] == 400
    assert "session_id is required" in res["body"]
