import { ApiGatewayManagementApi } from 'aws-sdk';
import { ClientData, PlayerData } from '../types';
import { CryptoUtils } from '../utils/crypto';
import { bigIntReplacer } from '../utils';

// In-memory storage for connected clients (in production, use DynamoDB or Redis)
export const clients = new Map<string, ClientData>();

// API Gateway management API for sending messages
export const getApiGatewayManagementApi = (endpoint: string) => {
    // Handle local development with serverless offline
    if (process.env.IS_OFFLINE || process.env.NODE_ENV !== 'production') {
        console.log('Using local endpoint');
        return new ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: 'http://localhost:3031'
        });
    }

    // For production, use the provided endpoint
    return new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: 'https://ws.mythicminers.com'
    });
};



// Helper function to send message to a specific connection
export const sendMessage = async (connectionId: string, type: string, endpoint: string, data?: any): Promise<void> => {
    try {
        const apiGateway = getApiGatewayManagementApi(endpoint);
        const message = JSON.stringify({ type, data }, bigIntReplacer);

        await apiGateway.postToConnection({
            ConnectionId: connectionId,
            Data: message
        }).promise();

        console.log(`Message sent successfully to ${connectionId}:`, { type });
    } catch (error: any) {
        console.error('Error sending message:', error);

        // Handle specific error cases
        if (error.statusCode === 410) {
            console.log(`Connection ${connectionId} is gone, removing from clients`);
            clients.delete(connectionId);
        } else if (error.statusCode === 403) {
            console.log(`Permission denied for connection ${connectionId}`);
        } else {
            console.error(`Unexpected error sending message to ${connectionId}:`, error);
        }
    }
};

// Parse cookies from headers
export const parseCookies = (headers: { [key: string]: string | undefined }): { jwt?: string } => {
    const cookieHeader = headers.Cookie || headers.cookie;
    if (!cookieHeader) return {};

    const cookies: { [key: string]: string } = {};
    cookieHeader.split(';').forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
            cookies[name] = decodeURIComponent(value);
        }
    });

    return { jwt: cookies.jwt };
};
