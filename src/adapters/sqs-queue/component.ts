import { ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { ReceiveMessagesOptions } from '@dcl/core-commons'
import { createSqsComponent } from '@dcl/sqs-component'
import { MESSAGE_ATTRIBUTES_FIELD, SOURCE_CONTENT_SERVER_URL_ATTRIBUTE } from './types'
import { isRecord } from '../../utils/typeGuards'
import type { ISqsQueueComponent, MessageAttributes } from './types'
import type { AppComponents } from '../../types'
import type { Message } from '@aws-sdk/client-sqs'

/**
 * Moves the SQS message attributes into the (raw-delivery) JSON body under
 * `MESSAGE_ATTRIBUTES_FIELD`, replacing any value the producer put there. A body that is
 * not a JSON object is returned untouched for the consumer to reject.
 *
 * @param message - The received SQS message
 * @returns The message with its body rewritten
 */
export function attachMessageAttributes(message: Message): Message {
  if (typeof message.Body !== 'string') {
    return message
  }

  let body: unknown
  try {
    body = JSON.parse(message.Body)
  } catch {
    return message
  }

  if (!isRecord(body) || Array.isArray(body)) {
    return message
  }

  const sourceContentServerUrl = message.MessageAttributes?.[SOURCE_CONTENT_SERVER_URL_ATTRIBUTE]?.StringValue
  const attributes: MessageAttributes = typeof sourceContentServerUrl === 'string' ? { sourceContentServerUrl } : {}

  return { ...message, Body: JSON.stringify({ ...body, [MESSAGE_ATTRIBUTES_FIELD]: attributes }) }
}

/**
 * Reads the attributes `attachMessageAttributes` put on an event.
 *
 * @param event - The parsed event handed to a queue handler
 * @returns The message attributes; empty when none were delivered
 */
export function readMessageAttributes(event: unknown): MessageAttributes {
  const attributes = isRecord(event) ? event[MESSAGE_ATTRIBUTES_FIELD] : undefined
  const sourceContentServerUrl = isRecord(attributes) ? attributes.sourceContentServerUrl : undefined
  return typeof sourceContentServerUrl === 'string' ? { sourceContentServerUrl } : {}
}

/**
 * Creates the SQS queue adapter. Wraps `@dcl/sqs-component`, whose `receiveMessages` does not
 * request message attributes: with raw delivery SNS message attributes arrive as SQS message
 * attributes only when asked for. Every other operation is the library's.
 *
 * @param components - Required components: config (AWS_SQS_QUEUE_URL, optional AWS_SQS_ENDPOINT)
 * @returns The queue component
 */
export async function createSqsQueueComponent(components: Pick<AppComponents, 'config'>): Promise<ISqsQueueComponent> {
  const { config } = components
  const queueUrl = await config.requireString('AWS_SQS_QUEUE_URL')
  const endpoint = await config.getString('AWS_SQS_ENDPOINT')
  const base = await createSqsComponent(config)
  const client = new SQSClient(endpoint ? { endpoint } : {})

  // Mirrors @dcl/sqs-component 2.2.6 receiveMessages (same client config, 60s visibility,
  // 20s wait, abortSignal) plus MessageAttributeNames; re-check on upgrade.
  async function receiveMessages(amount = 1, options?: ReceiveMessagesOptions): Promise<Message[]> {
    const { Messages = [] } = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: amount,
        VisibilityTimeout: options?.visibilityTimeout ?? 60,
        WaitTimeSeconds: options?.waitTimeSeconds ?? 20,
        MessageAttributeNames: [SOURCE_CONTENT_SERVER_URL_ATTRIBUTE]
      }),
      { abortSignal: options?.abortSignal }
    )
    return Messages.map(attachMessageAttributes)
  }

  return { ...base, receiveMessages }
}
