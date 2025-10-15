import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import dbConnect from '../libs/mongodb/client';
import Players from '../models/Player';

// Lambda handler for WebSocket disconnect events
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId!;

    console.log('WebSocket disconnect event:', { connectionId });

    await dbConnect();
    await Players.updateOne({ connectionId }, { $set: { connectionId: null, lastConnectedAt: null } });

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Disconnected successfully',
            connectionId
        })
    };
}; 