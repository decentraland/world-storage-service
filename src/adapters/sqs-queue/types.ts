import type { IQueueComponent } from '@dcl/sqs-component'

/** SQS queue whose received message bodies carry the message attributes the handlers read. */
export type ISqsQueueComponent = IQueueComponent

/** SNS message attribute naming the worlds server that published the event. */
export const SOURCE_CONTENT_SERVER_URL_ATTRIBUTE = 'sourceContentServerUrl'

/**
 * Body field the queue adapter sets from the SQS message attributes, since
 * `@dcl/queue-consumer-component` hands handlers only the parsed body. Any producer-supplied
 * value is stripped first, so only the transport attribute can set it.
 */
export const MESSAGE_ATTRIBUTES_FIELD = '__messageAttributes'

export interface MessageAttributes {
  sourceContentServerUrl?: string
}
