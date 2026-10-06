"""Turn a CloudWatch alarm into a Chatbot custom notification a person can act on.

    alarm -> ALARM_TOPIC -> this -> ALERT_TOPIC -> Chatbot -> Slack

Chatbot's default alarm card leads with the account and buries the description.
Everything shown here is derived from the alarm itself (name = headline,
description = impact line), so adding an alarm needs no change here.
Ported from a-iep's alert-formatter.
"""
import json
import os
import re

import boto3

sns = boto3.client('sns')

ALERT_TOPIC_ARN = os.environ['ALERT_TOPIC_ARN']
STAGE = os.environ.get('STAGE', 'dev')
ALARM_PREFIX = os.environ.get('ALARM_PREFIX', '')
REGION = os.environ.get('AWS_REGION', 'us-east-1')

IS_PROD = STAGE == 'prod'

_CONSOLE = f'https://console.aws.amazon.com/cloudwatch/home?region={REGION}'

# Colour is severity. Dev fires the same alarms for broken tests, so it never shows red.
_SEVERITY_ICON = {
    'critical': ':red_circle:',
    'medium': ':large_yellow_circle:',
    'low': ':large_blue_circle:',
}
_DEV_ICON = {
    'critical': ':large_yellow_circle:',
    'medium': ':large_yellow_circle:',
    'low': ':large_blue_circle:',
}
# No firing alarm is ever green: green reads as "fine" before anyone reads the words.
_CLEARED_ICON = ':white_check_mark:'

_SEVERITY_PATTERN = re.compile(r'^\s*\[(critical|medium|low)\]\s*')


def _severity_and_text(description):
    match = _SEVERITY_PATTERN.match(description or '')
    if not match:
        return 'medium', (description or '').strip()
    return match.group(1), _SEVERITY_PATTERN.sub('', description).strip()


def _dimensions(trigger):
    """Dimensions of the alarm's metric, whether it is a single metric or math."""
    dims = trigger.get('Dimensions')
    if dims:
        return dims
    for query in trigger.get('Metrics') or []:
        metric = ((query.get('MetricStat') or {}).get('Metric')) or {}
        if metric.get('Dimensions'):
            return metric['Dimensions']
    return []


def _resource(dimensions):
    """(name, url, link label) of the resource the alarm is about, if it has one."""
    dims = {d.get('name', d.get('Name')): d.get('value', d.get('Value')) for d in dimensions or []}

    function_name = dims.get('FunctionName')
    if function_name:
        encoded = f'/aws/lambda/{function_name}'.replace('/', '$252F')
        return function_name, f'{_CONSOLE}#logsV2:log-groups/log-group/{encoded}', 'Logs'

    state_machine = dims.get('StateMachineArn')
    if state_machine:
        return state_machine.split(':')[-1], (
            f'https://console.aws.amazon.com/states/home?region={REGION}'
            f'#/statemachines/view/{state_machine}'), 'Executions'

    api_id = dims.get('ApiId')
    if api_id:
        return api_id, (f'https://console.aws.amazon.com/apigateway/main/monitor/logs'
                        f'?api={api_id}&region={REGION}'), 'API logs'

    distribution = dims.get('DistributionId')
    if distribution:
        return distribution, (f'https://console.aws.amazon.com/cloudfront/v4/home'
                              f'#/distributions/{distribution}/monitoring'), 'Distribution metrics'

    return None, None, None


def _started(alarm):
    raw = alarm.get('StateChangeTime') or ''
    match = re.match(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})', raw)
    if not match:
        return None
    _, month, day, hour, minute = match.groups()
    months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return f'{int(day)} {months[int(month)]} {hour}:{minute} UTC'


def _headline(alarm_name):
    if ALARM_PREFIX and alarm_name.startswith(ALARM_PREFIX):
        return alarm_name[len(ALARM_PREFIX):].strip() or alarm_name
    return alarm_name


_UNITS = {
    'Errors': 'errors',
    '5xx': 'server errors',
    '5xxErrorRate': '% server errors',
    'Throttles': 'throttled requests',
    'Invocations': 'runs',
    'Duration': 'ms',
    'ExecutionsFailed': 'executions failed',
    'ExecutionsTimedOut': 'executions timed out',
    'NumberOfNotificationsFailed': 'failed deliveries',
}


def _observed_phrase(alarm):
    """'8 errors in 5 min', from "Threshold Crossed: 1 datapoint [8.0 (...)] was ..."."""
    match = re.search(r'\[([0-9.]+)\s', alarm.get('NewStateReason') or '')
    if not match:
        return None
    value = float(match.group(1))
    count = str(int(value)) if value.is_integer() else f'{value:.2f}'

    trigger = alarm.get('Trigger') or {}
    unit = _UNITS.get(trigger.get('MetricName'), 'events')

    period = trigger.get('Period')
    window = ''
    if isinstance(period, (int, float)) and period > 0:
        minutes = int(period // 60)
        window = f' in {minutes} min' if minutes else f' in {int(period)}s'
    return f'{count} {unit}{window}'


def _threshold_phrase(alarm):
    trigger = alarm.get('Trigger') or {}
    namespace = trigger.get('Namespace')
    metric = trigger.get('MetricName')
    threshold = trigger.get('Threshold')
    if not metric or threshold is None:
        return ''
    operators = {
        'GreaterThanOrEqualToThreshold': '>=',
        'GreaterThanThreshold': '>',
        'LessThanOrEqualToThreshold': '<=',
        'LessThanThreshold': '<',
    }
    operator = operators.get(trigger.get('ComparisonOperator'), '>=')
    if isinstance(threshold, float) and threshold.is_integer():
        threshold = int(threshold)
    subject = f'{namespace} {metric}' if namespace else metric
    return f'{subject} {operator} {threshold}'


def build_notification(alarm):
    name = alarm.get('AlarmName', 'unknown alarm')
    recovered = alarm.get('NewStateValue', 'ALARM') == 'OK'
    headline = _headline(name)
    env_label = 'prod' if IS_PROD else 'dev'

    severity, description = _severity_and_text((alarm.get('AlarmDescription') or '').strip())
    icons = _SEVERITY_ICON if IS_PROD else _DEV_ICON
    icon = _CLEARED_ICON if recovered else icons.get(severity, ':large_yellow_circle:')
    # Alarm names are present-tense problem statements, so a recovery leads with the state instead.
    title = (
        f'{icon} Back to normal · {env_label}' if recovered
        else f'{icon} {headline} · {env_label}'
    )
    if recovered:
        description = f'The "{headline}" alert has cleared. No action needed.'

    trigger = alarm.get('Trigger') or {}
    resource, link, link_label = _resource(_dimensions(trigger))

    content = {'textType': 'client-markdown', 'title': title}
    if link and not recovered:
        content['nextSteps'] = [f'<{link}|{link_label}>']

    # Chatbot drops metadata.additionalContext, so the fields go in the description.
    # Only names, counts and timestamps: never a value sourced from a log line or request.
    details = []
    observed = _observed_phrase(alarm)
    if observed and not recovered:
        details.append(('observed', observed))
    started = _started(alarm)
    if started:
        details.append(('since', started))
    details.append(('environment', env_label))
    if resource:
        details.append(('resource', f'`{resource}`'))
    threshold = _threshold_phrase(alarm)
    if threshold and not recovered:
        details.append(('trigger', threshold))

    content['description'] = '\n'.join([description, ''] + [f'• {k}: {v}' for k, v in details])

    return {
        'version': '1.0',
        'source': 'custom',
        'content': content,
        'metadata': {
            'summary': f'{headline} ({env_label})',
            'threadId': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:64],
        },
    }


def _is_alarm_coming_online(alarm):
    """An OK that isn't the end of an ALARM is a new alarm gaining data, not news."""
    return alarm.get('NewStateValue') == 'OK' and alarm.get('OldStateValue') != 'ALARM'


def lambda_handler(event, context):
    published = 0
    for record in event.get('Records', []):
        raw = (record.get('Sns') or {}).get('Message')
        try:
            alarm = json.loads(raw)
        except (TypeError, ValueError):
            # Swallowing an alert is the one failure this function must never have.
            print('Passing through a non-alarm message unchanged')
            sns.publish(TopicArn=ALERT_TOPIC_ARN, Message=raw or '')
            published += 1
            continue

        if not isinstance(alarm, dict) or 'AlarmName' not in alarm:
            print('Passing through a message that is not a CloudWatch alarm')
            sns.publish(TopicArn=ALERT_TOPIC_ARN, Message=raw)
            published += 1
            continue

        if _is_alarm_coming_online(alarm):
            print(f"Suppressing coming-online OK for {alarm.get('AlarmName')} "
                  f"(was {alarm.get('OldStateValue')})")
            continue

        notification = build_notification(alarm)
        print(f"Formatted alert for {alarm.get('AlarmName')} -> {alarm.get('NewStateValue')}")
        sns.publish(TopicArn=ALERT_TOPIC_ARN, Message=json.dumps(notification))
        published += 1

    return {'statusCode': 200, 'body': json.dumps({'published': published})}
