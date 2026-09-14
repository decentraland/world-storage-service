#!/bin/bash
set -e

echo "Creating SQS queue for world-storage-service..."
awslocal sqs create-queue --queue-name world-storage-deployments
awslocal sqs list-queues
