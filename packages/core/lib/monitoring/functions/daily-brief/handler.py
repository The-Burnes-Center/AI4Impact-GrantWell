"""Once a day: what ran, how often, with how many errors, and which alarms are firing.

Alarms can't say "is anything still happening": a component that stops being
invoked raises no errors. This reports positively, so silence means something.
Ported from a-iep's daily-brief. Only names, counts and timestamps, never log content.
"""
import datetime
import json
import os

import boto3

cloudwatch = boto3.client('cloudwatch')
sns = boto3.client('sns')
ssm = boto3.client('ssm')

ALERT_TOPIC_ARN = os.environ['ALERT_TOPIC_ARN']
STAGE = os.environ.get('STAGE', 'dev')
# [{label, functionName, purpose}] from CDK, in SSM because Lambda env vars cap at 4 KB.
BRIEF_COMPONENTS_PARAM = os.environ.get('BRIEF_COMPONENTS_PARAM', '')
# Scopes DescribeAlarms to this deployment: the account is shared.
ALARM_PREFIX = os.environ.get('ALARM_PREFIX', '')

IS_PROD = STAGE == 'prod'
WINDOW_HOURS = 24

OK = ':white_check_mark:'
IDLE = ':zzz:'
PROBLEM = ':rotating_light:'
WARN = ':warning:'


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


def build_brief(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    start = now - datetime.timedelta(hours=WINDOW_HOURS)
    day = now.date().isoformat()
    env_label = 'prod' if IS_PROD else 'dev'

    components, manifest_unreadable = _components()
    totals = _totals(components, start, now) if components else {}
    lines, problems, ran, idle = _component_lines(components, totals)
    firing = _alarms_now()

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
