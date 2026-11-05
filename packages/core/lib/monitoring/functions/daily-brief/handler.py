"""Once a day: what ran, how often, with how many errors, and which alarms are firing.

Alarms can't say "is anything still happening": a component that stops being
invoked raises no errors. This reports positively, so silence means something.
Ported from a-iep's daily-brief. Only names, counts and timestamps, except the chat
answer check section, which deliberately quotes questions and flagged sentences from the
chat's CHAT_CHECK log lines. It never shows who asked: no user name, email or ID.
"""
import datetime
import json
import os
import re
import time

import boto3

cloudwatch = boto3.client('cloudwatch')
sns = boto3.client('sns')
ssm = boto3.client('ssm')
logs = boto3.client('logs')

ALERT_TOPIC_ARN = os.environ['ALERT_TOPIC_ARN']
STAGE = os.environ.get('STAGE', 'dev')
# [{label, functionName, purpose}] from CDK, in SSM because Lambda env vars cap at 4 KB.
BRIEF_COMPONENTS_PARAM = os.environ.get('BRIEF_COMPONENTS_PARAM', '')
# Scopes DescribeAlarms to this deployment: the account is shared.
ALARM_PREFIX = os.environ.get('ALARM_PREFIX', '')
CHAT_LOG_GROUP = os.environ.get('CHAT_LOG_GROUP', '')

IS_PROD = STAGE == 'prod'
WINDOW_HOURS = 24

OK = ':white_check_mark:'
IDLE = ':zzz:'
PROBLEM = ':rotating_light:'
WARN = ':warning:'
FLAG = ':mag:'

CHECK_MARKER = 'CHAT_CHECK '
CHECK_LIST_LIMIT = 10
CHECK_SENTENCES_PER_ANSWER = 5
QUESTION_MAX_CHARS = 200
SENTENCE_MAX_CHARS = 200
REASON_MAX_CHARS = 150
QUERY_WAIT_SECONDS = 60
CHECK_COUNTS_QUERY = (
    "filter @message like 'CHAT_CHECK {'"
    " | fields strcontains(@message, 'CHAT_CHECK {\"error\"') as failed,"
    " strcontains(@message, '\"flagged\":[{') as flagged"
    " | stats count(*) as lines, sum(failed) as failures, sum(flagged) as flags"
)
FLAGGED_QUERY = (
    'fields @timestamp, @message'
    ' | filter @message like /CHAT_CHECK \\{.*"flagged":\\[\\{/'
    ' | sort @timestamp desc'
)


def _components():
    """(components, could_not_read). An unreadable manifest must never read as all green."""
    if not BRIEF_COMPONENTS_PARAM:
        return [], True
    try:
        value = ssm.get_parameter(Name=BRIEF_COMPONENTS_PARAM)['Parameter']['Value']
        return json.loads(value), False
    except Exception as error:  # noqa: BLE001
        print(f'BRIEF_MANIFEST_UNREADABLE {type(error).__name__}')
        return [], True


def _metric_queries(components):
    queries = []
    for index, component in enumerate(components):
        for stat_name, metric in (('inv', 'Invocations'), ('err', 'Errors')):
            queries.append({
                'Id': f'{stat_name}{index}',
                'MetricStat': {
                    'Metric': {
                        'Namespace': 'AWS/Lambda',
                        'MetricName': metric,
                        'Dimensions': [{'Name': 'FunctionName', 'Value': component['functionName']}],
                    },
                    'Period': WINDOW_HOURS * 3600,
                    'Stat': 'Sum',
                },
                'ReturnData': True,
            })
    return queries


def _totals(components, start, end):
    totals = {index: [0, 0] for index in range(len(components))}
    queries = _metric_queries(components)
    for chunk_start in range(0, len(queries), 500):
        chunk = queries[chunk_start:chunk_start + 500]
        paginator = cloudwatch.get_paginator('get_metric_data')
        for page in paginator.paginate(MetricDataQueries=chunk, StartTime=start, EndTime=end):
            for result in page.get('MetricDataResults', []):
                identifier = result['Id']
                index = int(identifier[3:])
                value = sum(result.get('Values') or [])
                totals[index][0 if identifier.startswith('inv') else 1] = int(value)
    return totals


def _alarms_now():
    kwargs = {'StateValue': 'ALARM'}
    if ALARM_PREFIX:
        kwargs['AlarmNamePrefix'] = ALARM_PREFIX
    firing = []
    paginator = cloudwatch.get_paginator('describe_alarms')
    for page in paginator.paginate(**kwargs):
        for alarm in page.get('MetricAlarms', []):
            firing.append(alarm['AlarmName'])
    return firing


def _component_lines(components, totals):
    lines, problems, ran, idle = [], 0, 0, 0
    ordered = sorted(
        range(len(components)),
        key=lambda i: (totals[i][1] == 0, components[i]['label'].lower()),
    )
    for index in ordered:
        component = components[index]
        invocations, errors = totals[index]
        if errors:
            icon, problems = PROBLEM, problems + 1
        elif invocations:
            icon, ran = OK, ran + 1
        else:
            icon, idle = IDLE, idle + 1
        lines.append(
            f"{icon} {component['label']} — {invocations} runs, {errors} errors"
            f" · {component['purpose']}"
        )
    return lines, problems, ran, idle


def _start_query(query, start, end, limit):
    return logs.start_query(
        logGroupName=CHAT_LOG_GROUP,
        startTime=int(start.timestamp()),
        endTime=int(end.timestamp()),
        queryString=query,
        limit=limit,
    )['queryId']


def _query_rows(query_ids):
    """Rows per query, as dicts. Raises if a query fails or outlasts the wait."""
    rows, pending = {}, list(query_ids)
    deadline = time.monotonic() + QUERY_WAIT_SECONDS
    while pending:
        for query_id in list(pending):
            result = logs.get_query_results(queryId=query_id)
            status = result.get('status')
            if status == 'Complete':
                rows[query_id] = [
                    {cell['field']: cell.get('value') for cell in row}
                    for row in result.get('results', [])
                ]
                pending.remove(query_id)
            elif status in ('Failed', 'Cancelled', 'Timeout', 'Unknown'):
                raise RuntimeError(f'query {status}')
        if pending:
            if time.monotonic() >= deadline:
                raise TimeoutError('query still running')
            time.sleep(1)
    return rows


def _check_line(message):
    """The JSON after the marker, or None."""
    index = (message or '').find(CHECK_MARKER)
    if index < 0:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(message[index + len(CHECK_MARKER):])
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def _clip(text, limit):
    text = ' '.join(str(text or '').split())
    return text if len(text) <= limit else text[:limit - 1] + '…'


_SLACK_ANGLE_LINK = re.compile(r'<((?:[A-Za-z][A-Za-z0-9+.-]*:|[@#!])[^<>|]*)(?:\|([^<>]*))?>')
_MARKDOWN_LINK = re.compile(r'\[([^\[\]]*)\]\(([^()\s]*)\)')


def _slack_text(text, limit):
    """User-derived text for Slack: links reduced to their label, then & < > escaped, so nothing
    in it can link, mention (<!channel>, <@U...>) or reformat the message."""
    text = _SLACK_ANGLE_LINK.sub(lambda m: m.group(2) if m.group(2) is not None else m.group(1),str(text or ''))
    text = _MARKDOWN_LINK.sub(lambda m: m.group(1), text)
    text = _clip(text, limit)
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _int(value):
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _flagged_answer_lines(entry):
    """Only these fields are read, so nothing else in a log line can reach Slack."""
    grant = _slack_text(entry.get('grant') or 'unknown grant', 120)
    session = _slack_text(entry.get('session') or 'unknown', 80).replace('`', "'")
    lines = [
        f'{FLAG} *{grant}* · chat `{session}`',
        f'    Q: "{_slack_text(entry.get("question"), QUESTION_MAX_CHARS)}"',
    ]
    flagged = [f for f in entry.get('flagged') or [] if isinstance(f, dict)]
    for item in flagged[:CHECK_SENTENCES_PER_ANSWER]:
        reason = _slack_text(item.get('reason') or item.get('kind') or 'not confirmed', REASON_MAX_CHARS)
        lines.append(f'    • "{_slack_text(item.get("text"), SENTENCE_MAX_CHARS)}" — {reason}')
    if len(flagged) > CHECK_SENTENCES_PER_ANSWER:
        lines.append(f'    • and {len(flagged) - CHECK_SENTENCES_PER_ANSWER} more sentence(s)')
    return lines


def _chat_check_lines(start, end):
    """The chat answer check section. Never raises: a failed query says so in the brief."""
    if not CHAT_LOG_GROUP:
        return []
    title = 'Chat answer check (answers are sent first, then checked against the grant):'
    try:
        counts_id = _start_query(CHECK_COUNTS_QUERY, start, end, 1)
        list_id = _start_query(FLAGGED_QUERY, start, end, CHECK_LIST_LIMIT)
        rows = _query_rows([counts_id, list_id])
    except Exception as error:  # noqa: BLE001
        print(f'CHAT_CHECK_QUERY_FAILED {type(error).__name__}')
        return ['', title, f'{WARN} Could not read the chat answer checks ({type(error).__name__}).']

    totals = (rows[counts_id] or [{}])[0]
    lines, failures, flags = _int(totals.get('lines')), _int(totals.get('failures')), _int(totals.get('flags'))
    checked = lines - failures
    failed_note = f', {failures} check(s) failed to run' if failures else ''
    section = ['', title]
    if not lines:
        section.append(f'{IDLE} No answers checked in the last 24h.')
        return section
    if not flags:
        section.append(f'{OK} {checked} answer(s) checked in the last 24h, none flagged{failed_note}.')
        return section

    section.append(f'{WARN} {checked} answer(s) checked in the last 24h, {flags} flagged{failed_note}.')
    entries = [e for e in (_check_line(r.get('@message')) for r in rows[list_id]) if e]
    for entry in entries[:CHECK_LIST_LIMIT]:
        section.extend(_flagged_answer_lines(entry))
    more = flags - min(len(entries), CHECK_LIST_LIMIT)
    if more > 0:
        section.append(
            f'…and {more} more. To list them all, run this in CloudWatch Logs Insights on '
            f'`{CHAT_LOG_GROUP}` over the last 24 hours:'
        )
        section.append(f'```{FLAGGED_QUERY}```')
    return section


def build_brief(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    start = now - datetime.timedelta(hours=WINDOW_HOURS)
    day = now.date().isoformat()
    env_label = 'prod' if IS_PROD else 'dev'

    components, manifest_unreadable = _components()
    totals = _totals(components, start, now) if components else {}
    lines, problems, ran, idle = _component_lines(components, totals)
    firing = _alarms_now()
    check_lines = _chat_check_lines(start, now)

    count = problems + len(firing)
    if count:
        icon = WARN
        headline = f'GrantWell daily brief — {day} — {count} problem(s) in the last 24h'
    elif manifest_unreadable:
        icon = WARN
        headline = f'GrantWell daily brief — {day} — could not read what it is meant to check'
    else:
        icon = OK
        headline = f'GrantWell daily brief — {day} — all green ({ran} ran, {idle} idle)'

    body = list(lines)
    if manifest_unreadable:
        body.append('The list of things to check could not be read, so nothing below '
                    'was measured. Any alarms firing right now are still listed.')
    if firing:
        body.append('')
        body.append('Alarms firing right now:')
        body.extend(f'{PROBLEM} {name}' for name in firing)
    body.extend(check_lines)

    return {
        'version': '1.0',
        'source': 'custom',
        'content': {
            'textType': 'client-markdown',
            'title': f'{icon} {headline} · {env_label}',
            'description': '\n'.join(body) if body else 'Nothing is configured to report.',
        },
    }


def lambda_handler(event, context):
    notification = build_brief()
    sns.publish(TopicArn=ALERT_TOPIC_ARN, Message=json.dumps(notification))
    print(f"Published daily brief: {notification['content']['title']}")
    return {'statusCode': 200}
