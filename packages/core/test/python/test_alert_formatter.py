import json

import boto3
import pytest

from conftest import LIB, load_handler

FORMATTER = LIB / "monitoring" / "functions" / "alert-formatter" / "handler.py"


def _setup(monkeypatch, stage):
    sns = boto3.client("sns", region_name="us-east-1")
    sqs = boto3.client("sqs", region_name="us-east-1")
    topic = sns.create_topic(Name="alerts")["TopicArn"]
    queue = sqs.create_queue(QueueName="slack")["QueueUrl"]
    queue_arn = sqs.get_queue_attributes(QueueUrl=queue, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=queue_arn, Attributes={"RawMessageDelivery": "true"})
    monkeypatch.setenv("ALERT_TOPIC_ARN", topic)
    monkeypatch.setenv("STAGE", stage)
    monkeypatch.setenv("ALARM_PREFIX", "grantwell-generic-prod ")
    module = load_handler(FORMATTER, f"alert_formatter_{stage}")

    def delivered():
        messages = sqs.receive_message(QueueUrl=queue, MaxNumberOfMessages=10).get("Messages", [])
        return [m["Body"] for m in messages]

    return module, delivered


@pytest.fixture
def prod(aws, monkeypatch):
    return _setup(monkeypatch, "prod")


@pytest.fixture
def dev(aws, monkeypatch):
    return _setup(monkeypatch, "dev")


def alarm(**overrides):
    base = {
        "AlarmName": "grantwell-generic-prod chat failing",
        "AlarmDescription": "[critical] Users can't get answers from the chat.",
        "NewStateValue": "ALARM",
        "OldStateValue": "OK",
        "NewStateReason": "Threshold Crossed: 1 datapoint [8.0 (09/10/26 14:05:00)] was greater than the threshold (5.0).",
        "StateChangeTime": "2026-10-09T14:06:12.000+0000",
        "Trigger": {
            "MetricName": "Errors", "Namespace": "AWS/Lambda", "Period": 300, "Threshold": 5.0,
            "ComparisonOperator": "GreaterThanOrEqualToThreshold",
            "Dimensions": [{"name": "FunctionName", "value": "grantwell-staging-ChatHandler"}],
        },
    }
    return {**base, **overrides}


def sns_event(*messages):
    return {"Records": [{"Sns": {"Message": m if isinstance(m, str) else json.dumps(m)}} for m in messages]}


def test_a_prod_alarm_becomes_a_red_card_naming_the_impact_and_the_function(prod):
    formatter, delivered = prod

    formatter.lambda_handler(sns_event(alarm()), None)

    [card] = [json.loads(m) for m in delivered()]
    content = card["content"]
    assert content["title"] == ":red_circle: chat failing · prod"
    assert content["description"].splitlines()[0] == "Users can't get answers from the chat."
    assert "• observed: 8 errors in 5 min" in content["description"]
    assert "• resource: `grantwell-staging-ChatHandler`" in content["description"]
    assert content["nextSteps"][0].endswith("|Logs>")
    assert card["metadata"]["threadId"] == "grantwell-generic-prod-chat-failing"


def test_dev_never_shows_red(dev):
    formatter, delivered = dev

    formatter.lambda_handler(sns_event(alarm()), None)

    assert json.loads(delivered()[0])["content"]["title"].startswith(":large_yellow_circle: ")


def test_a_recovery_is_announced_without_next_steps(prod):
    formatter, delivered = prod

    formatter.lambda_handler(sns_event(alarm(NewStateValue="OK", OldStateValue="ALARM")), None)

    content = json.loads(delivered()[0])["content"]
    assert content["title"] == ":white_check_mark: Back to normal · prod"
    assert "nextSteps" not in content


def test_a_new_alarm_coming_online_is_not_news(prod):
    formatter, delivered = prod

    result = formatter.lambda_handler(sns_event(alarm(NewStateValue="OK", OldStateValue="INSUFFICIENT_DATA")), None)

    assert json.loads(result["body"]) == {"published": 0}
    assert delivered() == []


def test_a_message_it_cannot_parse_is_passed_through_never_dropped(prod):
    formatter, delivered = prod

    formatter.lambda_handler(sns_event("not json at all", {"hello": "world"}), None)

    assert sorted(delivered()) == sorted(["not json at all", json.dumps({"hello": "world"})])
