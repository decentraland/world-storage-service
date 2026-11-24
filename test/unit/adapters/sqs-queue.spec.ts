import { SQSClient } from '@aws-sdk/client-sqs'
import { createConfigMockedComponent } from '@dcl/core-commons'
import {
  attachMessageAttributes,
  createSqsQueueComponent,
  readMessageAttributes
} from '../../../src/adapters/sqs-queue'
import type { ISqsQueueComponent } from '../../../src/adapters/sqs-queue'
import type { Message, ReceiveMessageCommand } from '@aws-sdk/client-sqs'

describe('SqsQueueComponent', () => {
  let sendSpy: jest.SpyInstance
  let queue: ISqsQueueComponent

  beforeEach(async () => {
    sendSpy = jest.spyOn(SQSClient.prototype, 'send').mockImplementation(async () => ({
      Messages: [
        {
          ReceiptHandle: 'handle',
          Body: JSON.stringify({ type: 'world' }),
          MessageAttributes: {
            sourceContentServerUrl: { DataType: 'String', StringValue: 'https://worlds-content-server.dcl.dev' }
          }
        }
      ]
    }))
    queue = await createSqsQueueComponent({
      config: createConfigMockedComponent({
        requireString: jest.fn().mockResolvedValue('https://sqs.example.com/000000000000/queue'),
        getString: jest.fn().mockResolvedValue(undefined)
      })
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when receiving messages', () => {
    it('should request the sourceContentServerUrl message attribute', async () => {
      await queue.receiveMessages(5)
      const command = sendSpy.mock.calls[0][0] as ReceiveMessageCommand
      expect(command.input.MessageAttributeNames).toEqual(['sourceContentServerUrl'])
    })

    it('should hand the attribute to handlers through the body', async () => {
      const [message] = await queue.receiveMessages(5)
      expect(readMessageAttributes(JSON.parse(message.Body))).toEqual({
        sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
      })
    })
  })
})

describe('attachMessageAttributes', () => {
  let message: Message

  describe('when the message carries a sourceContentServerUrl attribute', () => {
    beforeEach(() => {
      message = {
        ReceiptHandle: 'handle',
        Body: JSON.stringify({ type: 'world', subType: 'world_undeployment' }),
        MessageAttributes: {
          sourceContentServerUrl: { DataType: 'String', StringValue: 'https://worlds-content-server.dcl.dev' }
        }
      }
    })

    it('should expose the attribute to the handler through the body', () => {
      const event: unknown = JSON.parse(attachMessageAttributes(message).Body ?? '')

      expect(readMessageAttributes(event)).toEqual({
        sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
      })
    })

    it('should keep the receipt handle so the message can be deleted', () => {
      expect(attachMessageAttributes(message).ReceiptHandle).toBe('handle')
    })
  })

  describe('when the body already claims a source but no attribute was delivered', () => {
    beforeEach(() => {
      message = {
        Body: JSON.stringify({
          type: 'world',
          __messageAttributes: { sourceContentServerUrl: 'https://worlds-content-server.dcl.dev' }
        })
      }
    })

    it('should strip the producer-supplied value', () => {
      const event: unknown = JSON.parse(attachMessageAttributes(message).Body ?? '')

      expect(readMessageAttributes(event)).toEqual({})
    })
  })

  describe('when the body is not JSON', () => {
    beforeEach(() => {
      message = { Body: 'not json' }
    })

    it('should return the message untouched', () => {
      expect(attachMessageAttributes(message)).toBe(message)
    })
  })
})

describe('readMessageAttributes', () => {
  describe('when the event has no attributes', () => {
    it('should return an empty object', () => {
      expect(readMessageAttributes({ type: 'world' })).toEqual({})
    })
  })
})
