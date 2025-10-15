# WebSocket Server Deployment Guide

This guide explains how to deploy the WebSocket game server to AWS using the Serverless Framework.

## Prerequisites

1. **AWS CLI** installed and configured with appropriate credentials
2. **Node.js** 18.x or later
3. **Serverless Framework** (installed as dev dependency)

## Environment Setup

1. **AWS Credentials**: Make sure you have AWS credentials configured:
   ```bash
   aws configure
   ```

2. **Environment Variables**: Your `.env` file should contain:
   ```env
   THIRDWEB_PRIVATE_KEY=your_private_key
   THIRDWEB_CLIENT_ID=your_client_id
   THIRDWEB_SECRET_KEY=your_secret_key
   WEB_URL=your_domain
   MONGODB_URI=your_mongodb_uri
   ```

## Local Development

1. **Start local serverless offline**:
   ```bash
   pnpm offline
   ```

2. **Test the WebSocket connection**:
   ```bash
   # Build the project first
   pnpm build
   
   # Run the test script
   node test-websocket.js
   ```

## Deployment

### Development Deployment
```bash
pnpm deploy:dev
```

### Production Deployment
```bash
pnpm deploy:prod
```

### General Deployment
```bash
pnpm deploy
```

## Architecture

The serverless deployment consists of:

1. **API Gateway WebSocket API**: Handles WebSocket connections
2. **Lambda Functions**: Three separate functions for different WebSocket events:
   - `websocketConnect`: Handles new WebSocket connections ($connect)
   - `websocketDisconnect`: Handles WebSocket disconnections ($disconnect)
   - `websocketMessage`: Handles incoming messages ($default)
3. **IAM Role**: Permissions for API Gateway management
4. **Shared Utilities**: Common functions for client management and messaging

### WebSocket Routes

- `$connect` → `websocketConnect` handler:
  - Validates JWT authentication
  - Creates client data and player profile
  - Sends welcome message
  - Logs connection statistics

- `$disconnect` → `websocketDisconnect` handler:
  - Logs session duration and player data
  - Cleans up client storage
  - Records analytics (in production)

- `$default` → `websocketMessage` handler:
  - Processes game messages (ping, player_data, player_update)
  - Validates JWT for each message
  - Updates player state
  - Sends responses back to client

## Configuration

### serverless.yml
- **Runtime**: Node.js 18.x
- **Memory**: 512MB
- **Timeout**: 30 seconds
- **Region**: us-east-1 (configurable)

### Environment Variables
All environment variables from your `.env` file are automatically injected into the Lambda function.

## Monitoring

### CloudWatch Logs
Lambda function logs are automatically sent to CloudWatch. You can view them in the AWS Console or using AWS CLI:

```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/websocket-game-server"
```

### API Gateway Metrics
Monitor WebSocket connections and messages in the API Gateway console.

## Scaling

The serverless architecture automatically scales based on demand:
- **Concurrent Connections**: Limited by API Gateway limits
- **Lambda Concurrency**: Automatically managed by AWS
- **Memory Usage**: Optimized for WebSocket message processing

## Cost Optimization

- **Lambda Duration**: Optimized timeout and memory settings
- **API Gateway**: Pay per message and connection minute
- **Cold Starts**: Minimized with appropriate memory allocation

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**:
   - Ensure `.env` file exists and has correct values
   - Check serverless.yml environment section

2. **WebSocket Connection Issues**:
   - Verify API Gateway endpoint URL
   - Check CORS settings if needed
   - Ensure Lambda has proper permissions

3. **JWT Verification Fails**:
   - Verify thirdweb configuration
   - Check JWT token format in cookies

### Debug Commands

```bash
# View deployment status
serverless info

# View logs for specific handlers
serverless logs -f websocketConnect
serverless logs -f websocketDisconnect
serverless logs -f websocketMessage

# View all logs
serverless logs

# Remove deployment
pnpm remove
```

## Security Considerations

1. **JWT Verification**: All messages require valid JWT tokens
2. **Connection Management**: Automatic cleanup of disconnected clients
3. **Error Handling**: Graceful handling of invalid messages
4. **Rate Limiting**: Consider implementing API Gateway rate limiting

## Next Steps

For production deployment, consider:

1. **DynamoDB Integration**: Replace in-memory client storage
2. **Redis Integration**: For real-time data sharing between Lambda instances
3. **Custom Domain**: Set up custom domain for WebSocket endpoint
4. **Monitoring**: Implement CloudWatch alarms and dashboards
5. **CI/CD**: Set up automated deployment pipeline 