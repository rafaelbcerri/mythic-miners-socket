import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { auth } from '../libs/thirdweb/auth';
import { jwtDecode } from 'jwt-decode';
import {
    clients,
    sendMessage,
    parseCookies,
} from './shared';
import Player from '../models/Player';
import dbConnect from '../libs/mongodb/client';

// Lambda handler for WebSocket connect events
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId!;
    console.log('WebSocket connect event:', { connectionId });

    try {
        // Parse cookies from headers
        const cookies = parseCookies(event.headers);
        if (!cookies.jwt) {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Invalid authentication token' })
            };
        }

        const authResult = await auth.verifyJWT({ jwt: cookies.jwt });
        if (!authResult.valid) {
            console.log('Invalid JWT during connection');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Invalid authentication token' })
            };
        }

        const { sub } = jwtDecode(cookies.jwt);
        if (!sub) {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Invalid authentication token' })
            };
        }

        await dbConnect();
        const player = await Player.findOne({ address: sub }, { connectionId: 1, lastConnectedAt: 1, address: 1 });
        if (!player) {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Player not found' })
            };
        }

        player.lastConnectedAt = new Date();
        player.connectionId = connectionId;
        await player.save();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Connected successfully',
                connectionId,
            })
        };

    } catch (error) {
        console.error('Error handling connect event:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error during connection' })
        };
    }
}; 